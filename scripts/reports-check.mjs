// Reports: a reporter attaches lines from their screen, urgent reasons alert admins,
// and only admins can read reports.
//   node --env-file=apps/web/.env scripts/reports-check.mjs
const API = process.env.CONVERSA_API_URL || 'http://localhost:3000';
const demoEmail = process.env.SEED_DEMO_EMAIL || 'demo@conversa.local';
const travelerEmail = process.env.SEED_WORLD_EMAIL || 'lucia@conversa.local';
const adminEmail = process.env.ADMIN_EMAIL;
const password = process.env.SEED_DEMO_PASSWORD;
const travelerPw = process.env.SEED_WORLD_PASSWORD || password;
const adminPw = process.env.SEED_ADMIN_PASSWORD || password;
if (!password) throw new Error('SEED_DEMO_PASSWORD not set');
if (!adminEmail) throw new Error('ADMIN_EMAIL not set (the seed creates the admin from it)');

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
const page = async (cookie, path) => {
  const r = await fetch(`${API}${path}`, { headers: { cookie }, redirect: 'manual' });
  return { status: r.status, html: await r.text() };
};

const demoCookie = await login(demoEmail, password);
const luciaCookie = await login(travelerEmail, travelerPw);
const adminCookie = await login(adminEmail, adminPw);
const demo = call(demoCookie);
const lucia = call(luciaCookie);
const admin = call(adminCookie);

const demoId = (await admin('/api/admin/users')).data.users?.find((u) => u.email === demoEmail)?.id;
if (!demoId) throw new Error('could not read demo id');

const stamp = Date.now();
const rude = `You are worthless, go away ${stamp}`;
const rudeEs = `Eres inútil, vete ${stamp}`;
const mine = `Please stop writing that ${stamp}`;

console.log('Reporter attaches lines from their screen');
let r = await lucia('/api/world/report', {
  userId: demoId,
  reason: 'harassment',
  detail: 'Kept insulting me',
  lines: [
    { mine: false, text: rude, translation: rudeEs, at: new Date().toISOString() },
    { mine: true, text: mine, translation: null },
    { mine: false, text: '   ' },
  ],
});
check('harassment report is saved with its lines', r.status === 201 && r.data.urgent === true && r.data.attached === 2, `${r.status} urgent=${r.data.urgent} attached=${r.data.attached}`);
r = await lucia('/api/world/report', { userId: demoId, reason: 'underage_concern', detail: 'Said they are 15' });
check('under-18 report is urgent too', r.status === 201 && r.data.urgent === true, `${r.status} urgent=${r.data.urgent}`);
r = await lucia('/api/world/report', { userId: demoId, reason: 'spam' });
check('spam report is not urgent', r.status === 201 && r.data.urgent === false && r.data.attached === 0, `${r.status} urgent=${r.data.urgent}`);
r = await lucia('/api/world/report', { userId: demoId, reason: 'made_up' });
check('unknown reason is refused', r.status === 422, `${r.status}`);
r = await lucia('/api/world/report', { userId: demoId, reason: 'other', lines: Array.from({ length: 31 }, (_, i) => ({ mine: false, text: `line ${i}` })) });
check('more than 30 lines is refused', r.status === 422, `${r.status}`);

console.log('\nOnly admins can read reports');
r = await demo('/api/admin/reports');
check('a regular user gets 403 from the reports API', r.status === 403, `${r.status}`);
let p = await page(demoCookie, '/app/admin/reports');
check('a regular user gets 404 from the reports page, with no report text', p.status === 404 && !p.html.includes(rude) && !p.html.includes('Kept insulting'), `${p.status}`);
p = await page(demoCookie, '/app/admin/users');
check('a regular user cannot see the registered-users list', p.status === 404 && !p.html.includes(travelerEmail), `${p.status}`);
r = await demo('/api/admin/reports/whatever', { status: 'reviewed' }, 'PATCH');
check('a regular user cannot mark reports reviewed', r.status === 403, `${r.status}`);

