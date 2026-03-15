import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { execFileSync, spawn } from 'child_process';
import type { ClientTarget, MessageEcho } from './types.ts';
import { IntentSpaceClient } from './client.ts';
import { REGISTRATION_SPACE_ID, RITUAL_GREETING_CONTENT, TUTORIAL_SPACE_ID } from './station-contract.ts';

export type AgentTarget = 'codex' | 'claude' | 'pi' | 'scripted-dojo';
export type RunStatus = 'passed' | 'failed' | 'timeout' | 'unavailable';
export type FailureStage =
  | 'completed'
  | 'pre-dojo'
  | 'registration'
  | 'challenge-response'
  | 'tutorial-navigation'
  | 'decline-recovery'
  | 'accept'
  | 'assess'
  | 'timeout'
  | 'unavailable'
  | 'unknown';

export type RunCleanliness = 'single-pass' | 'self-repaired';
export type HelperMode = 'none' | 'generated-not-executed' | 'generated-executed';

export interface HarnessOptions {
  repoRoot: string;
  outputDir: string;
  agents: AgentTarget[];
  trials: number;
  attachOnly?: boolean;
  host?: string;
  port?: number;
  academyPort?: number;
  timeoutMs?: number;
}

export interface StageHandle {
  academyPort: number;
  host: string;
  port: number;
  stop: () => Promise<void>;
}

export interface RunSummary {
  agent: AgentTarget;
  trial: number;
  prompt: string;
  status: RunStatus;
  failureStage: FailureStage;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  unavailableReason?: string;
  runDir: string;
  workspaceDir: string;
  stdoutPath: string;
  stderrPath: string;
  transcriptPath: string;
  generatedFiles: string[];
  agentId?: string;
  agentIds: string[];
  cleanliness: RunCleanliness;
  repairSignals: string[];
  helperMode: HelperMode;
  helperFiles: string[];
  helperLanguage?: string;
}

const DEFAULT_RUN_CLASSIFICATION = {
  agentIds: [] as string[],
  cleanliness: 'single-pass' as RunCleanliness,
  repairSignals: [] as string[],
  helperMode: 'none' as HelperMode,
  helperFiles: [] as string[],
  helperLanguage: undefined as string | undefined,
};

interface MonitorHandle {
  stop: () => Promise<void>;
  transcript: MessageEcho[];
}

interface AgentRecipe {
  command: string;
  args: (ctx: RecipeContext) => string[];
  inputMode?: 'arg' | 'stdin';
  unavailableReason?: string;
  promptTransform?: (prompt: string, ctx: RecipeContext) => string;
}

interface RunningProcess {
  child: ReturnType<typeof spawn>;
  waitForExit: Promise<number | null>;
}

interface RecipeContext {
  repoRoot: string;
  workspaceDir: string;
  prompt: string;
}

const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_STATION_PORT = 4000;
const DEFAULT_ACADEMY_PORT = 8080;

export async function runHarness(options: HarnessOptions): Promise<{ reportPath: string; summaries: RunSummary[] }> {
  const repoRoot = resolve(options.repoRoot);
  const outputDir = resolve(options.outputDir);
  mkdirSync(outputDir, { recursive: true });

  const stage = options.attachOnly
    ? createAttachedStage(options)
    : await startLocalDojo({
      repoRoot,
      host: options.host ?? DEFAULT_HOST,
      port: options.port ?? DEFAULT_STATION_PORT,
      academyPort: options.academyPort ?? DEFAULT_ACADEMY_PORT,
      logDir: join(outputDir, 'dojo'),
    });

  const summaries: RunSummary[] = [];
  try {
    for (const agent of options.agents) {
      for (let trial = 1; trial <= options.trials; trial += 1) {
        summaries.push(await runSingleTrial(agent, trial, {
          repoRoot,
          outputDir,
          stage,
          timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        }));
      }
    }
  } finally {
    await stage.stop();
  }

  const reportPath = join(outputDir, 'report.json');
  writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), summaries }, null, 2));
  writeFileSync(join(outputDir, 'report.md'), renderMarkdownReport(summaries));
  return { reportPath, summaries };
}

