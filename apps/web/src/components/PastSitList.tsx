'use client';

import { useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert } from '@/components/ui';
import { sitWithPastPeer } from '@/lib/past-sit';

type PastHour = {
  id: string;
  startedAt: string | Date;
  prompt?: { title: string } | null;
  peer: { id: string; name: string; guest?: boolean } | null;
};

export function PastSitList({ hours }: { hours: PastHour[] }) {
  const { t } = useUi();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function sit(hour: PastHour) {
    const peerId = hour.peer?.id;
    if (!peerId || busy) return;
    setBusy(peerId);
    setError('');
    try {
      const next = await sitWithPastPeer(peerId);
      if (next === 'waiting') setError(t('mustAccept', { name: hour.peer?.name ?? t('someone') }));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  return (
    <>
      {error && (
        <div className="mt-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <ul className="mt-3 divide-y divide-white/5">
        {hours.map((hour) => (
          <li key={hour.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between py-2 text-left text-sm hover:text-white disabled:opacity-60"
              disabled={!hour.peer?.id || !!busy}
              onClick={() => void sit(hour)}
            >
              <span>
                {hour.peer?.name ?? t('someone')}
                {hour.prompt?.title ? ` · ${hour.prompt.title}` : ''}
                {busy === hour.peer?.id ? ` · ${hour.peer?.guest ? t('opening') : t('asking')}` : ''}
              </span>
              <span className="text-xs text-ink-400">{new Date(hour.startedAt).toLocaleDateString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
