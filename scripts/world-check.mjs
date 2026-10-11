// World section: browse, mutual accept, live translation, queue, safety.
//   node --env-file=apps/web/.env scripts/world-check.mjs
const API = process.env.CONVERSA_API_URL || 'http://localhost:3000';
const email = process.env.SEED_DEMO_EMAIL || 'demo@conversa.local';
const password = process.env.SEED_DEMO_PASSWORD;
const travelerPw = process.env.SEED_WORLD_PASSWORD || password;
if (!password) throw new Error('SEED_DEMO_PASSWORD not set');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
};

async function login(em, pw) {
  const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: API }, body: JSON.stringify({ email: em, password: pw }) });
  if (!r.ok) throw new Error(`login ${em} ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
}

const call = (cookie) => async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { cookie, origin: API, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

async function reset(fn) {
  const s = await fn('/api/world/state');
  if (s.data.conversation?.id) await fn(`/api/world/conversations/${s.data.conversation.id}/end`, {});
  for (const i of s.data.invites ?? []) await fn(`/api/world/invites/${i.id}`, { accept: false });
  await fn('/api/world/queue', { action: 'leave' });
}

const demoCookie = await login(email, password);
const luciaCookie = await login('lucia@conversa.local', travelerPw);
const demo = call(demoCookie);
const lucia = call(luciaCookie);
await demo('/api/dev/plan', { plan: 'PREMIUM' });
await lucia('/api/dev/plan', { plan: 'PREMIUM' });
await reset(demo);
await reset(lucia);

console.log('World setup');
let r = await demo('/api/world/profile', { optedIn: true, city: 'Paris', country: 'France', bio: 'Weekend climber.' }, 'PUT');
check('demo can opt in', r.status === 200 && r.data.profile?.optedIn, `status ${r.status}`);
r = await demo('/api/world/people');
const luciaCard = r.data.people?.find((p) => p.city === 'Mexico City');
check('browse shows seeded travelers (no emails)', r.status === 200 && !!luciaCard && !JSON.stringify(r.data).includes('@'), `${r.data.people?.length ?? 0} people`);
r = await demo('/api/world/invite', { toId: luciaCard?.id ?? 'x' });
check('browse invite is demo’s yes, waiting on them', r.status === 201 && r.data.invite?.iAccepted && !r.data.invite?.theyAccepted, `status ${r.status}`);
const inviteId = r.data.invite?.id;
const gallery = await lucia('/api/world/people');
check('you do not appear in your own gallery', r.status === 201 && !gallery.data.people?.some((p) => p.city === 'Mexico City' && p.name === 'Lucía'));
r = await demo('/api/world/invite', { toId: 'not-a-user' });
check('invite to unknown person rejected', r.status === 404 || r.status === 400, `status ${r.status}`);

console.log('\nMutual accept');
r = await lucia(`/api/world/invites/${inviteId}`, { accept: true });
check('conversation starts only after Lucia accepts', r.status === 200 && r.data.status === 'ACCEPTED' && r.data.conversation?.id, `${r.status} ${r.data.status || r.data.error || ''} ${r.data.code || ''}`);
const convId = r.data.conversation?.id;
const demoState = await demo('/api/world/state');
check('demo is now in that conversation', !!convId && demoState.data.conversation?.id === convId, convId || 'no conversation');

console.log('\nServer does not carry chat');
r = await demo(`/api/world/conversations/${convId}/messages`, { text: 'this must not be stored' });
check('POST /messages is gone (410 p2p_only)', r.status === 410 && r.data.code === 'p2p_only', `${r.status} ${r.data.code}`);
const listed = await demo(`/api/world/conversations/${convId}`);
check('GET conversation returns no stored messages', listed.status === 200 && listed.data.messages?.length === 0, `${listed.data.messages?.length}`);
check('conversation is marked WebRTC', listed.data.conversation?.transport === 'webrtc' || listed.data.transport === 'webrtc', listed.data.transport);

console.log('\nTranslation stays on the server (not delivered)');
r = await demo(`/api/world/conversations/${convId}/prepare`, { text: 'What does a normal Sunday look like where you live?' });
check('prepare does not store the line', r.status === 200 && r.data.message?.stored === false, `status ${r.status}`);
const spanish = /[áéíóúñ¿¡]/i.test(r.data.message?.translation || '') || /domingo|vives/i.test(r.data.message?.translation || '');
check('English is translated to Lucia’s Spanish', spanish, `"${(r.data.message?.translation || '').slice(0, 80)}"`);
check('original English is still there for the P2P packet', r.data.message?.text?.includes('Sunday'));
r = await lucia(`/api/world/conversations/${convId}/prepare`, { text: 'Los domingos voy al mercado y luego al cine con mi hermana.' });
check('Spanish is translated to Demo’s English', /sunday|market|cinema|sister|movies/i.test(r.data.message?.translation || ''), `"${(r.data.message?.translation || '').slice(0, 80)}"`);

console.log('\nSafety');
r = await demo(`/api/world/conversations/${convId}/prepare`, { text: 'Can you send me $200 via Western Union?' });
check('money ask is flagged without being stored', r.status === 200 && r.data.message?.flagged === true && r.data.message?.stored === false, `flagged=${r.data.message?.flagged}`);

console.log('\nPaid AI writing');
await lucia('/api/dev/plan', { plan: 'FREE' });
r = await lucia(`/api/world/conversations/${convId}/assist`, { history: [{ mine: false, text: 'Hi from Mexico City' }] });
check('Free plan is asked to pay (402)', r.status === 402 && r.data.code === 'premium_required', `${r.status} ${r.data.code}`);
await lucia('/api/dev/plan', { plan: 'PREMIUM' });
await demo('/api/dev/plan', { plan: 'PREMIUM' });
r = await demo(`/api/world/conversations/${convId}/assist`, { history: [{ mine: false, text: 'What does a normal Sunday look like in Paris?' }] });
check('Premium can draft a reply (not sent by the server)', r.status === 200 && !!r.data.text && !!r.data.disclosure && r.data.hold === false, `${r.status} hold=${r.data.hold} "${(r.data.text || '').slice(0, 50)}"`);
r = await demo(`/api/world/conversations/${convId}/assist`, { history: [{ mine: false, text: 'Please send me $200 via Western Union now' }], auto: true });
check('Run-the-hour holds a money ask and does not auto-send', r.status === 200 && r.data.hold === true, `hold=${r.data.hold} ${r.data.holdReason || ''}`);
console.log('\nPeer-to-peer delivery');
{
  const { default: puppeteer } = await import('puppeteer');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.env.PUPPETEER_CACHE_DIR ||= path.join(ROOT, '.cache/puppeteer');
  const browser = await puppeteer.launch({ headless: true, pipe: true, args: ['--no-sandbox'] });
  const open = async (cookieHeader) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const eq = cookieHeader.indexOf('=');
    await page.setCookie({ name: cookieHeader.slice(0, eq), value: cookieHeader.slice(eq + 1), domain: 'localhost', path: '/', httpOnly: true });
    const posts = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/messages')) posts.push(req.url());
    });
    await page.goto(`${API}/app/world/${convId}`, { waitUntil: 'load', timeout: 90000 });
    page._p2pPosts = posts;
    return page;
  };
  const demoPage = await open(demoCookie);
  const luciaPage = await open(luciaCookie);
  const ready = async (page) => page.waitForFunction(() => document.querySelector('[data-world-peer]')?.getAttribute('data-world-peer') === 'open', { timeout: 25000 }).then(() => true).catch(() => false);
  const demoOpen = await ready(demoPage);
  const luciaOpen = await ready(luciaPage);
  check('both browsers open a WebRTC data channel', demoOpen && luciaOpen, `demo=${demoOpen} lucia=${luciaOpen}`);
  if (demoOpen && luciaOpen) {
    await demoPage.type('textarea', 'P2P ping from Paris — can you hear me?');
    await demoPage.click('button.btn-primary');
    const seen = await luciaPage.waitForFunction(() => /P2P ping|París|escuch/i.test(document.querySelector('[data-world-thread]')?.innerText || ''), { timeout: 15000 }).then(() => true).catch(() => false);
    check('Lucia receives Demo’s line over the data channel', seen, seen ? '' : await luciaPage.$eval('[data-world-thread]', (el) => el.innerText).catch(() => 'empty'));
    check('neither browser posted chat text to /messages', demoPage._p2pPosts.length === 0 && luciaPage._p2pPosts.length === 0, `demo ${demoPage._p2pPosts.length} lucia ${luciaPage._p2pPosts.length}`);
  } else {
    check('Lucia receives Demo’s line over the data channel', false, 'channel never opened');
    check('neither browser posted chat text to /messages', false, 'skipped');
  }
  await browser.close();
}

const peerId = (await lucia('/api/world/state')).data.conversation?.peer?.id;
r = peerId ? await lucia('/api/world/report', { userId: peerId, conversationId: convId, reason: 'spam', detail: 'test' }) : { status: 0, data: {} };
check('report accepted without exposing chat to the client as admin data', r.status === 201);
r = await lucia('/api/world/conversations', null, 'GET');
check('past World chats are listed', r.status === 200 && r.data.conversations?.some((c) => c.id === convId));

await lucia(`/api/world/conversations/${convId}/end`, {});
const ended = await demo(`/api/world/conversations/${convId}`);
check('either person can end the hour', ended.data.conversation?.status === 'ENDED', ended.data.conversation?.status);

console.log('\nRandom queue');
const yuki = call(await login('yuki@conversa.local', travelerPw));
const piotr = call(await login('piotr@conversa.local', travelerPw));
await reset(yuki);
await reset(piotr);
await demo('/api/world/queue', { action: 'leave' });
await lucia('/api/world/queue', { action: 'leave' });
await yuki('/api/world/profile', { optedIn: true, city: 'Tokyo', country: 'Japan' }, 'PUT');
await piotr('/api/world/profile', { optedIn: true, city: 'Kraków', country: 'Poland' }, 'PUT');
const q1 = await yuki('/api/world/queue', { action: 'join' });
const q2 = await piotr('/api/world/queue', { action: 'join' });
check('second person in the queue is paired (both must still accept)', q2.data.state === 'pending' && q2.data.invites?.[0]?.kind === 'RANDOM', `${q2.data.state} ${q2.data.invites?.[0]?.kind || ''} (yuki ${q1.data.state})`);
const rid = q2.data.invites?.[0]?.id;
if (rid) {
  await yuki(`/api/world/invites/${rid}`, { accept: true });
  const both = await piotr(`/api/world/invites/${rid}`, { accept: true });
  check('random chat starts only after both accept', both.data.status === 'ACCEPTED' && !!both.data.conversation?.id, both.data.status);
  if (both.data.conversation?.id) await piotr(`/api/world/conversations/${both.data.conversation.id}/end`, {});
} else {
  check('random chat starts only after both accept', false, 'no invite');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
