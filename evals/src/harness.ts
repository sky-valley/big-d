import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import {
  assignBuiltinProfile,
  buildAgentPrompt,
  buildBasePrompt,
  type AgentProfileName,
  type AssignedAgentProfile,
} from './prompts/headwaters-agent-pack.ts';

export type AgentTarget = 'codex' | 'claude' | 'pi' | 'scripted-headwaters';
export type RunStatus = 'passed' | 'failed' | 'timeout' | 'unavailable';
export type StageVerdict = 'passed' | 'failed' | 'not-run';
export type ProfileMode = 'none' | 'builtin';
type TerminationReason = 'process-exit' | 'idle-timeout' | 'wall-timeout' | 'unavailable';

interface EvalOptions {
  repoRoot: string;
  outputDir: string;
  agents: string[];
  trials: number;
  timeoutMs: number;
  idleTimeoutMs: number;
  observationMs: number;
  staggerMs?: number;
  injectContent?: string;
  withObservatory?: boolean;
  observatoryPortBase?: number;
  profileMode: ProfileMode;
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
  launchMode?: 'one-shot' | 'claude-stream-json';
}

interface RecipeContext {
  repoRoot: string;
  workspaceDir: string;
  runDir: string;
  stage: StageHandle;
  prompt: string;
  agent: AgentTarget;
  instanceLabel: string;
  packDir: string;
  sessionRef?: string;
}

interface RunningAgent {
  agent: AgentTarget;
  instanceLabel: string;
  profile?: AssignedAgentProfile;
  workspaceDir: string;
  stdoutPath: string;
  stderrPath: string;
  child?: ChildProcessWithoutNullStreams;
  waitForExit?: Promise<number | null>;
  sessionRef?: string;
  unavailableReason?: string;
  launchMode: 'one-shot' | 'claude-stream-json';
  handle?: string;
  interviewStatus: 'pending' | 'completed' | 'failed' | 'unavailable';
  interviewFile?: string;
  interviewTriggeredAt?: number;
  interviewSent: boolean;
  stdinClosed?: boolean;
}

interface AgentEvidence {
  handle?: string;
  messages: Array<Record<string, unknown>>;
  monitoringEvents: Array<Record<string, unknown>>;
}

interface AgentRunSummary {
  agent: AgentTarget;
  instanceLabel: string;
  profile?: AssignedAgentProfile;
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
  orientationPassed: boolean;
  coexistencePassed: boolean;
  collaborationPassed: boolean;
  interviewStatus: 'completed' | 'failed' | 'unavailable';
  interviewFile?: string;
}

interface InterviewObservation {
  reachedSpace: boolean;
  latestCloseAt?: number;
  latestActivityAt?: number;
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
  orientationPassCount: number;
  coexistencePassCount: number;
  collaborationPassCount: number;
  agentSummaries: AgentRunSummary[];
  sharedEvidence: AgentEvidence;
  observatory: ObservatorySummary;
}

interface ObservatorySummary {
  enabled: boolean;
  status: 'running' | 'failed' | 'disabled';
  url?: string;
  port?: number;
  label?: string;
  logPath?: string;
  errLogPath?: string;
  failureReason?: string;
}

interface ObservatoryHandle {
  summary: ObservatorySummary;
  child?: ChildProcessWithoutNullStreams;
}

