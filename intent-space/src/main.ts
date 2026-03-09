/**
 * Intent Space — entry point.
 *
 * Listens on Unix socket (always) and TCP (if INTENT_SPACE_PORT is set).
 */

import { IntentSpace } from './space.ts';

const space = new IntentSpace();

console.log(`intent-space: starting`);

await space.start();

console.log(`intent-space: listening (agent: ${space.agentId})`);
console.log(`  socket: ${space.socketPath}`);
if (space.tcpPort) {
  console.log(`  tcp:    port ${space.tcpPort}`);
}

process.on('SIGINT', async () => {
  console.log('\nintent-space: shutting down');
  await space.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await space.stop();
  process.exit(0);
});
