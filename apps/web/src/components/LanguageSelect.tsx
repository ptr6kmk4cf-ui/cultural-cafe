'use client';

import { useEffect, useMemo, useState } from 'react';
import { LANGUAGES, MAX_PREFERRED_LANGUAGES, orderLanguages, type LanguageInfo } from '@conversa/shared';
import { api } from '@/lib/client';

let preferredCache: Promise<string[]> | null = null;

/** The user's chosen languages (Language settings), loaded once per page session. */
export function usePreferredLanguages(): string[] {
  const [langs, setLangs] = useState<string[]>([]);
  useEffect(() => {
    preferredCache ??= api('/api/settings')
      .then((d) => (d.language?.preferredLanguages as string[]) ?? [])
      .catch(() => {
        preferredCache = null;
        return [];
      });
    preferredCache.then(setLangs);
  }, []);
  return langs;
}

export function refreshPreferredLanguages(langs: string[]) {
  preferredCache = Promise.resolve(langs);
}

function label(l: LanguageInfo, native: boolean) {
  const name = native && l.nativeName !== l.name ? `${l.name} — ${l.nativeName}` : l.name;
  return l.beta ? `${name} (beta)` : name;
}

/** Language dropdown: the user's languages first, then every supported language A–Z. */
export function LanguageSelect({
  value,
  onChange,
  emptyLabel,
  preferred,
  native = false,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Adds a first option with value "" (e.g. "Auto-detect"). */
  emptyLabel?: string;
  /** Overrides the saved list (used on the settings page while editing). */
  preferred?: string[];
  native?: boolean;
}) {
  const saved = usePreferredLanguages();
  const { mine, others } = orderLanguages(preferred ?? saved);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {mine.length > 0 ? (
        <>
          <optgroup label="My languages">
            {mine.map((l) => <option key={l.code} value={l.code}>{label(l, native)}</option>)}
          </optgroup>
          <optgroup label={`All languages (${LANGUAGES.length})`}>
            {others.map((l) => <option key={l.code} value={l.code}>{label(l, native)}</option>)}
          </optgroup>
        </>
      ) : (
        others.map((l) => <option key={l.code} value={l.code}>{label(l, native)}</option>)
      )}
    </select>
  );
}

/** Searchable multi-select for choosing which languages the user works with. */
export function LanguagePicker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const [q, setQ] = useState('');
  const full = value.length >= MAX_PREFERRED_LANGUAGES;
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return LANGUAGES.filter((l) => !value.includes(l.code) && (!s || l.name.toLowerCase().includes(s) || l.nativeName.toLowerCase().includes(s) || l.code === s));
  }, [q, value]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="Selected languages">
        {value.length === 0 && <span className="text-xs text-ink-400">No languages chosen yet — every language is still available.</span>}
        {value.map((code) => {
          const l = LANGUAGES.find((x) => x.code === code);
          if (!l) return null;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onChange(value.filter((c) => c !== code))}
              className="rounded-full border border-brand-400 bg-brand-500/20 px-3 py-1 text-xs text-white"
              title={`Remove ${l.name}`}
            >
              <span dir={l.rtl ? 'rtl' : 'ltr'}>{l.nativeName}</span> <span aria-hidden>×</span>
            </button>
          );
        })}
      </div>
      <input
        className="input"
        type="search"
        placeholder={full ? `Maximum ${MAX_PREFERRED_LANGUAGES} languages — remove one to add another` : `Search ${LANGUAGES.length} languages…`}
        value={q}
        disabled={full}
        onChange={(e) => setQ(e.target.value)}
      />
      {!full && (
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
          {matches.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                onChange([...value, l.code]);
                setQ('');
              }}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-ink-300 hover:border-brand-400 hover:text-white"
              title={l.beta ? 'Beta: AI quality is lower for this language' : undefined}
            >
              {l.name}
              {l.nativeName !== l.name && <span className="ml-1 text-ink-400" dir={l.rtl ? 'rtl' : 'ltr'}>{l.nativeName}</span>}
              {l.beta && <span className="ml-1 text-amber-300">β</span>}
            </button>
          ))}
          {matches.length === 0 && <span className="text-xs text-ink-400">No match.</span>}
        </div>
      )}
    </div>
  );
}
