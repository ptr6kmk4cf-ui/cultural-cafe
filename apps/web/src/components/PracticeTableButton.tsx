'use client';

import { useState } from 'react';
import { api } from '@/lib/client';

/** Local café only. Production builds never render this. */
export function PracticeTableButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function openTable() {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ id: string }>('/api/dev/practice-table', { method: 'POST', body: {} });
      window.location.href = `/app/world/${r.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open a practice table.');
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-2 border-dashed border-brand-400/40">
      <h3 className="font-semibold text-white">Local board practice</h3>
      <p className="text-sm text-ink-300">
        Sit at a table with Lucía (the seeded Spanish traveler). Then tap Board. This stays off the live café.
      </p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => void openTable()}>
        {busy ? 'Opening…' : 'Open a practice table'}
      </button>
    </div>
  );
}
