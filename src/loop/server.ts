import { createServer } from 'http';

const PORT = Number(process.env.PORT ?? 3000);

const server = createServer((req, res) => {
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});

export { server };
