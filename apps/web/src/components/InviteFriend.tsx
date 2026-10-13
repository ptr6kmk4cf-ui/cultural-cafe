'use client';

import { useEffect, useState } from 'react';
import { useUi } from '@/components/UiLocale';

function inviteMessage(url: string) {
  return `Take a table with me in Cultural Café. You write in your own language: ${url}`;
}

export function InviteFriend({ code, compact = false }: { code: string; compact?: boolean }) {
  const { t } = useUi();
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(`/join/${code}`);

  useEffect(() => {
    setUrl(`${window.location.origin}/join/${code}`);
  }, [code]);

  const message = inviteMessage(url);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
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
        <button type="button" className="btn-primary" onClick={share}>{t('share')}</button>
        <button type="button" className="btn-secondary" onClick={copy}>{copied ? t('copied') : t('copyLink')}</button>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold text-white">{t('someoneYouKnow')}</h2>
      <p className="text-sm text-ink-300">{t('sendThisLink')}</p>
      <p className="break-all rounded-xl bg-black/30 px-3 py-2 text-xs text-ink-200">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={share}>{t('share')}</button>
        <button type="button" className="btn-secondary" onClick={copy}>{copied ? t('copied') : t('copyLink')}</button>
      </div>
    </div>
  );
}
