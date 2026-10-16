// Starts a local PostgreSQL server for development using the `embedded-postgres`
// package (real PostgreSQL binaries, no system install needed).
// If you already run PostgreSQL yourself, skip this and point DATABASE_URL at it.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.data', 'pg');
const port = Number(process.env.PG_PORT || 5433);

function alreadyUp() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

function clearStalePid() {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!existsSync(pidFile)) return;
  const pid = Number(String(readFileSync(pidFile, 'utf8')).split('\n')[0]);
  if (!Number.isInteger(pid) || pid <= 0) {
    unlinkSync(pidFile);
    return;
  }
  try {
    process.kill(pid, 0);
  } catch {
    console.log('[db] removing stale postmaster.pid');
    unlinkSync(pidFile);
  }
}

function startError(err) {
  const detail = err instanceof Error ? err.message : err ? String(err) : 'exited before it was ready';
  return new Error(`[db] PostgreSQL failed to start on port ${port} (${detail}). Check ${dataDir}.`);
}

const logs = [];
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'conversa',
  password: 'conversa_dev_password',
  port,
  persistent: true,
  onLog: (message) => {
    const text = String(message).trim();
    if (!text) return;
    logs.push(text);
    if (/error|fatal|could not|failed|panic/i.test(text)) console.error('[db]', text);
  },
  onError: (err) => console.error('[db]', err),
});

if (await alreadyUp()) {
  console.log(`[db] PostgreSQL already running on port ${port}`);
} else {
  clearStalePid();
  const fresh = !existsSync(path.join(dataDir, 'PG_VERSION'));
  if (fresh) {
    console.log('[db] initialising new cluster in', dataDir);
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch (err) {
    clearStalePid();
    try {
      await pg.start();
    } catch (retry) {
      if (logs.length) console.error('[db] last logs:\n' + logs.slice(-12).join('\n'));
      throw startError(retry || err);
    }
  }
  if (fresh) {
    await pg.createDatabase('conversa');
  }
  console.log(`[db] PostgreSQL running on port ${port}`);
}

console.log(`[db] DATABASE_URL=postgresql://conversa:conversa_dev_password@localhost:${port}/conversa`);

const shutdown = async () => {
  console.log('\n[db] stopping…');
  try {
    await pg.stop();
  } catch {
    /* already down */
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
