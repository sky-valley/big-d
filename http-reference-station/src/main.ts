import { HttpReferenceStation } from './server.ts';

const station = new HttpReferenceStation();

console.log('http-reference-station: starting');
await station.start();
console.log(`http-reference-station: listening (${station.origin})`);
console.log(`  itp:    ${station.origin}/itp`);
console.log(`  scan:   ${station.origin}/scan`);
console.log(`  stream: ${station.origin}/stream`);

process.on('SIGINT', async () => {
  console.log('\nhttp-reference-station: shutting down');
  await station.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await station.stop();
  process.exit(0);
});
