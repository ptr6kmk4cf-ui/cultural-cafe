'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-300">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  const styles = {
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
    error: 'border-red-500/30 bg-red-500/10 text-red-100',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  }[kind];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'brand' | 'green' | 'amber' | 'red' }) {
  const t = {
    default: 'bg-white/5 text-ink-200 border-white/10',
    brand: 'bg-brand-500/15 text-brand-200 border-brand-500/30',
    green: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
    red: 'bg-red-500/15 text-red-200 border-red-500/30',
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card text-center">
      <p className="font-semibold text-white">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-300">{children}</div>}
    </div>
  );
}

export function Level({ value, onChange, labels }: { value: number; onChange: (v: number) => void; labels: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l, i) => (
        <button
          type="button"
          key={l}
          onClick={() => onChange(i)}
          className={`rounded-lg px-2.5 py-1 text-xs transition ${i === value ? 'bg-brand-500 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Small toast hook: `const [toast, show] = useToast()`; render {toast}. */
export function useToast(): [ReactNode, (msg: string, kind?: 'success' | 'error') => void] {
  const [state, setState] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), 3500);
    return () => clearTimeout(t);
  }, [state]);
  const node = state ? (
    <div
      className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl ${state.kind === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}
    >
      {state.msg}
    </div>
  ) : null;
  return [node, (msg, kind = 'success') => setState({ msg, kind })];
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}
