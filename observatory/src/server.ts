import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join, resolve } from 'path';
import { createHash } from 'crypto';
import { readObservatorySnapshot } from './adapter.ts';

const HOST = process.env.OBSERVATORY_HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.OBSERVATORY_PORT ?? '4311', 10);
const PUBLIC_DIR = resolve(process.cwd(), 'public');
const POLL_INTERVAL_MS = parseInt(process.env.OBSERVATORY_POLL_INTERVAL_MS ?? '1000', 10);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

const clients = new Set<ServerResponse>();
let lastHash = '';

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function currentSnapshot() {
  return readObservatorySnapshot();
}

function snapshotHash(snapshot: unknown): string {
  return createHash('sha1').update(JSON.stringify(snapshot)).digest('hex');
}

function broadcastIfChanged(): void {
  const snapshot = currentSnapshot();
  const nextHash = snapshotHash(snapshot);
  if (nextHash === lastHash) return;
  lastHash = nextHash;
  for (const res of clients) {
    sendEvent(res, 'snapshot', snapshot);
  }
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const path = join(PUBLIC_DIR, requested);
  if (!path.startsWith(PUBLIC_DIR) || !existsSync(path)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = extname(path);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/snapshot') {
    json(res, 200, currentSnapshot());
    return;
  }

  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    clients.add(res);
    sendEvent(res, 'snapshot', currentSnapshot());
    req.on('close', () => clients.delete(res));
    return;
  }

  serveStatic(req, res);
}).listen(PORT, HOST, () => {
  lastHash = snapshotHash(currentSnapshot());
  setInterval(broadcastIfChanged, POLL_INTERVAL_MS).unref();
  console.log(`observatory: http://${HOST}:${PORT}`);
});
