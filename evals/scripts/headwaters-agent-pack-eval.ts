import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { runHeadwatersAgentPackEval, type AgentTarget, type ProfileMode } from '../src/harness.ts';

export function parseArgs(argv: string[]): {
  agents: string[];
  outputDir: string;
  trials: number;
  timeoutMs: number;
  idleTimeoutMs: number;
  observationMs: number;
  staggerMs: number;
  injectContent?: string;
  evaluatorAgent: AgentTarget | 'none';
  withObservatory: boolean;
  observatoryPortBase: number;
  profileMode: ProfileMode;
  packMarketplaceRepoUrl?: string;
  packMarketplaceName?: string;
  packPluginName?: string;
  packRef?: string;
  packCacheDir?: string;
} {
  const result = {
    agents: ['scripted-headwaters'],
    outputDir: resolve(process.cwd(), 'tmp', 'headwaters-agent-pack-eval'),
    trials: 1,
    timeoutMs: 60 * 60 * 1000,
    idleTimeoutMs: 20 * 60 * 1000,
    observationMs: 120_000,
    staggerMs: 0,
    injectContent: undefined as string | undefined,
    evaluatorAgent: 'codex' as AgentTarget | 'none',
    withObservatory: false,
    observatoryPortBase: 4311,
    profileMode: 'none' as ProfileMode,
    packMarketplaceRepoUrl: undefined as string | undefined,
    packMarketplaceName: undefined as string | undefined,
    packPluginName: undefined as string | undefined,
    packRef: undefined as string | undefined,
    packCacheDir: undefined as string | undefined,
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
    if (arg === '--stagger-ms' && argv[index + 1]) {
      result.staggerMs = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === '--inject-content' && argv[index + 1]) {
      result.injectContent = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--evaluator-agent' && argv[index + 1]) {
      const value = argv[index + 1] as AgentTarget | 'none';
      if (value !== 'none' && value !== 'codex' && value !== 'claude' && value !== 'pi' && value !== 'scripted-headwaters') {
        console.error(`Error: Invalid --evaluator-agent '${value}'. Supported: none, codex, claude, pi, scripted-headwaters`);
        process.exit(1);
      }
      result.evaluatorAgent = value;
      index += 1;
      continue;
    }
    if (arg === '--with-observatory') {
      result.withObservatory = true;
      continue;
    }
    if (arg === '--observatory-port-base' && argv[index + 1]) {
      result.observatoryPortBase = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === '--profile-mode' && argv[index + 1]) {
      const value = argv[index + 1];
      if (value !== 'none' && value !== 'builtin') {
        console.error(`Error: Invalid --profile-mode '${value}'. Supported: none, builtin`);
        process.exit(1);
      }
      result.profileMode = value;
      index += 1;
      continue;
    }
    if (arg === '--pack-marketplace-repo-url' && argv[index + 1]) {
      result.packMarketplaceRepoUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--pack-marketplace-name' && argv[index + 1]) {
      result.packMarketplaceName = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--pack-plugin-name' && argv[index + 1]) {
      result.packPluginName = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--pack-ref' && argv[index + 1]) {
      result.packRef = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--pack-cache-dir' && argv[index + 1]) {
      result.packCacheDir = resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const SUPPORTED_AGENTS = new Set(['codex', 'claude', 'pi', 'scripted-headwaters']);

  for (const agent of args.agents) {
    if (!SUPPORTED_AGENTS.has(agent)) {
      console.error(`Error: Unknown agent type '${agent}'. Supported: ${[...SUPPORTED_AGENTS].join(', ')}`);
      process.exit(1);
    }
  }

  if (args.agents.length > 10) {
    console.warn(`Warning: ${args.agents.length} agents requested. This configuration has not been tested beyond 10 agents.`);
  }

  const repoRoot = resolve(process.cwd(), '..');

  const { reportPath } = await runHeadwatersAgentPackEval({
    repoRoot,
    agents: args.agents,
    outputDir: args.outputDir,
    trials: args.trials,
    timeoutMs: args.timeoutMs,
    idleTimeoutMs: args.idleTimeoutMs,
    observationMs: args.observationMs,
    staggerMs: args.staggerMs,
    injectContent: args.injectContent,
    evaluatorAgent: args.evaluatorAgent,
    withObservatory: args.withObservatory,
    observatoryPortBase: args.observatoryPortBase,
    profileMode: args.profileMode,
    packMarketplaceRepoUrl: args.packMarketplaceRepoUrl,
    packMarketplaceName: args.packMarketplaceName,
    packPluginName: args.packPluginName,
    packRef: args.packRef,
    packCacheDir: args.packCacheDir,
  });

  console.log(reportPath);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
