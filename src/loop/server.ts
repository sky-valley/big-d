import { createServer } from 'http';

const PORT = Number(process.env.PORT ?? 3000);

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const body = JSON.stringify({ status: 'ok', uptime: process.uptime() });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});

export { server };
