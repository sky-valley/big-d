import { DEFAULT_DB_PATH, IntentStore } from '../src/store.ts';

function parseArgs(argv: string[]): { dbPath: string; sinceId: number; limit: number } {
  let dbPath = DEFAULT_DB_PATH;
  let sinceId = 0;
  let limit = 50;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--db' && argv[index + 1]) {
      dbPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--since' && argv[index + 1]) {
      sinceId = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === '--limit' && argv[index + 1]) {
      limit = parseInt(argv[index + 1], 10);
      index += 1;
    }
  }

  return {
    dbPath,
    sinceId: Number.isFinite(sinceId) ? sinceId : 0,
    limit: Number.isFinite(limit) ? limit : 50,
  };
}

const { dbPath, sinceId, limit } = parseArgs(process.argv.slice(2));
const store = new IntentStore(dbPath);

try {
  const events = store.scanMonitoringEvents(sinceId, limit);
  for (const event of events) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
} finally {
  store.close();
}