console.log('\nAdmin sees the reports, urgent first');
r = await admin('/api/admin/reports');
const reports = r.data.reports ?? [];
const mineReports = reports.filter((x) => x.target?.id === demoId);
const harass = mineReports.find((x) => x.reason === 'harassment' && x.detail === 'Kept insulting me');
check('admin can list reports', r.status === 200 && mineReports.length >= 3, `${r.status} ${mineReports.length}`);
const rank = (x) => (x.status === 'open' ? (x.urgent ? 0 : 1) : 2);
check('urgent open reports come first', reports.length > 0 && reports.every((x, i) => i === 0 || rank(reports[i - 1]) <= rank(x)), reports.map((x) => x.reason).join(','));
check('urgent count is reported', r.data.urgentOpen >= 2, `urgentOpen=${r.data.urgentOpen}`);
check('attached lines come back readable, in order, blanks dropped', harass?.lines?.length === 2 && harass.lines[0].text === rude && harass.lines[0].translation === rudeEs && harass.lines[1].mine === true && harass.lines[1].text === mine, JSON.stringify(harass?.lines ?? null).slice(0, 120));
check('report names the reporter and the reported person', harass?.reporter?.email === travelerEmail && harass?.target?.email === demoEmail);
check('admins were alerted about the urgent report', harass?.alerted === true, `alerted=${harass?.alerted}`);

p = await page(adminCookie, '/app/admin/reports');
check('admin reports page shows the alert and the lines', p.status === 200 && p.html.includes('data-urgent-alert') && p.html.includes(rude), `${p.status}`);
p = await page(adminCookie, '/app/admin');
check('operator page shows the urgent alert', p.status === 200 && p.html.includes('data-urgent-alert'), `${p.status}`);
p = await page(adminCookie, '/app');
check('sidebar shows the urgent count on every page', p.status === 200 && p.html.includes('data-urgent-badge'), `${p.status}`);

console.log('\nReviewing');
const before = r.data.urgentOpen;
r = await admin(`/api/admin/reports/${harass?.id}`, { status: 'reviewed' }, 'PATCH');
check('admin can mark a report reviewed', r.status === 200, `${r.status}`);
r = await admin('/api/admin/reports');
const after = r.data.reports?.find((x) => x.id === harass?.id);
check('reviewed report leaves the urgent count', after?.status === 'reviewed' && !!after.reviewedAt && r.data.urgentOpen === before - 1, `${after?.status} ${before}→${r.data.urgentOpen}`);
r = await admin(`/api/admin/reports/${harass?.id}`, { status: 'open' }, 'PATCH');
check('admin can reopen it', r.status === 200);
r = await admin('/api/admin/reports/does-not-exist', { status: 'reviewed' }, 'PATCH');
check('unknown report is 404', r.status === 404, `${r.status}`);

console.log('\nThe reporter can export what they sent');
const exp = await fetch(`${API}/api/account/export`, { headers: { cookie: luciaCookie, origin: API } });
const expData = await exp.json().catch(() => ({}));
const exported = expData.world?.reports?.find((x) => x.detail === 'Kept insulting me');
check('account export includes the attached lines, readable', exp.status === 200 && exported?.messages?.[0]?.text === rude, `${exp.status}`);

