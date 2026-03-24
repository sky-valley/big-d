import { spawn, type ChildProcess } from 'child_process';
import { resolve } from 'path';

export interface HeadwatersStewardProcessOptions {
  cwd: string;
  host: string;
  commonsPort: number;
  dataDir: string;
  authSecret: string;
  stdio?: 'inherit' | 'pipe';
}

export function spawnHeadwatersStewardProcess(options: HeadwatersStewardProcessOptions): ChildProcess {
  const tsxBin = resolve(options.cwd, '../intent-space/node_modules/.bin/tsx');
  return spawn(
    tsxBin,
    ['src/steward-main.ts'],
    {
      cwd: options.cwd,
      env: {
        ...process.env,
        HEADWATERS_HOST: options.host,
        HEADWATERS_COMMONS_PORT: String(options.commonsPort),
        HEADWATERS_DATA_DIR: options.dataDir,
        INTENT_SPACE_AUTH_SECRET: options.authSecret,
      },
      stdio: options.stdio ?? 'inherit',
    },
  );
}
