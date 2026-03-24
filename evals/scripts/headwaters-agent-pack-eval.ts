import { resolve } from 'path';
import { runHeadwatersAgentPackEval } from '../src/harness.ts';

function parseArgs(argv: string[]): {
  agents: string[];
  outputDir: string;
  trials: number;
  timeoutMs: number;
  idleTimeoutMs: number;
  observationMs: number;
  injectContent?: string;
} {
  const result = {
    agents: ['scripted-headwaters'],
    outputDir: resolve(process.cwd(), 'tmp', 'headwaters-agent-pack-eval'),
    trials: 1,
    timeoutMs: 10 * 60 * 1000,
    idleTimeoutMs: 5 * 60 * 1000,
    observationMs: 120_000,
    injectContent: undefined as string | undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--agents' && argv[index + 1]) {
      result.agents = argv[index + 1].split(',').map((value) => value.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === '--output-dir' && argv[index + 1]) {
      result.outputDir = resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--trials' && argv[index + 1]) {
      result.trials = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms' && argv[index + 1]) {
      result.timeoutMs = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === '--idle-timeout-ms' && argv[index + 1]) {
      result.idleTimeoutMs = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === '--observation-ms' && argv[index + 1]) {
      result.observationMs = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === '--inject-content' && argv[index + 1]) {
      result.injectContent = argv[index + 1];
      index += 1;
    }
  }

  return result;
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(process.cwd(), '..');

const { reportPath } = await runHeadwatersAgentPackEval({
  repoRoot,
  agents: args.agents,
  outputDir: args.outputDir,
  trials: args.trials,
  timeoutMs: args.timeoutMs,
  idleTimeoutMs: args.idleTimeoutMs,
  observationMs: args.observationMs,
  injectContent: args.injectContent,
});

console.log(reportPath);