function log(trial: number, message: string): void {
  const prefix = `[trial ${String(trial).padStart(2, '0')}]`;
  process.stderr.write(`${prefix} ${message}\n`);
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 8090;
const DEFAULT_COMMONS_PORT = 4010;
const DEFAULT_OBSERVATORY_PORT = 4311;
const DEFAULT_INJECT_CONTENT =
  'Hey I need someone to build me a simple todo list app, it should have the possibility to add, edit, and delete tasks, it should be able to store the tasks in a file, and it should be able to read the tasks from the file.';
const INTERVIEW_DISCONNECT_GRACE_MS = 3_000;
const INTERVIEW_TIMEOUT_MS = 2 * 60 * 1000;

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
  log(trial, `Starting — ${options.agents.length} agents, stagger: ${options.staggerMs ?? 0}ms`);
  const stage = await startLocalHeadwaters({
    repoRoot: resolve(options.repoRoot),
    runDir,
    host: DEFAULT_HOST,
    httpPort: DEFAULT_HTTP_PORT + (trial - 1) * 20,
    commonsPort: DEFAULT_COMMONS_PORT + (trial - 1) * 20,
  });
  log(trial, `Headwaters ready at ${stage.baseUrl}`);
  const observatory = await startObservatory({
    repoRoot: resolve(options.repoRoot),
    runDir,
    trial,
    stage,
    enabled: options.withObservatory ?? false,
    port: (options.observatoryPortBase ?? DEFAULT_OBSERVATORY_PORT) + (trial - 1) * 20,
  });
  if (observatory.summary.status === 'running' && observatory.summary.url) {
    log(trial, `Observatory ready at ${observatory.summary.url}`);
  } else if (observatory.summary.status === 'failed') {
    log(trial, `Observatory unavailable: ${observatory.summary.failureReason ?? 'failed to start'}`);
  }
  const startedAt = new Date();
  const injectedIntentContent = options.injectContent ?? DEFAULT_INJECT_CONTENT;
  const operatorWorkspace = join(runDir, 'operator');
  let injectorExit: Promise<number | null> | null = null;

  // When observationMs is 0, pre-seed the intent before agents connect
  // so it's already visible in the commons on their first scan.
  if (options.observationMs === 0) {
    const exitCode = await launchIntentInjector({
      repoRoot: resolve(options.repoRoot),
      stage,
      workspaceDir: operatorWorkspace,
      content: injectedIntentContent,
    });
    injectorExit = Promise.resolve(exitCode);
    log(trial, 'Intent injected');
  }

  const basePrompt = buildBasePrompt({
    packDir: join(options.repoRoot, 'agent-pack'),
    baseUrl: stage.baseUrl,
  });
  const runningAgents = await launchAgents({
    trial,
    repoRoot: resolve(options.repoRoot),
    runDir,
    stage,
    basePrompt,
    profileMode: options.profileMode,
    agentNames: options.agents,
    staggerMs: options.staggerMs ?? 0,
  });

  let injectorTimer: ReturnType<typeof setTimeout> | undefined;
  if (options.observationMs > 0) {
    injectorTimer = setTimeout(() => {
      injectorExit = launchIntentInjector({
        repoRoot: resolve(options.repoRoot),
        stage,
        workspaceDir: operatorWorkspace,
        content: injectedIntentContent,
      }).then((code) => {
        log(trial, 'Intent injected');
        return code;
      });
    }, options.observationMs);
  }

  let timedOut = false;
  let terminationReason: TerminationReason = 'process-exit';
  try {
    const outcome = await awaitAgentsCompletion(
      runningAgents,
      options.timeoutMs,
      options.idleTimeoutMs,
      {
        repoRoot: options.repoRoot,
        dbPath: stage.commonsDbPath,
        startedAtMs: startedAt.getTime(),
      },
    );
    timedOut = outcome.timedOut;
    terminationReason = outcome.terminationReason;
    if (terminationReason === 'process-exit') {
      log(trial, 'All agents exited');
    } else if (terminationReason === 'wall-timeout') {
      log(trial, 'Wall timeout reached');
    } else if (terminationReason === 'idle-timeout') {
      log(trial, 'Idle timeout reached');
    }
  } finally {
    if (injectorTimer) clearTimeout(injectorTimer);
    await Promise.all(runningAgents.map(async (agent) => stopProcess(agent.child)));
    if (injectorExit) {
      await injectorExit.catch(() => null);
    }
    await stopProcess(observatory.child);
    await stage.stop();
  }

  const endedAt = new Date();
  const sharedEvidence = await readSpaceDb({
    repoRoot: options.repoRoot,
    dbPath: stage.commonsDbPath,
    fromTs: startedAt.getTime(),
    toTs: endedAt.getTime(),
  });
  const collaborationSpaceIds = discoverCollaborationSpaceIds(sharedEvidence, injectedIntentContent);

  const agentSummaries = await Promise.all(runningAgents.map(async (agent) => {
    const generatedFiles = listFiles(agent.workspaceDir);
    const handle = agent.handle ?? discoverHandle(agent.workspaceDir);
    const evidence = await readSpaceDb({
      repoRoot: options.repoRoot,
      dbPath: stage.commonsDbPath,
      fromTs: startedAt.getTime(),
      toTs: endedAt.getTime(),
      actorId: handle,
    });
    const interviewObservation = observeInterviewState(evidence);
    const interviewStatus = agent.interviewStatus === 'completed'
      ? 'completed'
      : agent.launchMode === 'claude-stream-json' && interviewObservation.reachedSpace
        ? 'failed'
        : 'unavailable';
    return {
      agent: agent.agent,
      instanceLabel: agent.instanceLabel,
      profile: agent.profile,
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
      orientationPassed: false,
      coexistencePassed: false,
      collaborationPassed: false,
      interviewStatus,
      interviewFile: agent.interviewFile,
    } satisfies AgentRunSummary;
  }));

  const orientationVerdict = scoreOrientation(agentSummaries);
  const coexistenceVerdict = scoreCoexistence(agentSummaries);
  const collaborationVerdict = scoreCollaboration(agentSummaries, collaborationSpaceIds);

  const total = agentSummaries.length;
  const orientationPassCount = agentSummaries.filter((s) => agentPassedOrientation(s)).length;
  const coexistencePassCount = agentSummaries.filter((s) => agentPassedCoexistence(s)).length;
  const collaborationPassCount = agentSummaries.filter((s) => agentPassedCollaboration(s, collaborationSpaceIds)).length;
  log(trial, `Orientation: ${orientationVerdict} (${orientationPassCount}/${total}), Coexistence: ${coexistenceVerdict} (${coexistencePassCount}/${total}), Collaboration: ${collaborationVerdict} (${collaborationPassCount}/${total})`);

  // Annotate per-agent verdicts
  for (const agentSummary of agentSummaries) {
    agentSummary.orientationPassed = agentPassedOrientation(agentSummary);
    agentSummary.coexistencePassed = agentPassedCoexistence(agentSummary);
    agentSummary.collaborationPassed = agentPassedCollaboration(agentSummary, collaborationSpaceIds);
  }

  // Build agent-map: instance label → intent-space handle + profile
  const agentMap: Record<string, { handle: string | null; profile: AgentProfileName | null }> = {};
  for (const agentSummary of agentSummaries) {
    agentMap[agentSummary.instanceLabel] = {
      handle: agentSummary.handle ?? null,
      profile: agentSummary.profile?.name ?? null,
    };
  }
  writeFileSync(join(runDir, 'agent-map.json'), JSON.stringify(agentMap, null, 2));

  generateTimeline({
    agentSummaries,
    sharedEvidence,
    agentMap,
    runDir,
  });

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
    orientationPassCount: agentSummaries.filter((s) => s.orientationPassed).length,
    coexistencePassCount: agentSummaries.filter((s) => s.coexistencePassed).length,
    collaborationPassCount: agentSummaries.filter((s) => s.collaborationPassed).length,
    agentSummaries,
    sharedEvidence,
    observatory: observatory.summary,
  };

  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  const durationSec = (summary.durationMs / 1000).toFixed(1);
  log(trial, `Done in ${durationSec}s — timeline at ${join(runDir, 'timeline.md')}`);
  return summary;
}

