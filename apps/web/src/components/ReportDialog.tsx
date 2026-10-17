'use client';

import { useEffect, useRef, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { api } from '@/lib/client';
import type { UiKey } from '@/lib/ui-copy';

export type ReportableLine = {
  id: string;
  mine: boolean;
  text: string;
  translation: string | null;
  createdAt: string;
};

const REASONS: { value: 'harassment' | 'spam' | 'scam' | 'underage_concern' | 'other'; key: UiKey }[] = [
  { value: 'harassment', key: 'reasonHarassment' },
  { value: 'underage_concern', key: 'reasonUnderage' },
  { value: 'scam', key: 'reasonScam' },
  { value: 'spam', key: 'reasonSpam' },
  { value: 'other', key: 'reasonOther' },
];

/** Newest lines last; the reporter sees at most this many to choose from. */
const SHOW_LINES = 30;

export function ReportDialog({
  peer,
  conversationId,
  lines,
  onClose,
  onSent,
}: {
  peer: { id: string; name: string };
  conversationId: string;
  lines: ReportableLine[];
  onClose: () => void;
  onSent: (attached: number) => void;
}) {
  const { t } = useUi();
  const [reason, setReason] = useState<(typeof REASONS)[number]['value'] | ''>('');
  const [detail, setDetail] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const recent = lines.filter((line) => line.text.trim()).slice(-SHOW_LINES);

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id: string) {
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!reason) return;
    setSending(true);
    setError('');
    const attached = recent
      .filter((line) => picked.has(line.id))
      .map((line) => ({ mine: line.mine, text: line.text, translation: line.translation, at: line.createdAt }));
    try {
      await api('/api/world/report', {
        body: { userId: peer.id, conversationId, reason, detail: detail.trim(), lines: attached },
      });
      onSent(attached.length);
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        tabIndex={-1}
        data-report-dialog
        className="card max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="report-title" className="text-lg font-semibold text-white">
          {t('reportTitle', { name: peer.name })}
        </h2>

        <fieldset className="space-y-2">
          <legend className="label">{t('reportWhy')}</legend>
          {REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="report-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
              {t(r.key)}
            </label>
          ))}
          {(reason === 'harassment' || reason === 'underage_concern') && (
            <p className="text-xs text-amber-200">{t('reportUrgentNote')}</p>
          )}
        </fieldset>

        <label className="block space-y-1">
          <span className="label">{t('reportDetail')}</span>
          <textarea className="input min-h-[4rem]" maxLength={1000} value={detail} onChange={(e) => setDetail(e.target.value)} data-report-detail />
        </label>

        <div className="space-y-2">
          <p className="label">{t('reportAttach')}</p>
          <p className="text-xs text-ink-400">{t('reportAttachHelp')}</p>
          {recent.length === 0 ? (
            <p className="text-xs text-ink-400">{t('reportNoLines')}</p>
          ) : (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
              {recent.map((line) => (
                <li key={line.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md p-1 text-sm hover:bg-white/5">
                    <input type="checkbox" className="mt-1" checked={picked.has(line.id)} onChange={() => toggle(line.id)} data-report-line={line.mine ? 'mine' : 'theirs'} />
                    <span className="min-w-0">
                      <span className="block text-xs text-ink-400">{line.mine ? t('you') : peer.name}</span>
                      <span className="block whitespace-pre-wrap break-words text-white">{line.mine ? line.text : line.translation || line.text}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>
            {t('reportCancel')}
          </button>
          <button type="button" className="btn-primary text-sm" disabled={!reason || sending} onClick={() => void send()} data-report-send>
            {sending ? t('sending') : t('reportSend')}
          </button>
        </div>
      </div>
    </div>
  );
}
