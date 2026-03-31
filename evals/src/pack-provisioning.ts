import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

export interface PackSourceConfig {
  marketplaceRepoUrl: string;
  marketplaceName: string;
  pluginName: string;
  ref: string;
  cacheDir: string;
}

export interface PackProvisioning {
  marketplaceRepoUrl: string;
  marketplaceName: string;
  pluginName: string;
  requestedRef: string;
  resolvedCommitSha: string;
  fetchedAt: string;
  cacheDir: string;
  checkoutDir: string;
  sourceDir: string;
  workspacePackDir: string;
}

export const DEFAULT_PACK_SOURCE = {
  marketplaceRepoUrl: 'https://github.com/sky-valley/claude-code-marketplace.git',
  marketplaceName: 'skyvalley-marketplace',
  pluginName: 'intent-space-agent-pack',
  ref: 'main',
} as const;

export function buildPackSourceConfig(input: {
  outputDir: string;
  marketplaceRepoUrl?: string;
  marketplaceName?: string;
  pluginName?: string;
  ref?: string;
  cacheDir?: string;
}): PackSourceConfig {
  return {
    marketplaceRepoUrl: input.marketplaceRepoUrl ?? DEFAULT_PACK_SOURCE.marketplaceRepoUrl,
    marketplaceName: input.marketplaceName ?? DEFAULT_PACK_SOURCE.marketplaceName,
    pluginName: input.pluginName ?? DEFAULT_PACK_SOURCE.pluginName,
    ref: input.ref ?? DEFAULT_PACK_SOURCE.ref,
    cacheDir: resolve(input.cacheDir ?? join(input.outputDir, '.pack-cache')),
  };
}

export function buildWorkspacePackPath(workspaceDir: string, pluginName: string): string {
  return join(workspaceDir, pluginName);
}

export function buildCacheKey(source: Omit<PackSourceConfig, 'cacheDir'>): string {
  const digest = createHash('sha1')
    .update(JSON.stringify(source))
    .digest('hex')
    .slice(0, 12);
  return `${sanitizeSegment(source.pluginName)}-${digest}`;
}

export function materializePackIntoWorkspace(input: {
  workspaceDir: string;
  source: PackSourceConfig;
}): PackProvisioning {
  mkdirSync(input.workspaceDir, { recursive: true });
  mkdirSync(input.source.cacheDir, { recursive: true });

  const cacheKey = buildCacheKey({
    marketplaceRepoUrl: input.source.marketplaceRepoUrl,
    marketplaceName: input.source.marketplaceName,
    pluginName: input.source.pluginName,
    ref: input.source.ref,
  });
  const checkoutDir = join(input.source.cacheDir, cacheKey);
  ensureCheckout({
    checkoutDir,
    marketplaceRepoUrl: input.source.marketplaceRepoUrl,
    ref: input.source.ref,
  });

  const sourceDir = join(checkoutDir, 'plugins', input.source.pluginName);
  if (!existsSync(sourceDir)) {
    throw new Error(`Plugin '${input.source.pluginName}' not found in ${input.source.marketplaceRepoUrl} at ref ${input.source.ref}`);
  }

  const workspacePackDir = buildWorkspacePackPath(input.workspaceDir, input.source.pluginName);
  rmSync(workspacePackDir, { recursive: true, force: true });
  cpSync(sourceDir, workspacePackDir, { recursive: true });

  return {
    marketplaceRepoUrl: input.source.marketplaceRepoUrl,
    marketplaceName: input.source.marketplaceName,
    pluginName: input.source.pluginName,
    requestedRef: input.source.ref,
    resolvedCommitSha: gitStdout(['rev-parse', 'HEAD'], checkoutDir),
    fetchedAt: new Date().toISOString(),
    cacheDir: input.source.cacheDir,
    checkoutDir,
    sourceDir,
    workspacePackDir,
  };
}

function ensureCheckout(input: {
  checkoutDir: string;
  marketplaceRepoUrl: string;
  ref: string;
}): void {
  mkdirSync(input.checkoutDir, { recursive: true });
  if (!existsSync(join(input.checkoutDir, '.git'))) {
    execFileSync('git', ['init'], { cwd: input.checkoutDir, stdio: 'pipe' });
    execFileSync('git', ['remote', 'add', 'origin', input.marketplaceRepoUrl], { cwd: input.checkoutDir, stdio: 'pipe' });
  }

  execFileSync('git', ['fetch', '--depth', '1', 'origin', input.ref], {
    cwd: input.checkoutDir,
    stdio: 'pipe',
  });
  execFileSync('git', ['checkout', '--detach', 'FETCH_HEAD'], {
    cwd: input.checkoutDir,
    stdio: 'pipe',
  });
}

function gitStdout(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