async function runSingleTrial(
  agent: AgentTarget,
  trial: number,
  ctx: {
    repoRoot: string;
    outputDir: string;
    stage: StageHandle;
    timeoutMs: number;
  },
): Promise<RunSummary> {
  const runDir = join(ctx.outputDir, agent, `trial-${String(trial).padStart(2, '0')}`);
  const workspaceDir = join(runDir, 'workspace');
  mkdirSync(workspaceDir, { recursive: true });

  const stdoutPath = join(runDir, 'stdout.log');
  const stderrPath = join(runDir, 'stderr.log');
  const transcriptPath = join(runDir, 'station-transcript.jsonl');
  const prompt = buildPrompt({
    skillPackPath: join(ctx.repoRoot, 'docs/academy/skill-pack/SKILL.md'),
    academyDocPath: join(ctx.repoRoot, 'docs/academy/agent-setup.md'),
    academyUrl: `http://localhost:${ctx.stage.academyPort}/agent-setup.md`,
    stationEndpoint: `tcp://${ctx.stage.host}:${ctx.stage.port}`,
    workspaceDir,
  });

  const startedAt = new Date();
  const monitor = await startMonitor({ host: ctx.stage.host, port: ctx.stage.port }, transcriptPath);
  try {
    const recipe = getRecipe(agent);
    if (!recipe) {
      const endedAt = new Date();
      return {
        agent,
        trial,
        prompt,
        status: 'unavailable',
        failureStage: 'unavailable',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        exitCode: null,
        timedOut: false,
        unavailableReason: `No recipe configured for ${agent}`,
        runDir,
        workspaceDir,
        stdoutPath,
        stderrPath,
        transcriptPath,
        generatedFiles: listFiles(workspaceDir),
        ...DEFAULT_RUN_CLASSIFICATION,
      };
    }

    if (recipe.unavailableReason) {
      const endedAt = new Date();
      return {
        agent,
        trial,
        prompt,
        status: 'unavailable',
        failureStage: 'unavailable',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        exitCode: null,
        timedOut: false,
        unavailableReason: recipe.unavailableReason,
        runDir,
        workspaceDir,
        stdoutPath,
        stderrPath,
        transcriptPath,
        generatedFiles: listFiles(workspaceDir),
        ...DEFAULT_RUN_CLASSIFICATION,
      };
    }

    const missing = !commandExists(recipe.command);
    if (missing) {
      const endedAt = new Date();
      return {
        agent,
        trial,
        prompt,
        status: 'unavailable',
        failureStage: 'unavailable',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        exitCode: null,
        timedOut: false,
        unavailableReason: `${recipe.command} is not installed`,
        runDir,
        workspaceDir,
        stdoutPath,
        stderrPath,
        transcriptPath,
        generatedFiles: listFiles(workspaceDir),
        ...DEFAULT_RUN_CLASSIFICATION,
      };
    }

    const processHandle = launchRecipe(recipe, { repoRoot: ctx.repoRoot, workspaceDir, prompt }, {
      stdoutPath,
      stderrPath,
    });
    const execution = await awaitRunCompletion(processHandle, monitor, ctx.timeoutMs);
    await sleep(300);

    const endedAt = new Date();
    const generatedFiles = listFiles(workspaceDir);
    const classification = classifyRun(monitor.transcript, generatedFiles);
    const status: RunStatus = classification.failureStage === 'completed'
      ? 'passed'
      : execution.timedOut
        ? 'timeout'
        : 'failed';

    const summary: RunSummary = {
      agent,
      trial,
      prompt,
      status,
      failureStage: classification.failureStage === 'completed'
        ? 'completed'
        : execution.timedOut
          ? 'timeout'
          : classification.failureStage,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      runDir,
      workspaceDir,
      stdoutPath,
      stderrPath,
      transcriptPath,
      generatedFiles,
      agentId: classification.agentId,
      agentIds: classification.agentIds,
      cleanliness: classification.cleanliness,
      repairSignals: classification.repairSignals,
      helperMode: classification.helperMode,
      helperFiles: classification.helperFiles,
      helperLanguage: classification.helperLanguage,
    };

    writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    await monitor.stop();
  }
}

