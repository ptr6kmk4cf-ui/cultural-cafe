// Builds the MV3 extension into ./dist
//   CONVERSA_API_URL=https://app.example.com npm run build:ext
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(dir, 'dist');
const watch = process.argv.includes('--watch');
const API = (process.env.CONVERSA_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir, 'package.json'), 'utf8'));

// Load the platform registry from the shared package so permissions always match it.
const reg = await esbuild.build({ entryPoints: [path.join(dir, '../../packages/shared/src/platforms.ts')], bundle: true, format: 'esm', write: false });
const { PLATFORMS } = await import(`data:text/javascript;base64,${Buffer.from(reg.outputFiles[0].text).toString('base64')}`);
const siteMatches = Object.values(PLATFORMS).flatMap((p) => p.origins.map((o) => `${o}/*`));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const manifest = {
  manifest_version: 3,
  name: 'Cultural Café',
  short_name: 'Cultural Café',
  version: pkg.version,
  description: 'AI dating assistant: match screening, personalised openers, replies and translation on supported sites.',
  minimum_chrome_version: '116',
  permissions: ['storage'],
  host_permissions: [`${API}/*`, ...siteMatches],
  background: { service_worker: 'background.js' },
  action: { default_popup: 'popup.html', default_title: 'Cultural Café', default_icon: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' } },
  options_page: 'options.html',
  icons: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  content_scripts: [
    { matches: siteMatches, js: ['content.js'], run_at: 'document_idle' },
    { matches: [`${API}/app/extension*`], js: ['bridge.js'], run_at: 'document_idle' },
  ],
};
await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
await cp(path.join(dir, 'static'), dist, { recursive: true });

// Icons (rendered from SVG with sharp, available from the web workspace).
try {
  const sharp = (await import('sharp')).default;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8306a"/><stop offset="1" stop-color="#c026d3"/></linearGradient></defs><rect width="128" height="128" rx="30" fill="url(#g)"/><text x="64" y="88" font-family="Arial, sans-serif" font-size="74" font-weight="800" fill="#fff" text-anchor="middle">C</text></svg>`);
  await mkdir(path.join(dist, 'icons'), { recursive: true });
  for (const s of [16, 48, 128]) await sharp(svg).resize(s, s).png().toFile(path.join(dist, 'icons', `${s}.png`));
} catch (e) {
  console.warn('[ext] icon generation skipped:', e.message);
}

const ctx = await esbuild.context({
  entryPoints: {
    background: path.join(dir, 'src/background.ts'),
    content: path.join(dir, 'src/content/main.tsx'),
    bridge: path.join(dir, 'src/bridge.ts'),
    popup: path.join(dir, 'src/popup/popup.tsx'),
    options: path.join(dir, 'src/options/options.tsx'),
  },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define: { __API_BASE__: JSON.stringify(API), 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log(`[ext] watching… API=${API}`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log(`[ext] built to ${dist} (API=${API}, sites=${siteMatches.join(', ')})`);
}
