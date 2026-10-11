'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Badge, PageHeader } from '@/components/ui';

type ExtInfo = { version: string; apiUrl: string; file: string; size: number; sha256: string; builtAt: string };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type Device = 'ios' | 'android' | 'desktop';

export default function DownloadPage() {
  const [ext, setExt] = useState<ExtInfo | null | undefined>(undefined);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<Device>('desktop');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    fetch('/downloads/extension.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setExt, () => setExt(null));
    const ua = navigator.userAgent;
    setDevice(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop');
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
    setOrigin(window.location.origin);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  }

  const local = /^(localhost|127\.0\.0\.1)$/.test(origin ? new URL(origin).hostname : '');
  const insecure = origin.startsWith('http://') && !local;
  const extForOtherServer = ext && origin && ext.apiUrl !== origin;

  const InstallButton = () =>
    installed ? (
      <Badge tone="green">Installed on this device</Badge>
    ) : prompt ? (
      <button className="btn-primary" onClick={install}>⇩ Install Cultural Café</button>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Download & install" subtitle="Use Cultural Café on your computer and your phone. Everything stays in your account — install on as many devices as you like." />

      {insecure && <Alert kind="warning">This server is reached over plain http. Phones and browsers only install apps from https:// addresses — deploy the backend with HTTPS first.</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`card space-y-3 ${device === 'desktop' ? 'ring-1 ring-brand-500/40' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">💻 Computer</h2>
            {device === 'desktop' && <Badge tone="brand">this device</Badge>}
          </div>

          <h3 className="text-sm font-semibold text-white">1 · Chrome extension (panel next to dating sites)</h3>
          {ext === undefined ? null : ext ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <a className="btn-primary" href={ext.file} download>⇩ Download extension v{ext.version}</a>
                <span className="text-xs text-ink-400">{(ext.size / 1024).toFixed(0)} KB · built {new Date(ext.builtAt).toLocaleDateString()}</span>
              </div>
              {extForOtherServer && (
                <Alert kind="warning">This package connects to {ext.apiUrl}, not to {origin}. Rebuild it with <code>CONVERSA_API_URL={origin} npm run package:ext</code>.</Alert>
              )}
            </>
          ) : (
            <Alert kind="info">No package built yet. Run <code>npm run package:ext</code> on the server.</Alert>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-300">
            <li>Unzip the downloaded file into a folder you will keep (e.g. Documents/CulturalCafe).</li>
            <li>Open <code className="rounded bg-white/10 px-1">chrome://extensions</code> (Edge: <code className="rounded bg-white/10 px-1">edge://extensions</code>) and turn on <b>Developer mode</b>.</li>
            <li>Click <b>Load unpacked</b> and choose the unzipped folder.</li>
            <li>Go to <Link className="text-brand-300 underline" href="/app/extension">Browser Extension</Link> and click <b>Connect</b>.</li>
          </ol>
          <p className="text-xs text-ink-400">A one-click Chrome Web Store version will replace these steps once the listing is approved.</p>

          <h3 className="pt-2 text-sm font-semibold text-white">2 · Dashboard as a desktop app</h3>
          <InstallButton />
          {!installed && !prompt && (
            <p className="text-sm text-ink-300">Chrome / Edge: click the install icon (⊕) at the right of the address bar. Safari on Mac: <b>File → Add to Dock</b>.</p>
          )}
        </section>

        <section className={`card space-y-3 ${device !== 'desktop' ? 'order-first ring-1 ring-brand-500/40' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">📱 Phone</h2>
            {device !== 'desktop' && <Badge tone="brand">this device</Badge>}
          </div>
          <p className="text-sm text-ink-300">
            Phone browsers don&apos;t support extensions, so on your phone Cultural Café is an app on your home screen: the Café, reply assistant, translation, conversations, memory, photos and settings.
          </p>
          {device !== 'desktop' && <InstallButton />}

          <div className={`rounded-xl border p-3 ${device === 'ios' ? 'border-brand-500/40 bg-brand-500/5' : 'border-white/10'}`}>
            <h3 className="text-sm font-semibold text-white">iPhone / iPad (Safari)</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-300">
              <li>Open <b>{origin || 'this site'}</b> in Safari and sign in.</li>
              <li>Tap the <b>Share</b> button (□↑), then <b>Add to Home Screen</b>.</li>
              <li>Open Cultural Café from your home screen. To get replies, copy the chat and paste it into <b>AI Reply Assistant</b>.</li>
            </ol>
          </div>

          <div className={`rounded-xl border p-3 ${device === 'android' ? 'border-brand-500/40 bg-brand-500/5' : 'border-white/10'}`}>
            <h3 className="text-sm font-semibold text-white">Android (Chrome)</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-300">
              <li>Open <b>{origin || 'this site'}</b> in Chrome and sign in.</li>
              <li>Tap <b>Install app</b> (or menu ⋮ → <b>Add to Home screen</b>).</li>
              <li>In another app, select a message → <b>Share</b> → <b>Cultural Café</b>: it opens the reply assistant with the text filled in.</li>
            </ol>
          </div>

          {local && device === 'desktop' && (
            <Alert kind="info">
              You are on <code>{origin}</code>, which only exists on this computer. To install on your phone, the backend must be online at an https:// address (see README → Deployment).
            </Alert>
          )}
          <p className="text-xs text-ink-400">Cultural Café never sends messages from your phone by itself — you copy or share, and you press Send.</p>
        </section>
      </div>
    </div>
  );
}