function buildPrompt(input: {
  skillPackPath: string;
  academyDocPath: string;
  academyUrl: string;
  stationEndpoint: string;
  workspaceDir: string;
}): string {
  return [
    `Use the skill pack at ${input.skillPackPath} and complete the dojo.`,
    `The academy reference is at ${input.academyDocPath} and also served at ${input.academyUrl}.`,
    `The local station endpoint is ${input.stationEndpoint}.`,
    `Store any local state you need inside ${input.workspaceDir}.`,
    'Use the documentation and the live tutor responses as your source of truth.',
    'Do not inspect old runs or historical agent transcripts to infer the sequence.',
    'For this local harness run, obey the provided endpoint scheme literally.',
    'If the endpoint starts with tcp://, use plain TCP. Do not switch to TLS.',
    'After observing the initial service intents, proceed directly to your own registration flow.',
    'Do not do exploratory probing or trial runs before your real run.',
    'Implement the client flow once, then execute it against the live station.',
    'Only scan spaces that are part of your own live run: root for initial observation, your registration intent subspace for the challenge, tutorial for your own greeting, and your greeting intent subspace for the ritual.',
    'Treat since as a sequence cursor. Advance it from each SCAN_RESULT.latestSeq, not from timestamps.',
    'Read scan results from SCAN_RESULT.messages.',
    'Use the ritual greeting string exactly as specified in the live contract files.',
    'After posting the ritual greeting in tutorial, continue the ritual in that greeting intent subspace by using the greeting intentId as parentId.',
    'Do not invent a separate ENTER message type.',
    'Send raw NDJSON messages directly to the station.',
    'Do not wrap messages in an RPC envelope like {"op":"post","message":...}.',
    'SCAN is the only non-ITP wire message and it must use the exact shape {"type":"SCAN","spaceId":"...","since":0}.',
    'If you write helper code or scripts, you must execute them yourself.',
    'Merely generating client code or local files does not count as completion.',
    'Your task is complete only after the live station interaction reaches ASSESS.',
    'Do not ask for help. Finish when the ritual reaches ASSESS.',
  ].join(' ');
}

function launchRecipe(
  recipe: AgentRecipe,
  ctx: RecipeContext,
  io: { stdoutPath: string; stderrPath: string },
): RunningProcess {
  mkdirSync(join(ctx.workspaceDir, '..'), { recursive: true });
  writeFileSync(io.stdoutPath, '');
  writeFileSync(io.stderrPath, '');
  const prompt = recipe.promptTransform ? recipe.promptTransform(ctx.prompt, ctx) : ctx.prompt;
  const child = spawn(recipe.command, recipe.args(ctx), {
    cwd: ctx.workspaceDir,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (recipe.inputMode === 'stdin') {
    child.stdin.write(prompt);
  }
  child.stdin.end();
  pipeToFile(child.stdout, io.stdoutPath);
  pipeToFile(child.stderr, io.stderrPath);
  return {
    child,
    waitForExit: new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
    }),
  };
}

function getRecipe(agent: AgentTarget): AgentRecipe | null {
  const repoScript = (name: string) => join(process.cwd(), 'scripts', name);
  const recipes: Record<Exclude<AgentTarget, 'pi'>, AgentRecipe> = {
    codex: {
      command: 'codex',
      args: (ctx) => [
        'exec',
        '-c',
        'model_reasoning_effort="medium"',
        '--dangerously-bypass-approvals-and-sandbox',
        '--skip-git-repo-check',
        '--cd',
        ctx.workspaceDir,
        '--add-dir',
        ctx.repoRoot,
        (recipes.codex.promptTransform ? recipes.codex.promptTransform(ctx.prompt, ctx) : ctx.prompt),
      ],
      promptTransform: (prompt, ctx) => [
        prompt,
        `Codex-specific execution rules for this harness run:`,
        `Create exactly one executable helper script at ${join(ctx.workspaceDir, 'dojo_client.py')}.`,
        `Use Python 3 standard library only.`,
        'After reading the required docs and contract files, stop reading and write the script immediately.',
        'Then execute that script immediately and let it drive the entire ritual to ASSESS.',
        'Do not perform extra reconnaissance, historical analysis, or exploratory scans beyond root and your own live subspaces.',
        'Do not stop at planning, explanation, or partial setup.',
      ].join(' '),
    },
    claude: {
      command: 'claude',
      args: (ctx) => [
        '--print',
        '--dangerously-skip-permissions',
        '--permission-mode',
        'bypassPermissions',
        '--add-dir',
        ctx.repoRoot,
      ],
      inputMode: 'stdin',
    },
    'scripted-dojo': {
      command: 'npx',
      args: (ctx) => [
        'tsx',
        repoScript('dojo-agent.ts'),
        '--host',
        DEFAULT_HOST,
        '--port',
        String(DEFAULT_STATION_PORT),
        '--agent-id',
        `scripted-${Date.now()}`,
      ],
    },
  };

  if (agent === 'pi') {
    return getPiRecipe();
  }

  return recipes[agent];
}

