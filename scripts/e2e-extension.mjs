// End-to-end test of the real Chrome extension against the local demo site.
//   npm run build:ext && npm run test:e2e
// Needs: web app on :3000 (DEV_TOOLS=true), demo site on :4000, and Chrome for Testing:
//   PUPPETEER_CACHE_DIR=.cache/puppeteer npx puppeteer browsers install chrome
// Set HEADFUL=1 to watch it run.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'apps/extension/dist');
const API = process.env.API_URL || 'http://localhost:3000';
const DEMO = process.env.DEMO_URL || 'http://localhost:4000';
process.env.PUPPETEER_CACHE_DIR ||= path.join(ROOT, '.cache/puppeteer');

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------- account setup (API)
const stamp = Date.now().toString(36);
const email = `e2e-${stamp}@test.local`;
const password = 'correct-horse-battery';
let cookie = '';
async function apiReq(p, { method, body, form } = {}) {
  const res = await fetch(API + p, {
    method: method ?? (body || form ? 'POST' : 'GET'),
    headers: { origin: API, ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const demoThreads = async () => (await (await fetch(`${DEMO}/api/threads`)).json()).threads;
const demoThread = async (id) => (await (await fetch(`${DEMO}/api/threads/${id}`)).json()).thread;
const threadFor = async (profileId) => (await demoThreads()).find((t) => t.profileId === profileId);

console.log(`\nConversa extension E2E → web ${API}, demo ${DEMO}\n`);
console.log('Setup');
await fetch(`${DEMO}/api/reset`, { method: 'POST' });
check('register test user', (await apiReq('/api/auth/register', { body: { email, password, name: 'E2E', birthDate: '1991-03-03', confirmAdult: true, acceptTerms: true } })).status === 201);
await apiReq('/api/settings/personality', {
  method: 'PUT',
  body: { displayName: 'Sam', aboutMe: 'Engineer in Paris. Climbs at Fontainebleau. Hiked in Portugal last summer.', interests: ['climbing', 'hiking', 'travel', 'cooking'], intentions: 'long-term relationship', personality: 'curious, warm', style: 'charming', humorLevel: 1, flirtingLevel: 1, formality: 1, messageLength: 'short', useEmojis: true, topicsToAvoid: [], boundaries: '' },
});
await apiReq('/api/settings/preferences', { method: 'PUT', body: { ageMin: 25, ageMax: 38, location: 'Paris', maxDistanceKm: 100, relationshipGoals: ['long-term relationship'], interests: ['climbing', 'hiking', 'travel', 'cooking'], lifestyle: ['non-smoker'], physicalPreferences: '', dealbreakers: ['smoker'], analyzePhotos: false } });
const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#2a8' } }).jpeg().toBuffer();
const fd = new FormData();
fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'trip.jpg');
fd.append('caption', 'Hiking in Portugal last summer');
fd.append('tags', 'holiday,vacaciones,trip,viaje,foto,photo');
fd.append('category', 'TRAVEL');
fd.append('aiApproved', 'true');
const photoUp = await apiReq('/api/photos', { form: fd });
check('upload AI-approved travel photo', photoUp.status === 201);

// ------------------------------------------------------------- browser
const browser = await puppeteer.launch({
  headless: !process.env.HEADFUL,
  pipe: true,
  enableExtensions: [EXT],
  args: ['--no-first-run', '--no-default-browser-check'],
  defaultViewport: { width: 1400, height: 900 },
});

const panelText = (page) =>
  page.evaluate(() => [...(document.getElementById('conversa-ai-root')?.shadowRoot?.children ?? [])].filter((n) => n.tagName !== 'STYLE').map((n) => n.textContent).join(' '));
async function waitPanelText(page, re, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (re.test(await panelText(page))) return true;
    await sleep(250);
  }
  return false;
}
/** Clicks a button inside the panel's shadow DOM by its visible label (waits for it to appear). */
async function panelClick(page, label, index = 0, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const ok = await page.evaluate(
      (label, index) => {
        const root = document.getElementById('conversa-ai-root')?.shadowRoot;
        const btns = [...(root?.querySelectorAll('button, a') ?? [])].filter((b) => b.textContent.includes(label) && !b.disabled);
        btns[index]?.click();
        return !!btns[index];
      },
      label,
      index,
    );
    if (ok) return true;
    await sleep(250);
  }
  return false;
}
const panelValues = (page) => page.evaluate(() => [...(document.getElementById('conversa-ai-root')?.shadowRoot?.querySelectorAll('textarea') ?? [])].map((t) => t.value));
async function openPanel(page) {
  await page.waitForFunction(() => document.getElementById('conversa-ai-root')?.shadowRoot?.querySelector('.launcher, .panel'), { timeout: 15000 });
  await page.evaluate(() => document.getElementById('conversa-ai-root').shadowRoot.querySelector('.launcher')?.click());
}

try {
  // ----------------------------------------------------------- login + connect
  console.log('\nLogin & extension connection');
  // The extension opens its own onboarding tab on install; close it so our tab stays in front
  // (background tabs don't run animation frames, which Puppeteer's click/type rely on).
  await sleep(1500);
  const page = await browser.newPage();
  for (const p of await browser.pages()) if (p !== page) await p.close();
  await page.bringToFront();
  page.setDefaultTimeout(60000);
  await page.goto(`${API}/login?next=/app/extension`, { waitUntil: 'load' });
  await sleep(1500); // let React hydrate before typing
  await page.type('input[type=email]', email);
  await page.type('input[type=password]', password);
  await page.click('button.btn-primary');
  const loggedIn = await page.waitForFunction(() => location.pathname === '/app/extension', { timeout: 60000 }).then(() => true, () => false);
  check('login through web UI', loggedIn, page.url());
  const detected = await page.waitForFunction(() => document.body.innerText.includes('detected') && !document.body.innerText.includes('not detected'), { timeout: 15000 }).then(() => true, () => false);
  check('dashboard detects installed extension', detected);
  await page.click('button.btn-primary');
  const connected = await page.waitForFunction(() => document.body.innerText.includes('Extension connected'), { timeout: 15000 }).then(() => true, () => false);
  check('one-click connect hands token to extension', connected);

  const other = await browser.newPage();
  await other.goto(`${API}/legal/privacy`, { waitUntil: 'load' });
  await sleep(800);
  check('panel NOT injected on non-dating pages', (await other.$('#conversa-ai-root')) === null);
  await other.close();

  // ----------------------------------------------------------- discover → openers → one-click insert
  console.log('\nFind matches + one-click opener insertion (demo site)');
  await page.goto(DEMO, { waitUntil: 'load' });
  await page.waitForSelector('[data-conversa-profile]');
  await openPanel(page);
  check('panel connected on demo site', await waitPanelText(page, /E2E · FREE/));
  await panelClick(page, 'Find matches on this page');
  check('match analysis completes', await waitPanelText(page, /recommended · \d+ discarded/, 60000), (await panelText(page)).slice(0, 300));
  const marks = await page.evaluate(() => ({
    picked: document.querySelectorAll('.conversa-mark').length,
    faded: [...document.querySelectorAll('[data-conversa-profile]')].filter((c) => c.style.opacity === '0.35').map((c) => c.dataset.profileId),
  }));
  check('recommended profiles marked on the page', marks.picked > 0, JSON.stringify(marks));
  check('smokers (Lena p3, Jonas p11) faded out', marks.faded.includes('p3') && marks.faded.includes('p11'), JSON.stringify(marks.faded));

  const threadsBefore = (await demoThreads()).length;
  await panelClick(page, 'Write opener');
  check('3 openers generated', await waitPanelText(page, /Uses:/, 60000));
  const drafts = await panelValues(page);
  await panelClick(page, '↧ Insert');
  await sleep(600);
  const modal = await page.evaluate(() => ({
    open: document.querySelector('#composerModal')?.classList.contains('open'),
    value: document.querySelector('#composerModal [data-conversa-input]')?.value,
    profileId: document.querySelector('#composerModal [data-conversa-composer]')?.dataset.profileId,
  }));
  check('opener inserted into site composer', modal.open && modal.value === drafts[0], JSON.stringify(modal).slice(0, 200));
  await sleep(1500);
  check('insertion does NOT send (user must press Send)', (await demoThreads()).length === threadsBefore);
  await page.focus('#composerModal [data-conversa-input]');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  const afterShift = await page.$eval('#composerModal [data-conversa-input]', (t) => t.value);
  check('Shift+Enter adds a newline, does not send', afterShift.endsWith('\n') && (await demoThreads()).length === threadsBefore);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await sleep(1200);
  const sentThread = await threadFor(modal.profileId);
  check('pressing Enter sends the message', sentThread && (await demoThread(sentThread.id)).messages.some((m) => m.from === 'me' && m.text === drafts[0].trim()));
  let matches = [];
  for (let i = 0; i < 20; i++) {
    matches = (await apiReq('/api/matches')).data.matches ?? [];
    if (matches.find((m) => m.externalId === modal.profileId)?.status === 'CONTACTED') break;
    await sleep(500);
  }
  check('match marked CONTACTED after user send', matches.find((m) => m.externalId === modal.profileId)?.status === 'CONTACTED', `${modal.profileId}: ${JSON.stringify(matches.map((m) => [m.externalId, m.status]))}`);

  // ----------------------------------------------------------- chat reply insertion (existing French thread)
  console.log('\nChat assistant on existing conversation');
  await page.goto(`${DEMO}/messages.html?thread=t2`, { waitUntil: 'load' });
  await page.waitForSelector('[data-conversa-thread][data-thread-id="t2"]');
  await openPanel(page);
  check('chat view shows contact', await waitPanelText(page, /Camille/));
  await panelClick(page, 'Suggest replies');
  check('reply suggestions returned', await waitPanelText(page, /interest:/, 60000), (await panelText(page)).slice(0, 300));
  check('French detected', /French →/.test(await panelText(page)));
  const replyDraft = (await panelValues(page))[0];
  const t2Count = (await demoThread('t2')).messages.length;
  await panelClick(page, '↧ Insert');
  await sleep(400);
  check('reply inserted into composer', (await page.$eval('[data-conversa-thread] [data-conversa-input]', (t) => t.value)) === replyDraft);
  await sleep(1000);
  check('reply NOT auto-sent', (await demoThread('t2')).messages.length === t2Count);
  await page.$eval('[data-conversa-thread] [data-conversa-input]', (t) => (t.value = ''));

  // ----------------------------------------------------------- photo suggestion + attach (user-approved)
  console.log('\nPhoto suggestion → attach with explicit approval');
  await page.goto(`${DEMO}/profile.html?id=p2`, { waitUntil: 'load' });
  await page.waitForSelector('[data-page="profile"] [data-conversa-input]');
  await openPanel(page);
  await panelClick(page, 'Write 3 personalised openers');
  check('profile-page openers', await waitPanelText(page, /Uses:/, 60000));
  await panelClick(page, '↧ Insert');
  await sleep(400);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('[data-page="profile"] [data-conversa-send]')]);
  const sofia = await threadFor('p2');
  check('message to Sofía sent by user', !!sofia);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-conversa-message][data-direction="in"]')].length > 0, { timeout: 15000 });
  await sleep(800);
  await openPanel(page);
  await panelClick(page, 'Suggest replies');
  check('photo suggested for her holiday-photo question', await waitPanelText(page, /Suggested photo/, 60000), (await panelText(page)).slice(0, 400));
  await page.waitForFunction(() => document.getElementById('conversa-ai-root').shadowRoot.querySelector('img.thumb'), { timeout: 10000 }).catch(() => {});
  const sofiaCount = (await demoThread(sofia.id)).messages.length;
  await panelClick(page, 'Attach (you press Send)');
  const attached = await page.waitForFunction(() => document.querySelector('[data-conversa-thread] .preview img'), { timeout: 10000 }).then(() => true, () => false);
  check('photo attached to site composer with preview', attached);
  await sleep(1000);
  check('photo NOT sent until user presses Send', (await demoThread(sofia.id)).messages.length === sofiaCount);
  await page.click('[data-conversa-thread] [data-conversa-send]');
  await sleep(1500);
  check('user Send delivers photo message', (await demoThread(sofia.id)).messages.some((m) => m.from === 'me' && m.photo));
  await sleep(500);
  const sofiaContact = (await apiReq('/api/contacts')).data.contacts?.find((c) => c.name === 'Sofía');
  const sofiaDetail = sofiaContact ? (await apiReq(`/api/contacts/${sofiaContact.id}`)).data : null;
  check('photo share recorded in contact memory', !!sofiaDetail?.memories?.some((m) => m.kind === 'PHOTO_SHARED'), JSON.stringify(sofiaDetail?.memories?.map((m) => m.kind)));

  // ----------------------------------------------------------- autopilot + emergency stop
  console.log('\nAutopilot (demo only) + emergency stop');
  await apiReq('/api/dev/plan', { body: { plan: 'PREMIUM' } });
  check('enable autopilot (Premium)', (await apiReq('/api/autopilot', { method: 'PUT', body: { enabled: true, dailyFirstContactLimit: 5, dailyReplyLimit: 20, minDelaySeconds: 5, disclosureText: '(Sent with help from my AI assistant)' } })).status === 200);
  await fetch(`${DEMO}/api/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'p6', text: 'Hoi Noor! Ook gek op bordspellen?' }) });
  await sleep(3500);
  const noor = await threadFor('p6');
  check('Noor replied (unread thread exists)', noor?.unread === true);
  await page.goto(`${DEMO}/messages.html`, { waitUntil: 'load' });
  await openPanel(page);
  await waitPanelText(page, /PREMIUM/);
  await panelClick(page, 'Autopilot');
  await waitPanelText(page, /armed/);
  check('autopilot start button enabled', await panelClick(page, 'Start auto-reply on this tab'));
  let autoSent = null;
  for (let i = 0; i < 60 && !autoSent; i++) {
    await sleep(1000);
    autoSent = (await demoThread(noor.id)).messages.filter((m) => m.from === 'me').at(1) ?? null;
  }
  check('autopilot replied to Noor', !!autoSent);
  check('first autopilot message carries AI disclosure', autoSent?.text.includes('(Sent with help from my AI assistant)'), autoSent?.text);
  await panelClick(page, 'EMERGENCY STOP');
  check('emergency stop halts runner', await waitPanelText(page, /EMERGENCY STOP.*Emergency stop sent|Emergency stop sent/));
  const ap = (await apiReq('/api/autopilot')).data.settings;
  check('server records emergency stop', ap?.emergencyStop === true);
  const before = (await demoThread(noor.id)).messages.filter((m) => m.from === 'me').length;
  await fetch(`${DEMO}/api/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'p6', text: 'Nog één vraag?' }) });
  await sleep(9000);
  check('no automated messages after emergency stop', (await demoThread(noor.id)).messages.filter((m) => m.from === 'me').length === before + 1);
} catch (e) {
  failed++;
  console.log(`  ✗ crashed: ${e.stack}`);
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
