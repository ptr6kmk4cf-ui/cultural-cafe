// Verifies the installable app + downloads: Chrome installability, manifest/icons, Android share
// flow (shared text must not reach the server), extension download, and phone-size layouts.
//   npm run package:ext && npm run test:pwa        (needs the seeded demo user, see README)
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { KnownDevices } from 'puppeteer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PUPPETEER_CACHE_DIR ||= path.join(ROOT, '.cache/puppeteer');
const API = process.env.API_URL || 'http://localhost:3000';
const OUT = path.join(ROOT, '.cache/screens/mobile');
const SERVER_LOG = process.env.SERVER_LOG; // optional: path to the web server's log, to prove shared text never reached it

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  cond ? passed++ : failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name} ${cond ? '' : extra}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: API }, body: JSON.stringify({ email: process.env.SEED_DEMO_EMAIL || 'demo@conversa.local', password: process.env.SEED_DEMO_PASSWORD }) });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error(`login failed (${login.status}) — run with --env-file=apps/web/.env after npm run db:seed`);
const [cName, cValue] = cookie.split('=');

console.log(`\nInstallable app & downloads → ${API}\n`);
console.log('Manifest, icons, downloads');
const manifest = await (await fetch(`${API}/manifest.webmanifest`)).json();
check('manifest served', manifest.name && manifest.start_url === '/app' && manifest.display === 'standalone');
check('share target → /app/assistant', manifest.share_target?.action === '/app/assistant');
for (const icon of manifest.icons) {
  const r = await fetch(API + icon.src);
  const meta = r.ok ? await sharp(Buffer.from(await r.arrayBuffer())).metadata() : null;
  check(`icon ${icon.src} is ${icon.sizes}`, meta && `${meta.width}x${meta.height}` === icon.sizes);
}
check('apple touch icon', (await fetch(`${API}/icons/apple-touch-icon.png`)).ok);
check('offline page', (await fetch(`${API}/offline.html`)).ok);
const info = await fetch(`${API}/downloads/extension.json`).then((r) => (r.ok ? r.json() : null));
check('extension package metadata', !!info?.version, 'run npm run package:ext');
if (info) {
  const zip = await fetch(API + info.file);
  const buf = Buffer.from(await zip.arrayBuffer());
  check('extension zip downloadable, size matches', zip.ok && buf.length === info.size && buf.subarray(0, 2).toString() === 'PK');
}

const browser = await puppeteer.launch({ headless: true, pipe: true });
await browser.setCookie({ name: cName, value: cValue, domain: new URL(API).hostname, path: '/', httpOnly: true });
try {
  console.log('\nDesktop install (Chrome)');
  const page = await browser.newPage();
  await page.goto(`${API}/app`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready.then(() => true), { timeout: 30000 });
  await page.reload({ waitUntil: 'load' });
  const cdp = await page.createCDPSession();
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  check('Chrome reports the app as installable', installabilityErrors.length === 0, JSON.stringify(installabilityErrors));
  check('service worker controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));

  console.log('\nAndroid share → reply assistant');
  const token = `share-${Date.now().toString(36)}`;
  const sharedText = `Them: Hola! ¿Qué haces este fin de semana? ${token}`;
  await page.goto(`${API}/app/assistant?title=Sofía&text=${encodeURIComponent(sharedText)}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('textarea')?.value, { timeout: 30000 });
  const prefilled = await page.$eval('textarea', (t) => t.value);
  check('assistant prefilled with shared text', prefilled.includes(token) && prefilled.includes('Sofía'), prefilled.slice(0, 120));
  check('shared text removed from the address bar', page.url() === `${API}/app/assistant`, page.url());
  check('"received from another app" notice shown', (await page.content()).includes('Conversation received from another app'));
  if (SERVER_LOG) {
    await sleep(500);
    check('shared text never reached the server log', !(await readFile(SERVER_LOG, 'utf8')).includes(token));
  }

  console.log('\nPhone layouts');
  await mkdir(OUT, { recursive: true });
  const pages = ['/app', '/app/assistant', '/app/conversations', '/app/world', '/app/matches', '/app/shortlist', '/app/contacts/new', '/app/photos', '/app/personality', '/app/languages', '/app/autopilot', '/app/subscription', '/app/privacy', '/app/extension', '/app/download'];
  for (const [label, device] of [['iphone', KnownDevices['iPhone 13']], ['android', KnownDevices['Pixel 5']]]) {
    const m = await browser.newPage();
    await m.emulate(device);
    const overflow = [];
    for (const p of pages) {
      await m.goto(API + p, { waitUntil: 'load', timeout: 90000 });
      await sleep(900);
      const w = await m.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));
      if (w.scroll > w.view + 1) overflow.push(`${p} (${w.scroll}px > ${w.view}px)`);
      if (['/app', '/app/assistant', '/app/download'].includes(p)) await m.screenshot({ path: path.join(OUT, `${label}${p.replaceAll('/', '_')}.png`) });
    }
    check(`${label}: no page wider than the screen`, overflow.length === 0, overflow.join(', '));
    await m.goto(`${API}/app`, { waitUntil: 'load' });
    await m.click('button[aria-label="Menu"]');
    await sleep(400);
    await m.screenshot({ path: path.join(OUT, `${label}_menu-open.png`) });
    const menu = await m.evaluate(() => {
      const r = document.querySelector('aside').getBoundingClientRect();
      const signOut = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Sign out'));
      const s = signOut.getBoundingClientRect();
      return { open: r.left >= 0, signOutVisible: s.bottom <= window.innerHeight && s.top >= 0 };
    });
    check(`${label}: menu opens and account box is reachable`, menu.open && menu.signOutVisible, JSON.stringify(menu));
    await m.click('aside a[href="/app/assistant"]');
    await m.waitForFunction(() => location.pathname === '/app/assistant');
    await sleep(400);
    check(`${label}: menu closes after navigating`, await m.evaluate(() => document.querySelector('aside').getBoundingClientRect().right <= 0));
    await m.close();
  }
} catch (e) {
  failed++;
  console.log(`  ✗ crashed: ${e.stack}`);
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failed} failed   (screenshots: ${path.relative(ROOT, OUT)})`);
process.exit(failed ? 1 : 0);