function getPiRecipe(): AgentRecipe {
  const packageName = process.env.PI_PACKAGE ?? '@mariozechner/pi-coding-agent';
  const modelsConfigPath = resolve(process.env.HOME ?? '', '.pi/agent/models.json');
  const hasModelsConfig = existsSync(modelsConfigPath);
  const hasExplicitProvider = Boolean(process.env.PI_PROVIDER && process.env.PI_MODEL);
  const hasGenericApiKey = Boolean(process.env.PI_API_KEY);
  const hasProviderEnv = Boolean(
    process.env.ANTHROPIC_API_KEY
    || process.env.OPENAI_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.ANTHROPIC_OAUTH_TOKEN,
  );

  if (!hasModelsConfig && !hasExplicitProvider && !hasGenericApiKey && !hasProviderEnv) {
    return {
      command: 'npx',
      args: () => [],
      unavailableReason:
        'Pi requires either ~/.pi/agent/models.json or provider credentials (for example PI_PROVIDER + PI_MODEL + PI_API_KEY).',
    };
  }

  return {
    command: 'npx',
    args: (ctx) => {
      const args = ['-y', packageName, '-p', '--tools', 'read,bash,edit,write,grep,find,ls', '--skill', join(ctx.repoRoot, 'docs/academy/skill-pack/SKILL.md')];
      if (process.env.PI_PROVIDER) {
        args.push('--provider', process.env.PI_PROVIDER);
      }
      if (process.env.PI_MODEL) {
        args.push('--model', process.env.PI_MODEL);
      }
      if (process.env.PI_API_KEY) {
        args.push('--api-key', process.env.PI_API_KEY);
      }
      args.push(ctx.prompt);
      return args;
    },
  };
}

