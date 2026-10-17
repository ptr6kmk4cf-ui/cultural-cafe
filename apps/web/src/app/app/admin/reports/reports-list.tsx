'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge } from '@/components/ui';
import { api } from '@/lib/client';
import type { AdminReport } from '@/lib/services/reports';

function when(value: string) {
  return new Date(value).toLocaleString();
}

type Filter = 'open' | 'urgent' | 'all';

export function ReportsList({ initial }: { initial: AdminReport[] }) {
  const [reports, setReports] = useState(initial);
  const [filter, setFilter] = useState<Filter>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const urgentOpen = reports.filter((r) => r.urgent && r.status === 'open').length;
  const open = reports.filter((r) => r.status === 'open').length;
  const visible = useMemo(
    () =>
      reports.filter((r) =>
        filter === 'all' ? true : filter === 'urgent' ? r.urgent && r.status === 'open' : r.status === 'open',
      ),
    [reports, filter],
  );

  async function mark(id: string, status: 'open' | 'reviewed') {
    setBusy(id);
    setError('');
    try {
      await api(`/api/admin/reports/${id}`, { method: 'PATCH', body: { status } });
      setReports((all) =>
        all.map((r) =>
          r.id === id ? { ...r, status, reviewedAt: status === 'reviewed' ? new Date().toISOString() : null, reviewedBy: status === 'reviewed' ? 'you' : null } : r,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {urgentOpen > 0 && (
        <div role="alert" data-urgent-alert className="rounded-xl border border-red-500/40 bg-red-500/15 p-4 text-sm text-red-100">
          <p className="font-semibold text-white">
            {urgentOpen} urgent report{urgentOpen === 1 ? '' : 's'} waiting
          </p>
          <p>Harassment or someone who may be under 18. Review these first.</p>
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      <div className="seg" role="group" aria-label="Which reports">
        {(
          [
            ['open', `Open (${open})`],
            ['urgent', `Urgent (${urgentOpen})`],
            ['all', `All (${reports.length})`],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className="seg-btn" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="card text-sm text-ink-400">{filter === 'all' ? 'No reports yet.' : 'Nothing waiting here.'}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li
              key={r.id}
              data-report={r.id}
              className={`card space-y-3 ${r.urgent && r.status === 'open' ? 'border border-red-500/40' : ''} ${r.status === 'reviewed' ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.urgent ? 'red' : 'amber'}>{r.reasonLabel}</Badge>
                {r.urgent && <Badge tone="red">Urgent</Badge>}
                <Badge tone={r.status === 'open' ? 'brand' : 'green'}>{r.status === 'open' ? 'Open' : 'Reviewed'}</Badge>
                <span className="text-xs text-ink-400">{when(r.createdAt)}</span>
                {r.urgent && <span className="text-xs text-ink-400">{r.alerted ? 'Admins emailed' : 'Email alert not sent'}</span>}
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="label">Reported person</p>
                  <p className="font-medium text-white">
                    {r.target.name}
                    {r.target.guest ? ' (café guest)' : ''}
                  </p>
                  {r.target.email && <p className="text-xs text-ink-300">{r.target.email}</p>}
                </div>
                <div>
                  <p className="label">Reported by</p>
                  <p className="font-medium text-white">{r.reporter.name}</p>
                  <p className="text-xs text-ink-300">{r.reporter.email}</p>
                </div>
              </div>
              {r.detail && (
                <div>
                  <p className="label">What they wrote</p>
                  <p className="whitespace-pre-wrap text-sm">{r.detail}</p>
                </div>
              )}
              <div>
                <p className="label">Attached lines</p>
                {r.lines.length === 0 ? (
                  <p className="text-xs text-ink-400">None attached.</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-ink-400">From the reporter&apos;s screen. Not checked against a server copy, because there is none.</p>
                    <ol className="space-y-2 border-l border-white/10 pl-3 text-sm">
                      {r.lines.map((line, i) => (
                        <li key={i}>
                          <p className="text-xs text-ink-400">
                            {line.mine ? `${r.reporter.name} (reporter)` : `${r.target.name} (reported)`}
                            {line.at ? ` · ${when(line.at)}` : ''}
                          </p>
                          <p className="whitespace-pre-wrap text-white">{line.text}</p>
                          {line.translation && line.translation !== line.text && (
                            <p className="whitespace-pre-wrap text-xs text-ink-300">Translation shown: {line.translation}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-400">
                  {r.conversationId ? `Table ${r.conversationId}` : 'No table'}
                  {r.reviewedAt ? ` · reviewed ${when(r.reviewedAt)}${r.reviewedBy ? ` by ${r.reviewedBy}` : ''}` : ''}
                </p>
                {r.status === 'open' ? (
                  <button type="button" className="btn-primary text-xs" disabled={busy === r.id} onClick={() => void mark(r.id, 'reviewed')}>
                    Mark reviewed
                  </button>
                ) : (
                  <button type="button" className="btn-secondary text-xs" disabled={busy === r.id} onClick={() => void mark(r.id, 'open')}>
                    Reopen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
