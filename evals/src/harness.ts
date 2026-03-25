import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';

export type AgentTarget = 'codex' | 'claude' | 'pi' | 'scripted-headwaters';
export type RunStatus = 'passed' | 'failed' | 'timeout' | 'unavailable';
export type StageVerdict = 'passed' | 'failed' | 'not-run';
type TerminationReason = 'process-exit' | 'idle-timeout' | 'wall-timeout' | 'unavailable';

interface EvalOptions {
  repoRoot: string;
  outputDir: string;
  agents: string[];
  trials: number;
  timeoutMs: number;
  idleTimeoutMs: number;
  observationMs: number;
  injectContent?: string;
}

interface StageHandle {
  host: string;
  httpPort: number;
  commonsPort: number;
  baseUrl: string;
  dataDir: string;
  commonsDbPath: string;
  stop: () => Promise<void>;
}

interface AgentRecipe {
  command: string;
  args: (ctx: RecipeContext) => string[];
  inputMode?: 'stdin';
  env?: (ctx: RecipeContext) => NodeJS.ProcessEnv;
  prepareSessionRef?: () => string | undefined;
}

interface RecipeContext {
  repoRoot: string;
  workspaceDir: string;
  runDir: string;
  stage: StageHandle;
  prompt: string;
  agent: AgentTarget;
  packDir: string;
  sessionRef?: string;
}

interface RunningAgent {
  agent: AgentTarget;
  workspaceDir: string;
  stdoutPath: string;
  stderrPath: string;
  child?: ChildProcessWithoutNullStreams;
  waitForExit?: Promise<number | null>;
  sessionRef?: string;
  unavailableReason?: string;
}

interface AgentEvidence {
  handle?: string;
  messages: Array<Record<string, unknown>>;
  monitoringEvents: Array<Record<string, unknown>>;
}

interface AgentRunSummary {
  agent: AgentTarget;
  status: RunStatus;
  exitCode: number | null;
  terminationReason: TerminationReason;
  workspaceDir: string;
  stdoutPath: string;
  stderrPath: string;
  generatedFiles: string[];
  handle?: string;
  evidence: AgentEvidence;
  unavailableReason?: string;
}

interface TrialSummary {
  trial: number;
  status: RunStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  runDir: string;
  baseUrl: string;
  commonsDbPath: string;
  injectedIntentContent: string;
  orientationVerdict: StageVerdict;
  coexistenceVerdict: StageVerdict;
  collaborationVerdict: StageVerdict;
  agentSummaries: AgentRunSummary[];
  sharedEvidence: AgentEvidence;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 8090;
const DEFAULT_COMMONS_PORT = 4010;
const DEFAULT_INJECT_CONTENT =
  'Build a small shared product. If you are suited to one slice, volunteer only your own slice and coordinate through intents and promises.';

export async function runHeadwatersAgentPackEval(options: EvalOptions): Promise<{ reportPath: string; summaries: TrialSummary[] }> {
  const outputDir = resolve(options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const summaries: TrialSummary[] = [];

  for (let trial = 1; trial <= options.trials; trial += 1) {
    summaries.push(await runTrial(trial, options));
  }

  const reportPath = join(outputDir, 'report.json');
  writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), summaries }, null, 2));
  writeFileSync(join(outputDir, 'report.md'), renderMarkdownReport(summaries));
  return { reportPath, summaries };
}

