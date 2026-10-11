// Diagnostic: checks that Chrome for Testing starts with the extension loaded and
// that the content script injects on the demo site.  node scripts/chrome-probe.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PUPPETEER_CACHE_DIR ||= path.join(ROOT, '.cache/puppeteer');
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);

const b = await puppeteer.launch({ headless: !process.env.HEADFUL, pipe: true, enableExtensions: [path.join(ROOT, 'apps/extension/dist')], protocolTimeout: 30000 });
try {
  log(`launched ${await b.version()}`);
  const p = await b.newPage();
  await p.goto('http://localhost:4000', { waitUntil: 'load' });
  log('demo loaded');
  await new Promise((r) => setTimeout(r, 2000));
  log(`panel injected: ${await p.evaluate(() => !!document.getElementById('conversa-ai-root'))}`);
  await p.goto('http://localhost:3000/login', { waitUntil: 'load' });
  log(`login loaded: ${await p.title()}`);
  log(`targets: ${b.targets().map((t) => `${t.type()}:${t.url()}`).join(' | ')}`);
} finally {
  await b.close();
  log('closed');
}
