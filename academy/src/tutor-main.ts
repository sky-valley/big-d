import { readFileSync } from 'fs';
import { StationTutor } from './tutor.ts';
import type { ClientTarget } from '../../intent-space/src/types.ts';

function buildTarget(): ClientTarget {
  if (process.env.INTENT_SPACE_TUTOR_SOCKET_PATH) {
    return process.env.INTENT_SPACE_TUTOR_SOCKET_PATH;
  }

  const host = process.env.INTENT_SPACE_TUTOR_HOST ?? '127.0.0.1';
  const tlsPort = process.env.INTENT_SPACE_TUTOR_TLS_PORT;
  if (tlsPort) {
    return {
      host,
      port: parseInt(tlsPort, 10),
      tls: true,
      ca: process.env.INTENT_SPACE_TUTOR_TLS_CA
        ? readFileSync(process.env.INTENT_SPACE_TUTOR_TLS_CA, 'utf8')
        : undefined,
      rejectUnauthorized: process.env.INTENT_SPACE_TUTOR_REJECT_UNAUTHORIZED !== 'false',
    };
  }

  const port = process.env.INTENT_SPACE_TUTOR_PORT;
  if (!port) {
    throw new Error('Set INTENT_SPACE_TUTOR_SOCKET_PATH, INTENT_SPACE_TUTOR_PORT, or INTENT_SPACE_TUTOR_TLS_PORT');
  }

  return { host, port: parseInt(port, 10), tls: false };
}

const tutor = new StationTutor({
  target: buildTarget(),
  academyUrl: process.env.ACADEMY_ORIGIN ?? 'http://127.0.0.1:8080',
  agentId: process.env.INTENT_SPACE_TUTOR_ID ?? 'differ-tutor',
});

console.log('station-tutor: starting');
await tutor.start();
console.log('station-tutor: connected and observing');

process.on('SIGINT', () => {
  tutor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  tutor.stop();
  process.exit(0);
});
