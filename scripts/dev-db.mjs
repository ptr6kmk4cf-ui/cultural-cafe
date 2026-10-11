// Starts a local PostgreSQL server for development using the `embedded-postgres`
// package (real PostgreSQL binaries, no system install needed).
// If you already run PostgreSQL yourself, skip this and point DATABASE_URL at it.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.data', 'pg');
const port = Number(process.env.PG_PORT || 5433);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'conversa',
  password: 'conversa_dev_password',
  port,
  persistent: true,
  onLog: () => {},
});

const fresh = !existsSync(path.join(dataDir, 'PG_VERSION'));
if (fresh) {
  console.log('[db] initialising new cluster in', dataDir);
  await pg.initialise();
}
await pg.start();
if (fresh) {
  await pg.createDatabase('conversa');
}
console.log(`[db] PostgreSQL running on port ${port}`);
console.log(`[db] DATABASE_URL=postgresql://conversa:conversa_dev_password@localhost:${port}/conversa`);

const shutdown = async () => {
  console.log('\n[db] stopping…');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
