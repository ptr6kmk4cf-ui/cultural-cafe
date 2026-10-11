// Packages the Chrome extension for distribution.
//   npm run package:ext                                   (backend = http://localhost:3000, this computer only)
//   CONVERSA_API_URL=https://app.example.com npm run package:ext
// Output: release/conversa-ai-extension-v<version>.zip (Chrome Web Store-ready) and a copy in
// apps/web/public/downloads/ that the dashboard's Download page links to.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'apps/extension');
const DIST = path.join(EXT, 'dist');
const RELEASE = path.join(ROOT, 'release');
const DOWNLOADS = path.join(ROOT, 'apps/web/public/downloads');
const API = (process.env.CONVERSA_API_URL || 'http://localhost:3000').replace(/\/$/, '');

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const apiUrl = new URL(API);
if (apiUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
  fail(`CONVERSA_API_URL must use https:// for non-local backends (got ${API})`);
}

execFileSync(process.execPath, [path.join(EXT, 'build.mjs')], { stdio: 'inherit', env: { ...process.env, CONVERSA_API_URL: API } });

// Guard against permission creep: the store listing and our privacy promises depend on this.
const manifest = JSON.parse(await readFile(path.join(DIST, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
const extraPerms = (manifest.permissions ?? []).filter((p) => p !== 'storage');
if (extraPerms.length) fail(`unexpected permissions: ${extraPerms.join(', ')}`);
if ((manifest.host_permissions ?? []).some((h) => h.includes('<all_urls>') || h.startsWith('*://*/'))) fail('host_permissions must not be broad');

const name = `conversa-ai-extension-v${manifest.version}.zip`;
const out = path.join(RELEASE, name);
await mkdir(RELEASE, { recursive: true });
await rm(out, { force: true });
// -X drops macOS extra attributes; files are at the zip root as the Web Store requires.
execFileSync('zip', ['-r', '-X', '-q', out, '.', '-x', '.*'], { cwd: DIST });

const buf = await readFile(out);
const sha256 = createHash('sha256').update(buf).digest('hex');
await mkdir(DOWNLOADS, { recursive: true });
await copyFile(out, path.join(DOWNLOADS, 'conversa-ai-extension.zip'));
const info = { version: manifest.version, apiUrl: API, file: '/downloads/conversa-ai-extension.zip', size: (await stat(out)).size, sha256, builtAt: new Date().toISOString() };
await writeFile(path.join(DOWNLOADS, 'extension.json'), JSON.stringify(info, null, 2));

console.log(`\n✓ ${path.relative(ROOT, out)}  (${(info.size / 1024).toFixed(0)} KB, sha256 ${sha256.slice(0, 12)}…)`);
console.log(`✓ dashboard download: ${API}${info.file}`);
console.log(`  backend baked in: ${API}${apiUrl.hostname === 'localhost' ? '  — works on this computer only; set CONVERSA_API_URL for a hosted backend' : ''}`);