console.log('\nReport dialog in the browser');
{
  async function reset(fn) {
    const s = await fn('/api/world/state');
    if (s.data.conversation?.id) await fn(`/api/world/conversations/${s.data.conversation.id}/end`, {});
    for (const i of s.data.invites ?? []) await fn(`/api/world/invites/${i.id}`, { accept: false });
  }
  await reset(demo);
  await reset(lucia);
  await demo('/api/world/profile', { optedIn: true, city: 'Paris', country: 'France' }, 'PUT');
  const luciaId = (await admin('/api/admin/users')).data.users?.find((u) => u.email === travelerEmail)?.id;
  let inv = await demo('/api/world/invite', { toId: luciaId ?? 'x' });
  // After the café tests they have met; a second table goes through Past contacts.
  if (inv.status === 409) inv = await demo('/api/world/contacts/sit', { peerId: luciaId ?? 'x' });
  const acc = await lucia(`/api/world/invites/${inv.data.invite?.id}`, { accept: true });
  const convId = acc.data.conversation?.id;
  check('a table is open for the browser check', !!convId, `${inv.status} ${inv.data.error || ''} ${acc.status}`);

  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true, pipe: true, args: ['--no-sandbox'] });
  const open = async (cookieHeader, path) => {
    const ctx = await browser.createBrowserContext();
    const pg = await ctx.newPage();
    await pg.setViewport({ width: 1200, height: 900 });
    const eq = cookieHeader.indexOf('=');
    await pg.setCookie({ name: cookieHeader.slice(0, eq), value: cookieHeader.slice(eq + 1), domain: 'localhost', path: '/', httpOnly: true });
    await pg.goto(`${API}${path}`, { waitUntil: 'load', timeout: 90000 });
    return pg;
  };
  const shots = process.env.REPORT_SHOTS_DIR;
  try {
    const demoPage = await open(demoCookie, `/app/world/${convId}`);
    const luciaPage = await open(luciaCookie, `/app/world/${convId}`);
    const ready = (pg) => pg.waitForFunction(() => document.querySelector('[data-world-peer]')?.getAttribute('data-world-peer') === 'open', { timeout: 30000 }).then(() => true).catch(() => false);
    const linked = (await ready(demoPage)) && (await ready(luciaPage));
    check('both browsers are connected', linked);
    const line = `Stop wasting my time, idiot ${stamp}`;
    await demoPage.type('textarea', line);
    await demoPage.click('[data-world-send]');
    const arrived = await luciaPage
      .waitForFunction(() => (document.querySelector('[data-world-thread]')?.innerText || '').split('\n').filter(Boolean).length > 1, { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    check("Demo's line reaches Lucía's screen", arrived);

    await luciaPage.click('[data-world-report]');
    await luciaPage.waitForSelector('[data-report-dialog]', { timeout: 10000 });
    const sendDisabled = await luciaPage.$eval('[data-report-send]', (b) => b.disabled);
    check('report cannot be sent before a reason is chosen', sendDisabled === true);
    const theirs = await luciaPage.$$('[data-report-line="theirs"]');
    check("the dialog lists Demo's line to attach", theirs.length >= 1, `${theirs.length} of theirs`);
    if (theirs.length) await theirs[theirs.length - 1].click();
    await luciaPage.click('input[name="report-reason"][value="harassment"]');
    await luciaPage.type('[data-report-detail]', 'Insult at the table');
    if (shots) await luciaPage.screenshot({ path: `${shots}/report-dialog.png` });
    await luciaPage.click('[data-report-send]');
    const closed = await luciaPage.waitForFunction(() => !document.querySelector('[data-report-dialog]'), { timeout: 15000 }).then(() => true).catch(() => false);
    check('the dialog closes after sending', closed);

    const list = await admin('/api/admin/reports');
    const sent = list.data.reports?.find((x) => x.detail === 'Insult at the table');
    check('admin sees the line Lucía attached from her screen', !!sent && sent.urgent && sent.lines.length === 1 && sent.lines[0].mine === false && sent.lines[0].text.includes(String(stamp)), JSON.stringify(sent?.lines ?? null).slice(0, 140));
    check('the line keeps both the original and what Lucía saw', !!sent?.lines?.[0]?.translation, sent?.lines?.[0]?.translation?.slice(0, 60));

    const adminPage = await open(adminCookie, '/app/admin/reports');
    const shown = await adminPage.evaluate((s) => document.body.innerText.includes(s), String(stamp));
    check('the admin reports page shows it', shown);
    if (shots) await adminPage.screenshot({ path: `${shots}/admin-reports.png`, fullPage: true });
  } finally {
    await browser.close();
    await demo(`/api/world/conversations/${convId}/end`, {});
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
