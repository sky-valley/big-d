import { resolve } from 'path';
import { HeadwatersSteward } from './steward.ts';

const host = process.env.HEADWATERS_HOST ?? '127.0.0.1';
const commonsPort = parseInt(process.env.HEADWATERS_COMMONS_PORT ?? '4010', 10);
const authSecret = process.env.INTENT_SPACE_AUTH_SECRET ?? 'intent-space-dev-secret';
const dataDir = process.env.HEADWATERS_DATA_DIR ?? resolve('.headwaters');

const steward = new HeadwatersSteward({
  dataDir,
  host,
  commonsPort,
  authSecret,
});

await steward.start();
console.log(`headwaters-steward: connected to tcp://${host}:${commonsPort}`);

async function shutdown(): Promise<void> {
  await steward.stop();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
