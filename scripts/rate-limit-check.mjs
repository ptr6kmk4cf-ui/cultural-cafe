// Rate limits live in Postgres, so separate server processes share one count.
//   node --env-file=apps/web/.env scripts/rate-limit-check.mjs
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');
const API = process.env.CONVERSA_API_URL || 'http://localhost:3000';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
};

/** A fresh Node process is a fresh "instance": nothing in memory is shared with the others. */
async function instance(key, limit, windowMs, tries, mode = 'serial') {
  const { stdout } = await run(
    'npx',
    ['tsx', '--env-file=.env', '--tsconfig', 'tsconfig.json', 'scripts/rate-limit-worker.mts', key, String(limit), String(windowMs), String(tries), mode],
    { cwd: WEB },
  );
  return JSON.parse(stdout.trim().split('\n').pop());
}

console.log('Several instances share one limit');
const key = `check:${Date.now()}`;
const results = await Promise.all([instance(key, 10, 60_000, 6), instance(key, 10, 60_000, 6), instance(key, 10, 60_000, 6)]);
const allowed = results.reduce((n, r) => n + r.allowed, 0);
const blocked = results.reduce((n, r) => n + r.blocked, 0);
check('3 instances x 6 requests against a limit of 10: exactly 10 get through', allowed === 10 && blocked === 8, `allowed ${allowed}, blocked ${blocked} (${results.map((r) => r.allowed).join('+')})`);

const later = await instance(key, 10, 60_000, 1);
check('a brand-new instance (a cold start) is still limited', later.allowed === 0 && later.blocked === 1, JSON.stringify(later));

const burst = `check-burst:${Date.now()}`;
const bursts = await Promise.all([instance(burst, 20, 60_000, 25, 'parallel'), instance(burst, 20, 60_000, 25, 'parallel')]);
const burstAllowed = bursts.reduce((n, r) => n + r.allowed, 0);
check('50 requests at the same moment from 2 instances: exactly 20 get through', burstAllowed === 20, `${bursts.map((r) => r.allowed).join('+')}`);

console.log('\nThe window resets');
const short = `check-short:${Date.now()}`;
const first = await instance(short, 2, 1500, 3);
check('limit of 2 blocks the third request', first.allowed === 2 && first.blocked === 1, JSON.stringify(first));
await new Promise((r) => setTimeout(r, 1700));
const again = await instance(short, 2, 1500, 1);
check('after the window ends, requests are allowed again', again.allowed === 1, JSON.stringify(again));

console.log('\nThrough the running app');
const email = `nobody${Date.now()}@cafe-test.example`;
let last;
const codes = [];
for (let i = 0; i < 9; i++) {
  last = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: API },
    body: JSON.stringify({ email, password: 'wrong-password-1' }),
  });
  codes.push(last.status);
}
const body = await last.json().catch(() => ({}));
check('9th wrong login for one email is refused (limit 8 per 15 min)', codes.slice(0, 8).every((c) => c === 401) && codes[8] === 429, codes.join(','));
check('the refusal says when to try again', Number(last.headers.get('retry-after')) > 0 && body.code === 'rate_limited', `retry-after ${last.headers.get('retry-after')}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
