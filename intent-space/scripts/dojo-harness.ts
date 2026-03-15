import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { runHarness, type AgentTarget } from '../src/harness.ts';

interface CliOptions {
  agents: AgentTarget[];
  trials: number;
  attach: boolean;
  outputDir: string;
  host: string;
  port: number;
  academyPort: number;
  timeoutMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts.set(key, 'true');
      continue;
    }
    opts.set(key, next);
    i += 1;
  }

  const agents = (opts.get('agents') ?? 'scripted-dojo,codex,claude,pi')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as AgentTarget[];

  return {
    agents,
    trials: Number(opts.get('trials') ?? '3'),
    attach: opts.get('attach') === 'true',
    outputDir: resolve(opts.get('output-dir') ?? '/tmp/dojo-harness'),
    host: opts.get('host') ?? '127.0.0.1',
    port: Number(opts.get('port') ?? '4000'),
    academyPort: Number(opts.get('academy-port') ?? '8080'),
    timeoutMs: Number(opts.get('timeout-ms') ?? String(8 * 60 * 1000)),
  };
}

async function main(): Promise<void> {
  const repoRoot = resolve(process.cwd(), '..');
  loadEnvFile(join(process.cwd(), '.env.pi'));
  loadEnvFile(join(repoRoot, 'intent-space/.env.pi'));
  const options = parseArgs(process.argv.slice(2));
  const result = await runHarness({
    repoRoot,
    outputDir: options.outputDir,
    agents: options.agents,
    trials: options.trials,
    attachOnly: options.attach,
    host: options.host,
    port: options.port,
    academyPort: options.academyPort,
    timeoutMs: options.timeoutMs,
  });

  console.log(`dojo-harness: report ${result.reportPath}`);
  for (const summary of result.summaries) {
    console.log(
      `dojo-harness: ${summary.agent} trial=${summary.trial} status=${summary.status} stage=${summary.failureStage}`,
    );
  }
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`dojo-harness: failed ${message}`);
  process.exit(1);
});