async function runTrial(trial: number, options: EvalOptions): Promise<TrialSummary> {
  const runDir = join(resolve(options.outputDir), `trial-${String(trial).padStart(2, '0')}`);
  mkdirSync(runDir, { recursive: true });
  const stage = await startLocalHeadwaters({
    repoRoot: resolve(options.repoRoot),
    runDir,
    host: DEFAULT_HOST,
    httpPort: DEFAULT_HTTP_PORT + (trial - 1) * 20,
    commonsPort: DEFAULT_COMMONS_PORT + (trial - 1) * 20,
  });
  const startedAt = new Date();
  const prompt = buildPrompt({
    packDir: join(options.repoRoot, 'agent-pack'),
    baseUrl: stage.baseUrl,
  });
  const runningAgents = launchAgents({
    repoRoot: resolve(options.repoRoot),
    runDir,
    stage,
    prompt,
    agentNames: options.agents,
  });

  const injectedIntentContent = options.injectContent ?? DEFAULT_INJECT_CONTENT;
  const operatorWorkspace = join(runDir, 'operator');
  let injectorExit: Promise<number | null> | null = null;
  const injectorTimer = setTimeout(() => {
    injectorExit = launchIntentInjector({
      repoRoot: resolve(options.repoRoot),
      stage,
      workspaceDir: operatorWorkspace,
      content: injectedIntentContent,
    });
  }, options.observationMs);

  let timedOut = false;
  let terminationReason: TerminationReason = 'process-exit';
  try {
    const outcome = await awaitAgentsCompletion(
      runningAgents,
      options.timeoutMs,
      options.idleTimeoutMs,
    );
    timedOut = outcome.timedOut;
    terminationReason = outcome.terminationReason;
  } finally {
    clearTimeout(injectorTimer);
    await Promise.all(runningAgents.map(async (agent) => stopProcess(agent.child)));
    if (injectorExit) {
      await injectorExit.catch(() => null);
    }
    await stage.stop();
  }

  const endedAt = new Date();
  const sharedEvidence = await readSpaceDb({
    repoRoot: options.repoRoot,
    dbPath: stage.commonsDbPath,
    fromTs: startedAt.getTime(),
    toTs: endedAt.getTime(),
  });

  const agentSummaries = await Promise.all(runningAgents.map(async (agent) => {
    const generatedFiles = listFiles(agent.workspaceDir);
    const handle = discoverHandle(agent.workspaceDir);
    const evidence = await readSpaceDb({
      repoRoot: options.repoRoot,
      dbPath: stage.commonsDbPath,
      fromTs: startedAt.getTime(),
      toTs: endedAt.getTime(),
      actorId: handle,
    });
    return {
      agent: agent.agent,
      status: agent.unavailableReason
        ? 'unavailable'
        : timedOut ? 'timeout' : classifyAgentStatus(evidence),
      exitCode: await agent.waitForExit?.catch(() => null) ?? null,
      terminationReason: agent.unavailableReason ? 'unavailable' : terminationReason,
      workspaceDir: agent.workspaceDir,
      stdoutPath: agent.stdoutPath,
      stderrPath: agent.stderrPath,
      generatedFiles,
      handle,
      evidence,
      unavailableReason: agent.unavailableReason,
    } satisfies AgentRunSummary;
  }));

  const orientationVerdict = scoreOrientation(agentSummaries);
  const coexistenceVerdict = scoreCoexistence(agentSummaries);
  const collaborationVerdict = scoreCollaboration(agentSummaries, injectedIntentContent);
  const status: RunStatus = timedOut
    ? 'timeout'
    : [orientationVerdict, coexistenceVerdict, collaborationVerdict].includes('failed')
      ? 'failed'
      : 'passed';

  const summary: TrialSummary = {
    trial,
    status,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    runDir,
    baseUrl: stage.baseUrl,
    commonsDbPath: stage.commonsDbPath,
    injectedIntentContent,
    orientationVerdict,
    coexistenceVerdict,
    collaborationVerdict,
    agentSummaries,
    sharedEvidence,
  };

  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

function buildPrompt(input: { packDir: string; baseUrl: string }): string {
  return [
    `Use the skill pack at ${input.packDir}.`,
    `The Headwaters base URL is ${input.baseUrl}.`,
    'Use only the pack and the live service as your source of truth.',
    'Do not inspect historical runs, transcripts, or previous artifacts.',
    'Store any local state you need inside the current working directory.',
    'Do not ask for additional guidance.',
    'Observe before acting.',
    'You are in a real shared intent-space environment. Participate correctly on your own terms.',
  ].join(' ');
}

function launchAgents(input: {
  repoRoot: string;
  runDir: string;
  stage: StageHandle;
  prompt: string;
  agentNames: string[];
}): RunningAgent[] {
  const packDir = join(input.repoRoot, 'agent-pack');
  return input.agentNames.map((agentName) => {
    const agent = agentName as AgentTarget;
    const recipe = getRecipe(agent);
    const agentDir = join(input.runDir, 'agents', agent);
    const workspaceDir = join(agentDir, 'workspace');
    mkdirSync(workspaceDir, { recursive: true });
    const stdoutPath = join(agentDir, 'stdout.log');
    const stderrPath = join(agentDir, 'stderr.log');
    writeFileSync(stdoutPath, '');
    writeFileSync(stderrPath, '');

    if (!recipe) {
      return {
        agent,
        workspaceDir,
        stdoutPath,
        stderrPath,
        unavailableReason: `No recipe configured for ${agent}`,
      };
    }

    const sessionRef = recipe.prepareSessionRef?.();
    const ctx: RecipeContext = {
      repoRoot: input.repoRoot,
      workspaceDir,
      runDir: agentDir,
      stage: input.stage,
      prompt: input.prompt,
      agent,
      packDir,
      sessionRef,
    };

    const child = spawn(recipe.command, recipe.args(ctx), {
      cwd: workspaceDir,
      env: recipe.env?.(ctx) ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (recipe.inputMode === 'stdin') {
      child.stdin.write(input.prompt);
    }
    child.stdin.end();
    pipeToFile(child.stdout, stdoutPath);
    pipeToFile(child.stderr, stderrPath);

    return {
      agent,
      workspaceDir,
      stdoutPath,
      stderrPath,
      child,
      sessionRef,
      waitForExit: new Promise((resolve) => child.on('exit', (code) => resolve(code))),
    };
  });
}

function getRecipe(agent: AgentTarget): AgentRecipe | null {
  const repoScript = (repoRoot: string, name: string) => join(repoRoot, 'headwaters', 'scripts', name);

  const codexRecipe: AgentRecipe = {
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
      ctx.prompt,
    ],
  };
  const claudeRecipe: AgentRecipe = {
    command: 'claude',
    args: (ctx) => [
      '--print',
      '--session-id',
      ctx.sessionRef!,
      '--dangerously-skip-permissions',
      '--permission-mode',
      'bypassPermissions',
      '--add-dir',
      ctx.packDir,
    ],
    inputMode: 'stdin',
    prepareSessionRef: () => randomUUID(),
  };
  const scriptedRecipe: AgentRecipe = {
    command: 'python3',
    args: (ctx) => [
      repoScript(ctx.repoRoot, 'headwaters-agent.py'),
      '--headwaters-url',
      ctx.stage.baseUrl,
      '--host',
      ctx.stage.host,
      '--port',
      String(ctx.stage.commonsPort),
      '--agent-id',
      `scripted-${Date.now()}`,
      '--workspace',
      ctx.workspaceDir,
    ],
  };

  if (agent === 'codex') return codexRecipe;
  if (agent === 'claude') return claudeRecipe;
  if (agent === 'scripted-headwaters') return scriptedRecipe;
  if (agent === 'pi') {
    return {
      command: 'npx',
      args: (ctx) => ['-y', '@mariozechner/pi-coding-agent', '-p', '--tools', 'read,bash,edit,write,grep,find,ls', '--skill', join(ctx.packDir, 'SKILL.md'), ctx.prompt],
    };
  }
  return null;
}

async function startLocalHeadwaters(input: {
  repoRoot: string;
  runDir: string;
  host: string;
  httpPort: number;
  commonsPort: number;
}): Promise<StageHandle> {
  const logDir = join(input.runDir, 'headwaters');
  const dataDir = join(logDir, 'data');
  mkdirSync(logDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  const tsx = join(input.repoRoot, 'intent-space', 'node_modules', '.bin', 'tsx');
  const server = spawn(tsx, ['src/main.ts'], {
    cwd: join(input.repoRoot, 'headwaters'),
    env: {
      ...process.env,
      HEADWATERS_HOST: input.host,
      HEADWATERS_PORT: String(input.httpPort),
      HEADWATERS_COMMONS_PORT: String(input.commonsPort),
      HEADWATERS_DATA_DIR: dataDir,
      HEADWATERS_ORIGIN: `http://${input.host}:${input.httpPort}`,
      HEADWATERS_COMMONS_ENDPOINT: `tcp://${input.host}:${input.commonsPort}`,
      HEADWATERS_COMMONS_AUDIENCE: 'intent-space://headwaters/commons',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeToFile(server.stdout, join(logDir, 'headwaters.log'));
  pipeToFile(server.stderr, join(logDir, 'headwaters.err.log'));

  await waitForHttp(`http://${input.host}:${input.httpPort}/agent-setup.md`, 15_000);
  await waitForTcp(input.host, input.commonsPort, 15_000);

  return {
    host: input.host,
    httpPort: input.httpPort,
    commonsPort: input.commonsPort,
    baseUrl: `http://${input.host}:${input.httpPort}`,
    dataDir,
    commonsDbPath: join(dataDir, 'commons', 'intent-space.db'),
    stop: async () => {
      await stopProcess(server);
    },
  };
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForTcp(host: string, port: number, timeoutMs: number): Promise<void> {
  const { IntentSpaceClient } = await import('../../intent-space/src/client.ts');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const client = new IntentSpaceClient({ host, port });
      await client.connect();
      client.disconnect();
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`Timed out waiting for tcp://${host}:${port}`);
}

async function awaitAgentsCompletion(
  agents: RunningAgent[],
  timeoutMs: number,
  idleTimeoutMs: number,
): Promise<{ timedOut: boolean; terminationReason: TerminationReason }> {
  const running = agents.filter((agent) => agent.child);
  const started = Date.now();
  let lastActivity = snapshotActivity(running);
  let lastProgressAt = started;

  while (Date.now() - started < timeoutMs) {
    const allExited = await Promise.all(running.map(async (agent) => {
      const child = agent.child!;
      return child.exitCode !== null || child.killed;
    }));
    if (allExited.every(Boolean)) {
      return { timedOut: false, terminationReason: 'process-exit' };
    }

    const currentActivity = snapshotActivity(running);
    if (currentActivity !== lastActivity) {
      lastActivity = currentActivity;
      lastProgressAt = Date.now();
    }
    if (Date.now() - lastProgressAt > idleTimeoutMs) {
      return { timedOut: true, terminationReason: 'idle-timeout' };
    }
    await sleep(250);
  }

  return { timedOut: true, terminationReason: 'wall-timeout' };
}

function snapshotActivity(agents: RunningAgent[]): string {
  return JSON.stringify(agents.map((agent) => ({
    stdoutSize: fileSize(agent.stdoutPath),
    stderrSize: fileSize(agent.stderrPath),
  })));
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

async function stopProcess(child?: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill('SIGTERM');
  await sleep(300);
  if (child.exitCode === null && !child.killed) {
    child.kill('SIGKILL');
  }
}

function launchIntentInjector(input: {
  repoRoot: string;
  stage: StageHandle;
  workspaceDir: string;
  content: string;
}): Promise<number | null> {
  mkdirSync(input.workspaceDir, { recursive: true });
  const child = spawn('python3', [
    join(input.repoRoot, 'evals', 'scripts', 'headwaters_eval_operator.py'),
    '--base-url',
    input.stage.baseUrl,
    '--host',
    input.stage.host,
    '--port',
    String(input.stage.commonsPort),
    '--workspace',
    input.workspaceDir,
    '--content',
    input.content,
  ], {
    cwd: input.workspaceDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeToFile(child.stdout, join(input.workspaceDir, 'operator.stdout.log'));
  pipeToFile(child.stderr, join(input.workspaceDir, 'operator.stderr.log'));
  return new Promise((resolve) => child.on('exit', (code) => resolve(code)));
}

async function readSpaceDb(input: {
  repoRoot: string;
  dbPath: string;
  fromTs: number;
  toTs: number;
  actorId?: string;
}): Promise<AgentEvidence> {
  if (!existsSync(input.dbPath)) {
    return { messages: [], monitoringEvents: [] };
  }
  const args = [
    join(input.repoRoot, 'evals', 'scripts', 'read_space_db.py'),
    '--db',
    input.dbPath,
    '--from-ts',
    String(input.fromTs),
    '--to-ts',
    String(input.toTs),
  ];
  if (input.actorId) {
    args.push('--actor-id', input.actorId);
  }
  const stdout = execFileSync('python3', args, { encoding: 'utf8' });
  const parsed = JSON.parse(stdout) as AgentEvidence;
  return {
    handle: input.actorId,
    messages: parsed.messages ?? [],
    monitoringEvents: parsed.monitoringEvents ?? [],
  };
}

function discoverHandle(workspaceDir: string): string | undefined {
  const candidates = [
    join(workspaceDir, '.intent-space', 'state', 'station-enrollment.json'),
    join(workspaceDir, '.intent-space', 'state', 'enrollment.json'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { handle?: string };
      if (typeof parsed.handle === 'string') return parsed.handle;
    } catch {
      // try next
    }
  }
  return undefined;
}

function classifyAgentStatus(evidence: AgentEvidence): RunStatus {
  const eventTypes = new Set(evidence.monitoringEvents.map((event) => String(event.event_type ?? event.eventType)));
  if (eventTypes.has('auth_failed')) return 'failed';
  if (eventTypes.has('auth_succeeded') || eventTypes.has('scan_succeeded') || evidence.messages.length > 0) {
    return 'passed';
  }
  return 'failed';
}

function scoreOrientation(agentSummaries: AgentRunSummary[]): StageVerdict {
  if (agentSummaries.length === 0) return 'not-run';
  const passed = agentSummaries.every((summary) => {
    const eventTypes = new Set(summary.evidence.monitoringEvents.map((event) => String(event.event_type ?? event.eventType)));
    if (eventTypes.has('auth_succeeded') && eventTypes.has('scan_succeeded')) return true;
    return summary.evidence.messages.length > 0;
  });
  return passed ? 'passed' : 'failed';
}

function scoreCoexistence(agentSummaries: AgentRunSummary[]): StageVerdict {
  const active = agentSummaries.filter((summary) => summary.handle);
  if (active.length < 2) return 'not-run';
  const observed = active.filter((summary) => {
    const eventTypes = new Set(summary.evidence.monitoringEvents.map((event) => String(event.event_type ?? event.eventType)));
    return eventTypes.has('scan_succeeded') || summary.evidence.messages.length > 0;
  });
  return observed.length >= 2 ? 'passed' : 'failed';
}

function scoreCollaboration(agentSummaries: AgentRunSummary[], injectedIntentContent: string): StageVerdict {
  const active = agentSummaries.filter((summary) => summary.handle);
  if (active.length < 2) return 'not-run';
  const collaborating = active.filter((summary) =>
    summary.evidence.messages.some((message) => {
      const payload = message.payload as Record<string, unknown> | undefined;
      const content = typeof payload?.content === 'string' ? payload.content : '';
      return message.parent_id === 'headwaters-commons'
        && typeof message.sender_id === 'string'
        && content !== injectedIntentContent;
    }),
  );
  return collaborating.length >= 2 ? 'passed' : 'failed';
}

function renderMarkdownReport(summaries: TrialSummary[]): string {
  const lines = ['# Headwaters Agent-Pack Eval', ''];
  for (const summary of summaries) {
    lines.push(`## Trial ${summary.trial}`);
    lines.push(`- status: ${summary.status}`);
    lines.push(`- orientation: ${summary.orientationVerdict}`);
    lines.push(`- coexistence: ${summary.coexistenceVerdict}`);
    lines.push(`- collaboration: ${summary.collaborationVerdict}`);
    lines.push(`- base URL: ${summary.baseUrl}`);
    for (const agent of summary.agentSummaries) {
      lines.push(`- ${agent.agent}: ${agent.status}${agent.handle ? ` (${agent.handle})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function pipeToFile(stream: NodeJS.ReadableStream, path: string): void {
  stream.on('data', (chunk) => {
    appendFileSync(path, chunk);
  });
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function resolveCommand(command: string): string {
  try {
    return execFileSync('which', [command], { encoding: 'utf8' }).trim() || command;
  } catch {
    return command;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
