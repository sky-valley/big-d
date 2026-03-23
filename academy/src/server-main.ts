import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { startAcademyServer } from './server.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

await startAcademyServer({
  host: process.env.ACADEMY_HOST ?? '127.0.0.1',
  port: parseInt(process.env.ACADEMY_PORT ?? '8080', 10),
  rootDir,
  authSecret: process.env.INTENT_SPACE_AUTH_SECRET ?? 'intent-space-dev-secret',
});
