import { resolve } from 'path';
import { startHeadwatersHttpServer } from './server.ts';
import { HeadwatersService } from './service.ts';
import { spawnHeadwatersStewardProcess } from './steward-process.ts';

const host = process.env.HEADWATERS_HOST ?? '127.0.0.1';
const httpPort = parseInt(process.env.HEADWATERS_PORT ?? '8090', 10);
const commonsPort = parseInt(process.env.HEADWATERS_COMMONS_PORT ?? '4010', 10);
const authSecret = process.env.INTENT_SPACE_AUTH_SECRET ?? 'intent-space-dev-secret';
const dataDir = process.env.HEADWATERS_DATA_DIR ?? resolve('.headwaters');
const rootDir = resolve(process.cwd());

process.env.HEADWATERS_ORIGIN ??= `http://${host}:${httpPort}`;
process.env.HEADWATERS_COMMONS_ENDPOINT ??= `tcp://${host}:${commonsPort}`;
process.env.HEADWATERS_COMMONS_AUDIENCE ??= 'intent-space://headwaters/commons';

const service = new HeadwatersService({
  dataDir,
  host,
  commonsPort,
  authSecret,
});

await service.start();
await startHeadwatersHttpServer({
  host,
  port: httpPort,
  rootDir,
  dataDir,
  authSecret,
});
const steward = spawnHeadwatersStewardProcess({
  cwd: process.cwd(),
  host,
  commonsPort,
  dataDir,
  authSecret,
  stdio: 'inherit',
});

console.log(`headwaters: http listening on http://${host}:${httpPort}`);
console.log(`headwaters: commons listening on ${service.commonsEndpoint}`);
console.log(`headwaters: steward process pid ${steward.pid ?? 'unknown'}`);

process.on('SIGINT', async () => {
  steward.kill('SIGINT');
  await service.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  steward.kill('SIGTERM');
  await service.stop();
  process.exit(0);
});
