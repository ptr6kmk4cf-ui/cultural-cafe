// Conversa Demo Dating — a local, fictional dating site used to demonstrate and
// test the Conversa AI extension. Zero dependencies. All data is in memory.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES, SEED_THREADS, scriptLine } from './data/profiles.mjs';
import { renderPhoto } from './data/photos.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DEMO_PORT || 4000);
const REPLY_DELAY_MS = Number(process.env.DEMO_REPLY_DELAY_MS || 3500);

let state;
let seq = 1;
const nid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

function reset() {
  state = { threads: [], replies: {} };
  for (const t of SEED_THREADS) {
    state.threads.push({
      id: t.id,
      profileId: t.profileId,
      messages: t.messages.map((m) => ({ id: nid('m'), from: m.from, text: m.text, photo: null, at: new Date(Date.now() - m.minutesAgo * 60000).toISOString() })),
    });
    state.replies[t.profileId] = t.messages.filter((m) => m.from === 'them').length;
  }
}
reset();

const publicProfile = ({ behavior, ...p }) => ({
  ...p,
  photos: p.photos.map((_, i) => `/photos/${p.id}/${i}.svg`),
});

function threadSummary(t) {
  const p = PROFILES.find((x) => x.id === t.profileId);
  const last = t.messages.at(-1);
  return { id: t.id, profileId: t.profileId, name: p.name, photo: `/photos/${p.id}/0.svg`, last: last ? { from: last.from, text: last.text, at: last.at } : null, unread: last?.from === 'them' };
}

function scheduleReply(thread) {
  const p = PROFILES.find((x) => x.id === thread.profileId);
  setTimeout(() => {
    const n = state.replies[p.id] ?? 0;
    thread.messages.push({ id: nid('m'), from: 'them', text: scriptLine(p, n), photo: null, at: new Date().toISOString() });
    state.replies[p.id] = n + 1;
  }, REPLY_DELAY_MS + Math.random() * 1000);
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 4 * 1024 * 1024) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const send = (res, code, data, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    let m;
    if (req.method === 'GET' && p === '/api/profiles') {
      const min = Number(url.searchParams.get('minAge') || 18);
      const max = Number(url.searchParams.get('maxAge') || 99);
      return send(res, 200, { profiles: PROFILES.filter((x) => x.age >= min && x.age <= max).map(publicProfile) });
    }
    if (req.method === 'GET' && (m = p.match(/^\/api\/profiles\/(\w+)$/))) {
      const prof = PROFILES.find((x) => x.id === m[1]);
      return prof ? send(res, 200, { profile: publicProfile(prof) }) : send(res, 404, { error: 'not found' });
    }
    if (req.method === 'GET' && p === '/api/threads') {
      return send(res, 200, { threads: [...state.threads].sort((a, b) => (b.messages.at(-1)?.at ?? '').localeCompare(a.messages.at(-1)?.at ?? '')).map(threadSummary) });
    }
    if (req.method === 'GET' && (m = p.match(/^\/api\/threads\/(\w+)$/))) {
      const t = state.threads.find((x) => x.id === m[1]);
      if (!t) return send(res, 404, { error: 'not found' });
      return send(res, 200, { thread: { ...threadSummary(t), messages: t.messages } });
    }
    if (req.method === 'POST' && p === '/api/messages') {
      const b = await body(req);
      const prof = PROFILES.find((x) => x.id === b.profileId);
      if (!prof) return send(res, 404, { error: 'profile not found' });
      const text = String(b.text ?? '').slice(0, 4000);
      const photo = typeof b.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(b.photo) ? b.photo : null;
      if (!text.trim() && !photo) return send(res, 422, { error: 'empty message' });
      let t = state.threads.find((x) => x.profileId === prof.id);
      if (!t) {
        t = { id: nid('t'), profileId: prof.id, messages: [] };
        state.threads.push(t);
      }
      t.messages.push({ id: nid('m'), from: 'me', text, photo, at: new Date().toISOString() });
      scheduleReply(t);
      return send(res, 201, { threadId: t.id });
    }
    if (req.method === 'POST' && p === '/api/reset') {
      reset();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && (m = p.match(/^\/photos\/(\w+)\/(\d)\.svg$/))) {
      const prof = PROFILES.find((x) => x.id === m[1]);
      const ph = prof?.photos[Number(m[2])];
      if (!ph) return send(res, 404, 'not found', 'text/plain');
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' });
      return res.end(renderPhoto(ph.scene, ph.hue));
    }
    if (req.method === 'GET') {
      const file = p === '/' ? 'index.html' : p.slice(1);
      if (!/^[\w.-]+$/.test(file)) return send(res, 404, 'not found', 'text/plain');
      const data = await readFile(path.join(ROOT, 'public', file)).catch(() => null);
      if (!data) return send(res, 404, 'not found', 'text/plain');
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      return res.end(data);
    }
    send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    send(res, 400, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => console.log(`[demo-site] Conversa Demo Dating running at http://localhost:${PORT}`));
