// Logs in as the seeded demo user, visits every dashboard page, reports runtime
// errors and saves screenshots to .cache/screens.
//   npm run db:seed && node --env-file=apps/web/.env scripts/ui-screenshots.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PUPPETEER_CACHE_DIR ||= path.join(ROOT, '.cache/puppeteer');
const API = process.env.API_URL || 'http://localhost:3000';
const OUT = path.join(ROOT, '.cache/screens');
const email = process.env.SEED_DEMO_EMAIL || 'demo@conversa.local';
const password = process.env.SEED_DEMO_PASSWORD;
if (!password) throw new Error('SEED_DEMO_PASSWORD not set (run with --env-file=apps/web/.env)');

const PAGES = ['/', '/login', '/register', '/legal/privacy', '/app', '/app/matches', '/app/shortlist', '/app/contacts/new', '/app/conversations', '/app/world', '/app/assistant', '/app/photos', '/app/personality', '/app/languages', '/app/autopilot', '/app/subscription', '/app/privacy', '/app/extension', '/app/download', '/app/admin'];

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: true, pipe: true, defaultViewport: { width: 1360, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(`${page.url()} console: ${m.text().slice(0, 200)}`));
page.on('response', (r) => r.status() >= 400 && errors.push(`${page.url()} → ${r.status()} ${r.url()}`));
page.on('pageerror', (e) => errors.push(`${page.url()} pageerror: ${e.message.slice(0, 200)}`));

const login = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: API }, body: JSON.stringify({ email, password }) });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error(`login failed (${login.status})`);
const [name, value] = cookie.split('=');
await browser.setCookie({ name, value, domain: new URL(API).hostname, path: '/', httpOnly: true });

let bad = 0;
for (const p of PAGES) {
  const res = await page.goto(API + p, { waitUntil: 'load', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));
  const overlay = await page.evaluate(() => !!document.querySelector('nextjs-portal') && /Unhandled Runtime Error|Build Error/.test(document.querySelector('nextjs-portal')?.shadowRoot?.textContent ?? ''));
  const file = path.join(OUT, `${p === '/' ? 'home' : p.slice(1).replaceAll('/', '_')}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const ok = res.status() < 400 && !overlay;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${p} → ${res.status()}${overlay ? ' (error overlay)' : ''} ${page.url() !== API + p ? `(at ${page.url()})` : ''}`);
}
await browser.close();
console.log(errors.length ? `\nConsole errors:\n${[...new Set(errors)].join('\n')}` : '\nNo console errors.');
console.log(`\nScreenshots: ${OUT}`);
process.exit(bad || errors.length ? 1 : 0);
