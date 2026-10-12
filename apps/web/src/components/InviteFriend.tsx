'use client';

import { useEffect, useState } from 'react';

function inviteMessage(url: string) {
  return `Take a table with me in Cultural Café. You write in your own language: ${url}`;
}

export function InviteFriend({ code, compact = false }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(`/join/${code}`);

  useEffect(() => {
    setUrl(`${window.location.origin}/join/${code}`);
  }, [code]);

  const message = inviteMessage(url);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      const el = document.createElement('textarea');
      el.value = message;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Cultural Café', text: message, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    await copy();
  }

  if (compact) {
    return (
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary" onClick={share}>Share invite</button>
        <button type="button" className="btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <p className="text-xs uppercase tracking-wide text-ink-400">Optional</p>
      <h2 className="text-lg font-semibold text-white">Or someone you already know</h2>
      <p className="text-sm text-ink-300">
        Send this link. They create an account, join the Café, and you both still tap accept. Nobody else sees the link.
      </p>
      <p className="break-all rounded-xl bg-black/30 px-3 py-2 text-xs text-ink-200">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={share}>Share</button>
        <button type="button" className="btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy message'}</button>
      </div>
    </div>
  );
}