function commandExists(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function startMonitor(target: ClientTarget, transcriptPath: string): Promise<MonitorHandle> {
  const client = new IntentSpaceClient(target);
  const transcript: MessageEcho[] = [];
  await client.connect();
  client.on('message', (msg: MessageEcho) => {
    transcript.push(msg);
    appendJsonLine(transcriptPath, msg);
  });
  return {
    transcript,
    stop: async () => {
      client.disconnect();
    },
  };
}

async function awaitRunCompletion(
  processHandle: RunningProcess,
  monitor: MonitorHandle,
  timeoutMs: number,
): Promise<{ exitCode: number | null; timedOut: boolean }> {
  const started = Date.now();
  let exitCode: number | null = null;
  let exited = false;
  processHandle.waitForExit.then((code) => {
    exitCode = code;
    exited = true;
  }).catch(() => {
    exited = true;
  });

  while (Date.now() - started < timeoutMs) {
    if (classifyRun(monitor.transcript).failureStage === 'completed') {
      processHandle.child.kill('SIGTERM');
      await sleep(200);
      return { exitCode, timedOut: false };
    }
    if (exited) {
      return { exitCode, timedOut: false };
    }
    await sleep(200);
  }

  processHandle.child.kill('SIGTERM');
  await sleep(500);
  processHandle.child.kill('SIGKILL');
  return { exitCode, timedOut: true };
}

export function classifyRun(
  transcript: MessageEcho[],
  generatedFiles: string[] = [],
): {
  failureStage: FailureStage;
  agentId?: string;
  agentIds: string[];
  cleanliness: RunCleanliness;
  repairSignals: string[];
  helperMode: HelperMode;
  helperFiles: string[];
  helperLanguage?: string;
} {
  const ignored = new Set(['intent-space', 'differ-tutor']);
  const agentMessages = transcript.filter((msg) => !ignored.has(msg.senderId));
  const agentIds = [...new Set(agentMessages.map((msg) => msg.senderId))].sort();
  const agentId = pickDominantAgent(agentMessages);
  const repairSignals = collectRepairSignals(transcript, generatedFiles, agentIds);
  const helperFiles = detectHelperFiles(generatedFiles);
  const helperMode = classifyHelperMode(helperFiles, agentMessages);
  const helperLanguage = detectHelperLanguage(helperFiles);
  const cleanliness: RunCleanliness = repairSignals.length > 0 ? 'self-repaired' : 'single-pass';
  if (!agentId) {
    return {
      failureStage: 'pre-dojo',
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  const registrationIntent = transcript.find(
    (msg) => msg.senderId === agentId && msg.type === 'INTENT' && msg.parentId === REGISTRATION_SPACE_ID,
  );
  if (!registrationIntent) {
    return {
      failureStage: 'pre-dojo',
      agentId,
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  const signedChallenge = transcript.find(
    (msg) => msg.senderId === agentId && msg.type === 'INTENT' && msg.parentId === registrationIntent.intentId,
  );
  if (!signedChallenge) {
    return {
      failureStage: 'challenge-response',
      agentId,
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  const tutorialAck = transcript.find(
    (msg) => msg.senderId === 'differ-tutor'
      && msg.type === 'INTENT'
      && msg.parentId === registrationIntent.intentId
      && (msg.payload as Record<string, unknown>).ritualGreeting === RITUAL_GREETING_CONTENT,
  );
  if (!tutorialAck) {
    return {
      failureStage: 'registration',
      agentId,
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  const greeting = transcript.find(
    (msg) => msg.senderId === agentId && msg.type === 'INTENT' && msg.parentId === TUTORIAL_SPACE_ID,
  );
  if (!greeting) {
    return {
      failureStage: 'tutorial-navigation',
      agentId,
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  const deliberateDecline = transcript.find(
    (msg) => msg.senderId === 'differ-tutor' && msg.type === 'DECLINE' && msg.parentId === greeting.intentId,
  );
  if (!deliberateDecline) {
    return {
      failureStage: 'tutorial-navigation',
      agentId,
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  const promise = transcript.find(
    (msg) => msg.senderId === 'differ-tutor' && msg.type === 'PROMISE' && msg.parentId === greeting.intentId,
  );
  if (!promise?.promiseId) {
    return {
      failureStage: 'decline-recovery',
      agentId,
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  const accept = transcript.find(
    (msg) => msg.senderId === agentId && msg.type === 'ACCEPT' && msg.promiseId === promise.promiseId,
  );
  if (!accept) {
    return {
      failureStage: 'accept',
      agentId,
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  const assess = transcript.find(
    (msg) => msg.senderId === agentId && msg.type === 'ASSESS' && msg.promiseId === promise.promiseId,
  );
  if (!assess) {
    return {
      failureStage: 'assess',
      agentId,
      agentIds,
      cleanliness,
      repairSignals,
      helperMode,
      helperFiles,
      helperLanguage,
    };
  }

  return {
    failureStage: 'completed',
    agentId,
    agentIds,
    cleanliness,
    repairSignals,
    helperMode,
    helperFiles,
    helperLanguage,
  };
}

function pickDominantAgent(messages: MessageEcho[]): string | undefined {
  if (messages.length === 0) return undefined;
  const counts = new Map<string, { count: number; latest: number }>();
  for (const msg of messages) {
    const current = counts.get(msg.senderId) ?? { count: 0, latest: 0 };
    current.count += 1;
    current.latest = Math.max(current.latest, msg.timestamp);
    counts.set(msg.senderId, current);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return b[1].latest - a[1].latest;
    })[0]?.[0];
}

async function startLocalDojo(input: {
  repoRoot: string;
  host: string;
  port: number;
  academyPort: number;
  logDir: string;
}): Promise<StageHandle> {
  mkdirSync(input.logDir, { recursive: true });
  const academy = spawn('python3', ['-m', 'http.server', String(input.academyPort), '--directory', join(input.repoRoot, 'docs/academy')], {
    cwd: input.repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeToFile(academy.stdout, join(input.logDir, 'academy.log'));
  pipeToFile(academy.stderr, join(input.logDir, 'academy.err.log'));

  const station = spawn('npm', ['start'], {
    cwd: join(input.repoRoot, 'intent-space'),
    env: { ...process.env, INTENT_SPACE_PORT: String(input.port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeToFile(station.stdout, join(input.logDir, 'station.log'));
  pipeToFile(station.stderr, join(input.logDir, 'station.err.log'));

  await waitForPort(input.host, input.port, 10_000);

  const tutor = spawn('npm', ['run', 'tutor'], {
    cwd: join(input.repoRoot, 'intent-space'),
    env: {
      ...process.env,
      INTENT_SPACE_TUTOR_HOST: input.host,
      INTENT_SPACE_TUTOR_PORT: String(input.port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeToFile(tutor.stdout, join(input.logDir, 'tutor.log'));
  pipeToFile(tutor.stderr, join(input.logDir, 'tutor.err.log'));

  await sleep(1000);

  return {
    academyPort: input.academyPort,
    host: input.host,
    port: input.port,
    stop: async () => {
      for (const proc of [tutor, station, academy]) {
        proc.kill('SIGTERM');
      }
      await sleep(500);
      for (const proc of [tutor, station, academy]) {
        proc.kill('SIGKILL');
      }
    },
  };
}

function createAttachedStage(options: HarnessOptions): StageHandle {
  return {
    academyPort: options.academyPort ?? DEFAULT_ACADEMY_PORT,
    host: options.host ?? DEFAULT_HOST,
    port: options.port ?? DEFAULT_STATION_PORT,
    stop: async () => {},
  };
}

function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = async () => {
      try {
        const client = new IntentSpaceClient({ host, port });
        await client.connect();
        client.disconnect();
        resolve();
      } catch {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(tick, 200);
      }
    };
    void tick();
  });
}

function appendJsonLine(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  try {
    const current = readFileSync(path, 'utf8');
    writeFileSync(path, current + line);
  } catch {
    writeFileSync(path, line);
  }
}

function pipeToFile(stream: NodeJS.ReadableStream, path: string): void {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    writeFileSync(path, buffer);
  });
}

function listFiles(dir: string): string[] {
  const found: string[] = [];
  walk(dir, found, dir);
  return found.sort();
}

function walk(root: string, found: string[], current: string): void {
  if (!existsSync(current)) return;
  if (!statSync(current).isDirectory()) {
    found.push(relative(root, current));
    return;
  }

  const entries = readdirSync(current);
  for (const entry of entries) {
    walk(root, found, join(current, entry));
  }
}

function renderMarkdownReport(summaries: RunSummary[]): string {
  const lines = ['# Dojo Harness Report', ''];
  const grouped = new Map<AgentTarget, RunSummary[]>();
  for (const summary of summaries) {
    const group = grouped.get(summary.agent) ?? [];
    group.push(summary);
    grouped.set(summary.agent, group);
  }

  for (const [agent, runs] of grouped) {
    lines.push(`## ${agent}`);
    lines.push('');
    for (const run of runs) {
      const helper = run.helperMode === 'none'
        ? 'no-helper'
        : `${run.helperMode}${run.helperLanguage ? `:${run.helperLanguage}` : ''}`;
      const repair = run.cleanliness === 'single-pass'
        ? 'single-pass'
        : `self-repaired [${run.repairSignals.join(', ')}]`;
      lines.push(`- trial ${run.trial}: ${run.status} (${run.failureStage}) in ${run.durationMs}ms; ${repair}; ${helper}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectHelperFiles(generatedFiles: string[]): string[] {
  return generatedFiles.filter((file) => {
    if (file.startsWith('.intent-space/')) return false;
    return /\.(py|js|mjs|cjs|ts|mts|sh)$/i.test(file);
  });
}

function detectHelperLanguage(helperFiles: string[]): string | undefined {
  const exts = new Set(helperFiles.map((file) => file.split('.').pop()?.toLowerCase()));
  if (exts.has('py')) return 'python';
  if (exts.has('js') || exts.has('mjs') || exts.has('cjs')) return 'javascript';
  if (exts.has('ts') || exts.has('mts')) return 'typescript';
  if (exts.has('sh')) return 'shell';
  return undefined;
}

function classifyHelperMode(helperFiles: string[], agentMessages: MessageEcho[]): HelperMode {
  if (helperFiles.length === 0) return 'none';
  const executed = agentMessages.some((msg) => msg.parentId === REGISTRATION_SPACE_ID || msg.parentId === TUTORIAL_SPACE_ID);
  return executed ? 'generated-executed' : 'generated-not-executed';
}

function collectRepairSignals(transcript: MessageEcho[], generatedFiles: string[], agentIds: string[]): string[] {
  const signals = new Set<string>();
  if (agentIds.length > 1) signals.add('multiple-agent-identities');

  const helperFiles = detectHelperFiles(generatedFiles);
  if (helperFiles.length > 1) signals.add('multiple-helper-files');

  const ignored = new Set(['intent-space', 'differ-tutor']);
  const counts = new Map<string, { registrations: number; greetings: number }>();
  for (const msg of transcript) {
    if (ignored.has(msg.senderId)) continue;
    const current = counts.get(msg.senderId) ?? { registrations: 0, greetings: 0 };
    if (msg.type === 'INTENT' && msg.parentId === REGISTRATION_SPACE_ID) current.registrations += 1;
    if (msg.type === 'INTENT' && msg.parentId === TUTORIAL_SPACE_ID) current.greetings += 1;
    counts.set(msg.senderId, current);
  }

  for (const count of counts.values()) {
    if (count.registrations > 1) signals.add('repeated-registration');
    if (count.greetings > 1) signals.add('repeated-greeting');
  }

  return [...signals].sort();
}