async function launchAgents(input: {
  trial: number;
  repoRoot: string;
  runDir: string;
  stage: StageHandle;
  basePrompt: string;
  profileMode: ProfileMode;
  agentNames: string[];
  staggerMs: number;
}): Promise<RunningAgent[]> {
  const packDir = join(input.repoRoot, 'agent-pack');
  const results: RunningAgent[] = [];

  // Count occurrences of each agent type
  const typeCounts = new Map<string, number>();
  for (const name of input.agentNames) {
    typeCounts.set(name, (typeCounts.get(name) ?? 0) + 1);
  }
  // Track per-type index during iteration
  const typeIndex = new Map<string, number>();

  for (let i = 0; i < input.agentNames.length; i += 1) {
    if (i > 0 && input.staggerMs > 0) {
      await sleep(input.staggerMs);
    }

    const agentName = input.agentNames[i];
    const agent = agentName as AgentTarget;
    const count = typeCounts.get(agentName) ?? 1;
    const idx = (typeIndex.get(agentName) ?? 0) + 1;
    typeIndex.set(agentName, idx);
    const instanceLabel = count > 1
      ? `${agent}-${String(idx).padStart(2, '0')}`
      : agent;

    const recipe = getRecipe(agent);
    const profile = input.profileMode === 'builtin' ? assignBuiltinProfile(i) : undefined;
    const prompt = buildAgentPrompt(input.basePrompt, profile);
    const agentDir = join(input.runDir, 'agents', instanceLabel);
    const workspaceDir = join(agentDir, 'workspace');
    mkdirSync(workspaceDir, { recursive: true });
    const stdoutPath = join(agentDir, 'stdout.log');
    const stderrPath = join(agentDir, 'stderr.log');
    writeFileSync(stdoutPath, '');
    writeFileSync(stderrPath, '');

    if (!recipe) {
      log(input.trial, `Failed to spawn ${instanceLabel}: No recipe configured for ${agent}`);
      results.push({
        agent,
        instanceLabel,
        workspaceDir,
        stdoutPath,
        stderrPath,
        unavailableReason: `No recipe configured for ${agent}`,
        launchMode: 'one-shot',
        interviewStatus: 'unavailable',
        interviewSent: false,
      });
      continue;
    }

    try {
      const sessionRef = recipe.prepareSessionRef?.();
      const ctx: RecipeContext = {
        repoRoot: input.repoRoot,
        workspaceDir,
        runDir: agentDir,
        stage: input.stage,
        prompt,
        agent,
        instanceLabel,
        packDir,
        sessionRef,
      };

      const child = spawn(recipe.command, recipe.args(ctx), {
        cwd: workspaceDir,
        env: recipe.env?.(ctx) ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (recipe.launchMode === 'claude-stream-json') {
        sendClaudeUserMessage(child.stdin, prompt);
      } else if (recipe.inputMode === 'stdin') {
        child.stdin.write(prompt);
        child.stdin.end();
      }
      pipeToFile(child.stdout, stdoutPath);
      pipeToFile(child.stderr, stderrPath);

      const staggerInfo = input.staggerMs > 0 ? ` [${i + 1}/${input.agentNames.length}]` : '';
      log(input.trial, `Launched ${instanceLabel} (${agent}, ${profile?.name ?? 'no-profile'})${staggerInfo}`);

      child.on('exit', (code) => {
        log(input.trial, `${instanceLabel} exited (code ${code})`);
      });

      results.push({
        agent,
        instanceLabel,
        profile,
        workspaceDir,
        stdoutPath,
        stderrPath,
        child,
        sessionRef,
        launchMode: recipe.launchMode ?? 'one-shot',
        waitForExit: new Promise((resolve) => child.on('exit', (code) => resolve(code))),
        interviewStatus: recipe.launchMode === 'claude-stream-json' ? 'pending' : 'unavailable',
        interviewSent: false,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(input.trial, `Failed to spawn ${instanceLabel}: ${reason}`);
      results.push({
        agent,
        instanceLabel,
        profile,
        workspaceDir,
        stdoutPath,
        stderrPath,
        unavailableReason: `Failed to spawn ${agent}: ${reason}`,
        launchMode: 'one-shot',
        interviewStatus: 'unavailable',
        interviewSent: false,
      });
    }
  }

  return results;
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
      '--verbose',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
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
    launchMode: 'claude-stream-json',
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
      `${ctx.instanceLabel}-${randomUUID().slice(0, 8)}`,
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

async function startObservatory(input: {
  repoRoot: string;
  runDir: string;
  trial: number;
  stage: StageHandle;
  enabled: boolean;
  port: number;
}): Promise<ObservatoryHandle> {
  const logDir = join(input.runDir, 'observatory');
  const logPath = join(logDir, 'observatory.log');
  const errLogPath = join(logDir, 'observatory.err.log');
  const label = `Headwaters Eval Trial ${String(input.trial).padStart(2, '0')}`;

  if (!input.enabled) {
    return {
      summary: {
        enabled: false,
        status: 'disabled',
        label,
      },
    };
  }

  mkdirSync(logDir, { recursive: true });
  writeFileSync(logPath, '');
  writeFileSync(errLogPath, '');

  const tsx = join(input.repoRoot, 'intent-space', 'node_modules', '.bin', 'tsx');
  const child = spawn(tsx, ['src/server.ts'], {
    cwd: join(input.repoRoot, 'observatory'),
    env: {
      ...process.env,
      OBSERVATORY_HOST: DEFAULT_HOST,
      OBSERVATORY_PORT: String(input.port),
      OBSERVATORY_HEADWATERS_DATA_DIR: input.stage.dataDir,
      OBSERVATORY_HEADWATERS_ORIGIN: input.stage.baseUrl,
      OBSERVATORY_LABEL: label,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeToFile(child.stdout, logPath);
  pipeToFile(child.stderr, errLogPath);

  const url = `http://${DEFAULT_HOST}:${input.port}`;
  try {
    await waitForHttp(`${url}/health`, 15_000);
    return {
      child,
      summary: {
        enabled: true,
        status: 'running',
        url,
        port: input.port,
        label,
        logPath,
        errLogPath,
      },
    };
  } catch (error) {
    await stopProcess(child);
    const failureReason = error instanceof Error ? error.message : String(error);
    return {
      summary: {
        enabled: true,
        status: 'failed',
        port: input.port,
        label,
        logPath,
        errLogPath,
        failureReason,
      },
    };
  }
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
  input: {
    repoRoot: string;
    dbPath: string;
    startedAtMs: number;
  },
): Promise<{ timedOut: boolean; terminationReason: TerminationReason }> {
  const running = agents.filter((agent) => agent.child);
  const started = Date.now();
  let lastActivity = snapshotActivity(running);
  let lastProgressAt = started;

  while (Date.now() - started < timeoutMs) {
    for (const agent of running) {
      await maybeRunExitInterview(agent, input);
    }

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

async function maybeRunExitInterview(
  agent: RunningAgent,
  input: {
    repoRoot: string;
    dbPath: string;
    startedAtMs: number;
  },
): Promise<void> {
  if (!agent.child || agent.child.exitCode !== null || agent.child.killed) return;
  if (agent.launchMode !== 'claude-stream-json') return;
  if (agent.interviewStatus !== 'pending') return;

  agent.handle ??= discoverHandle(agent.workspaceDir);
  if (!agent.handle) return;

  const evidence = await readSpaceDb({
    repoRoot: input.repoRoot,
    dbPath: input.dbPath,
    fromTs: input.startedAtMs,
    toTs: Date.now(),
    actorId: agent.handle,
  });
  const observation = observeInterviewState(evidence);
  if (!agent.interviewSent) {
    if (!shouldTriggerInterview(observation, Date.now(), INTERVIEW_DISCONNECT_GRACE_MS)) return;
    const interviewFile = join(agent.workspaceDir, '.intent-space', 'state', 'post-headwaters-interview.md');
    agent.interviewFile = interviewFile;
    agent.interviewTriggeredAt = Date.now();
    agent.interviewSent = true;
    sendClaudeUserMessage(agent.child.stdin, buildInterviewPrompt(interviewFile));
    return;
  }

  const saved = agent.interviewFile && existsSync(agent.interviewFile);
  const timedOut = agent.interviewTriggeredAt !== undefined
    && Date.now() - agent.interviewTriggeredAt > INTERVIEW_TIMEOUT_MS;
  if (saved) {
    agent.interviewStatus = 'completed';
    closeAgentInput(agent);
  } else if (timedOut) {
    agent.interviewStatus = 'failed';
    closeAgentInput(agent);
  }
}

function closeAgentInput(agent: RunningAgent): void {
  if (agent.stdinClosed || !agent.child) return;
  agent.stdinClosed = true;
  agent.child.stdin.end();
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
  const stdout = execFileSync('python3', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as AgentEvidence;
  return {
    handle: input.actorId,
    messages: parsed.messages ?? [],
    monitoringEvents: parsed.monitoringEvents ?? [],
  };
}

function sendClaudeUserMessage(stdin: NodeJS.WritableStream, content: string): void {
  stdin.write(`${JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content,
    },
  })}\n`);
}

export function buildInterviewPrompt(interviewFile: string): string {
  return [
    'Do not reconnect to Headwaters and do not rerun the task.',
    'Your interaction with the space has ended.',
    `Write a concise markdown interview to ${interviewFile}.`,
    'Use these headings exactly:',
    '# Post-Headwaters Interview',
    '## What Happened At The End',
    '## What Was Clear',
    '## What Was Confusing',
    '## Did You Mean To Leave',
    '## Smallest Fix',
    'Base the answers only on the run that just ended. Be brief and concrete.',
    'After writing the file, print exactly INTERVIEW_SAVED.',
  ].join(' ');
}

function observeInterviewState(evidence: AgentEvidence): InterviewObservation {
  let latestCloseAt: number | undefined;
  let latestActivityAt: number | undefined;
  let reachedSpace = evidence.messages.length > 0;

  for (const message of evidence.messages) {
    if (typeof message.timestamp === 'number') {
      latestActivityAt = Math.max(latestActivityAt ?? 0, message.timestamp);
    }
  }

  for (const event of evidence.monitoringEvents) {
    const eventType = String(event.event_type ?? event.eventType ?? '');
    const timestamp = typeof event.timestamp === 'number' ? event.timestamp : undefined;
    if (eventType === 'connection_closed' && timestamp !== undefined) {
      latestCloseAt = Math.max(latestCloseAt ?? 0, timestamp);
      continue;
    }
    if ((eventType === 'auth_succeeded' || eventType === 'scan_succeeded') && timestamp !== undefined) {
      reachedSpace = true;
      latestActivityAt = Math.max(latestActivityAt ?? 0, timestamp);
    }
  }

  return {
    reachedSpace,
    latestCloseAt,
    latestActivityAt,
  };
}

export function shouldTriggerInterview(
  observation: InterviewObservation,
  now: number,
  graceMs: number,
): boolean {
  if (!observation.reachedSpace) return false;
  if (observation.latestCloseAt === undefined) return false;
  if ((observation.latestActivityAt ?? 0) > observation.latestCloseAt) return false;
  return now - observation.latestCloseAt >= graceMs;
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

function agentPassedOrientation(summary: AgentRunSummary): boolean {
  const eventTypes = new Set(summary.evidence.monitoringEvents.map((event) => String(event.event_type ?? event.eventType)));
  if (eventTypes.has('auth_succeeded') && eventTypes.has('scan_succeeded')) return true;
  return summary.evidence.messages.length > 0;
}

function agentPassedCoexistence(summary: AgentRunSummary): boolean {
  if (!summary.handle) return false;
  const eventTypes = new Set(summary.evidence.monitoringEvents.map((event) => String(event.event_type ?? event.eventType)));
  return eventTypes.has('scan_succeeded') || summary.evidence.messages.length > 0;
}

function discoverCollaborationSpaceIds(sharedEvidence: AgentEvidence, injectedIntentContent: string): Set<string> {
  const ids = new Set<string>();
  for (const message of sharedEvidence.messages) {
    if (message.type !== 'INTENT') continue;
    if (message.parent_id !== 'headwaters-commons') continue;
    const payload = message.payload as Record<string, unknown> | undefined;
    const content = typeof payload?.content === 'string' ? payload.content : '';
    if (content !== injectedIntentContent) continue;
    if (typeof message.intent_ref === 'string' && message.intent_ref.length > 0) {
      ids.add(message.intent_ref);
    }
    if (typeof message.message_id === 'string' && message.message_id.length > 0) {
      ids.add(message.message_id);
    }
  }
  return ids;
}

function agentPassedCollaboration(summary: AgentRunSummary, collaborationSpaceIds: Set<string>): boolean {
  if (!summary.handle) return false;
  if (collaborationSpaceIds.size === 0) return false;
  return summary.evidence.messages.some((message) => {
    return typeof message.parent_id === 'string'
      && collaborationSpaceIds.has(message.parent_id)
      && message.sender_id === summary.handle;
  });
}

function scoreOrientation(agentSummaries: AgentRunSummary[]): StageVerdict {
  if (agentSummaries.length === 0) return 'not-run';
  const passed = agentSummaries.every((summary) => agentPassedOrientation(summary));
  return passed ? 'passed' : 'failed';
}

function scoreCoexistence(agentSummaries: AgentRunSummary[]): StageVerdict {
  const active = agentSummaries.filter((summary) => summary.handle);
  if (active.length < 2) return 'not-run';
  const observed = active.filter((summary) => {
    const eventTypes = new Set(summary.evidence.monitoringEvents.map((event) => String(event.event_type ?? event.eventType)));
    return eventTypes.has('scan_succeeded') || summary.evidence.messages.length > 0;
  });
  const threshold = Math.ceil(active.length / 2);
  return observed.length >= threshold ? 'passed' : 'failed';
}

function scoreCollaboration(agentSummaries: AgentRunSummary[], collaborationSpaceIds: Set<string>): StageVerdict {
  const active = agentSummaries.filter((summary) => summary.handle);
  if (active.length < 2) return 'not-run';
  if (collaborationSpaceIds.size === 0) return 'failed';
  const collaborating = active.filter((summary) => agentPassedCollaboration(summary, collaborationSpaceIds));
  const threshold = Math.max(2, Math.ceil(active.length / 3));
  return collaborating.length >= threshold ? 'passed' : 'failed';
}

function generateTimeline(input: {
  agentSummaries: AgentRunSummary[];
  sharedEvidence: AgentEvidence;
  agentMap: Record<string, { handle: string | null; profile: AgentProfileName | null }>;
  runDir: string;
}): void {
  // Reverse the agent map: handle → display label
  const handleToLabel = new Map<string, string>();
  for (const [label, metadata] of Object.entries(input.agentMap)) {
    if (metadata.handle) {
      const displayLabel = metadata.profile ? `${label} (${metadata.profile})` : label;
      handleToLabel.set(metadata.handle, displayLabel);
    }
  }

  interface TimelineEntry {
    timestamp: number;
    agentLabel: string;
    eventType: string;
    summary: string;
  }

  // Only surface semantically meaningful monitoring events.
  // Failures are always interesting; routine plumbing (json_parsed,
  // scan_requested, connection_opened, auth_succeeded, …) is not.
  const SIGNAL_EVENTS = new Set([
    'scan_failed',
    'auth_failed',
    'connection_error',
    'post_proof_invalid',
    'shutdown',
  ]);

  const entries: TimelineEntry[] = [];

  // Add monitoring events (signal only)
  for (const event of input.sharedEvidence.monitoringEvents) {
    const eventType = String(event.event_type ?? event.eventType ?? 'unknown');
    if (!SIGNAL_EVENTS.has(eventType)) continue;

    const ts = typeof event.timestamp === 'number' ? event.timestamp : 0;
    const actorId = String(event.actor_id ?? event.actorId ?? '');
    const agentLabel = handleToLabel.get(actorId) ?? (actorId || 'unknown');
    const detail = typeof event.detail === 'string' ? event.detail : '';
    let summary = eventType;
    if (detail) {
      try {
        const parsed = JSON.parse(detail);
        if (parsed.message) summary = `${eventType}: ${parsed.message}`;
      } catch {
        // use raw event type
      }
    }
    entries.push({ timestamp: ts, agentLabel, eventType, summary });
  }

  // Add messages
  for (const message of input.sharedEvidence.messages) {
    const ts = typeof message.timestamp === 'number' ? message.timestamp : 0;
    const senderId = String(message.sender_id ?? '');
    const agentLabel = handleToLabel.get(senderId) ?? (senderId || 'unknown');
    const messageType = String(message.type ?? 'MESSAGE');
    const payload = message.payload as Record<string, unknown> | undefined;
    const content = typeof payload?.content === 'string'
      ? payload.content.slice(0, 80).replace(/\n/g, ' ')
      : '';
    const summary = content ? `${messageType}: ${content}` : messageType;
    entries.push({ timestamp: ts, agentLabel, eventType: messageType, summary });
  }

  // Sort by timestamp
  entries.sort((a, b) => a.timestamp - b.timestamp);

  // Build markdown
  const lines = ['# Trial Timeline', ''];
  lines.push('| Timestamp | Agent | Event | Summary |');
  lines.push('|-----------|-------|-------|---------|');
  for (const entry of entries) {
    const isoTs = new Date(entry.timestamp).toISOString();
    const escapedSummary = entry.summary.replace(/\|/g, '\\|');
    lines.push(`| ${isoTs} | ${entry.agentLabel} | ${entry.eventType} | ${escapedSummary} |`);
  }
  lines.push('');

  writeFileSync(join(input.runDir, 'timeline.md'), lines.join('\n'));
}

function renderMarkdownReport(summaries: TrialSummary[]): string {
  const lines = ['# Headwaters Agent-Pack Eval', ''];
  for (const summary of summaries) {
    const total = summary.agentSummaries.length;
    lines.push(`## Trial ${summary.trial}`);
    lines.push(`- status: ${summary.status}`);
    lines.push(`- orientation: ${summary.orientationVerdict} (${summary.orientationPassCount}/${total})`);
    lines.push(`- coexistence: ${summary.coexistenceVerdict} (${summary.coexistencePassCount}/${total})`);
    lines.push(`- collaboration: ${summary.collaborationVerdict} (${summary.collaborationPassCount}/${total})`);
    lines.push(`- base URL: ${summary.baseUrl}`);
    if (summary.observatory.status === 'running' && summary.observatory.url) {
      lines.push(`- observatory: ${summary.observatory.url}`);
    } else if (summary.observatory.enabled) {
      lines.push(`- observatory: failed (${summary.observatory.failureReason ?? 'startup error'})`);
    }
    lines.push(`- timeline: ${summary.runDir}/timeline.md`);
    lines.push('');
    lines.push('| Agent | Profile | Status | Handle | Orientation | Coexistence | Collaboration | Interview |');
    lines.push('|-------|---------|--------|--------|-------------|-------------|---------------|-----------|');
    for (const agent of summary.agentSummaries) {
      const o = agent.orientationPassed ? 'pass' : 'fail';
      const cx = agent.coexistencePassed ? 'pass' : 'fail';
      const cl = agent.collaborationPassed ? 'pass' : 'fail';
      lines.push(`| ${agent.instanceLabel} | ${agent.profile?.name ?? '-'} | ${agent.status} | ${agent.handle ?? '-'} | ${o} | ${cx} | ${cl} | ${agent.interviewStatus} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function pipeToFile(stream: NodeJS.ReadableStream, path: string): void {
  const fileStream = createWriteStream(path, { flags: 'a' });
  stream.pipe(fileStream);
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
