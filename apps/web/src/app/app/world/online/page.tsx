'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUi } from '@/components/UiLocale';
import { Alert, Badge, Empty, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/client';

type Person = {
  id: string;
  name: string;
  city: string;
  country: string;
  gender?: '' | 'man' | 'woman';
  bio: string;
  languageLabel: string;
  portraitUrl: string | null;
  online: boolean;
  guest?: boolean;
};

function placeWord(value: string) {
  return value.trim().replace(/(^|[\s-])(\p{L})/gu, (_match, sep: string, letter: string) => sep + letter.toLocaleUpperCase());
}

function place(person: Person) {
  return [placeWord(person.city), placeWord(person.country)].filter(Boolean).join(', ');
}

const PAGE_SIZE = 25;

export default function OnlinePage() {
  const { t } = useUi();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const board = useRef<HTMLElement>(null);

  useEffect(() => {
    let liveFetch = true;
    api<{ people: Person[] }>('/api/world/people')
      .then((data) => {
        if (liveFetch) setPeople(data.people);
      })
      .catch((err) => {
        if (liveFetch) setError((err as Error).message);
      });
    return () => {
      liveFetch = false;
    };
  }, []);

  const here = useMemo(
    () => (people ?? []).filter((person) => person.online).sort((a, b) => Number(!!a.guest) - Number(!!b.guest) || a.name.localeCompare(b.name)),
    [people],
  );
  const online = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return here;
    return here.filter((person) => `${person.name} ${person.city} ${person.country} ${person.languageLabel}`.toLowerCase().includes(needle));
  }, [here, query]);
  const pageCount = Math.max(1, Math.ceil(online.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = online.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = online.length ? current * PAGE_SIZE + 1 : 0;
  const rangeEnd = current * PAGE_SIZE + shown.length;

  function showPage(next: number) {
    setPage(next);
    board.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function sit(person: Person) {
    setError('');
    setBusy(person.id);
    try {
      const result = await api<{ conversation?: { id: string } | null }>('/api/world/invite', { body: { toId: person.id } });
      if (result.conversation?.id) {
        window.location.href = `/app/world/${result.conversation.id}`;
        return;
      }
      setError(t('mustAccept', { name: person.name }));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy('');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('online')}
        subtitle={t('onlineSub')}
      />
      {error && <Alert kind="error">{error}</Alert>}

      <section ref={board} className="online-board scroll-mt-24" aria-label="People online">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">{t('inTheCafe')}</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {people ? t('onlineCount', { count: here.length }) : t('looking')}
            </p>
          </div>
          <label className="w-full sm:w-64">
            <span className="sr-only">{t('findPerson')}</span>
            <input
              className="input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder={t('nameOrCity')}
              aria-label={t('findPerson')}
            />
          </label>
        </div>

        {!people && !error && (
          <div className="px-5 py-8">
            <Spinner />
          </div>
        )}
        {people && online.length === 0 && (
          <div className="p-4">
            <Empty title={query.trim() ? t('noMatch') : t('nobodyOnline')} />
          </div>
        )}
        {people && online.length > 0 && (
          <div className="overflow-x-auto">
            <table className="online-table">
              <thead>
                <tr>
                  <th className="w-[52%] sm:w-[42%]">{t('person')}</th>
                  <th className="w-[30%] sm:w-[22%]">{t('cityCol')}</th>
                  <th className="hidden sm:table-cell sm:w-[20%]">{t('languageCol')}</th>
                  <th className="w-[18%]">{t('sit')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((person) => {
                  const asking = busy === person.id;
                  const label = person.guest ? t('sitWith', { name: person.name }) : t('askName', { name: person.name });
                  return (
                    <tr
                      key={person.id}
                      role="button"
                      tabIndex={busy ? -1 : 0}
                      aria-label={label}
                      aria-busy={asking}
                      onClick={() => {
                        if (!busy) void sit(person);
                      }}
                      onKeyDown={(event) => {
                        if (busy) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void sit(person);
                        }
                      }}
                    >
                      <td>
                        <span className="flex items-center gap-3">
                          <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500/80 to-amber-900 text-base font-bold text-white">
                            {person.portraitUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={person.portraitUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              person.name.slice(0, 1)
                            )}
                            <span className="online-live absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-900 bg-emerald-400" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white">{person.name}</span>
                              {(person.gender === 'man' || person.gender === 'woman') && <span className="text-xs text-ink-300">{t(person.gender)}</span>}
                              {person.guest && <Badge tone="brand">{t('guest')}</Badge>}
                            </span>
                            {person.bio && <span className="mt-0.5 block max-w-xs truncate text-xs text-ink-300">{person.bio}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="text-sm text-ink-100">
                        <span className="block">{place(person) || '—'}</span>
                        <span className="mt-0.5 block text-xs text-ink-400 sm:hidden">{person.languageLabel}</span>
                      </td>
                      <td className="hidden text-sm text-ink-200 sm:table-cell">{person.languageLabel}</td>
                      <td>
                        <span className={person.guest ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-secondary px-3 py-1.5 text-xs'}>
                          {asking ? (person.guest ? t('opening') : t('asking')) : person.guest ? t('sit') : t('ask')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {people && online.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-4 sm:px-5">
            <p className="text-sm text-ink-300">
              {rangeStart}–{rangeEnd} of {online.length}
            </p>
            {pageCount > 1 && (
              <div className="flex gap-2">
                {current > 0 && (
                  <button type="button" className="btn-secondary" onClick={() => showPage(current - 1)}>
                    {t('previous')}
                  </button>
                )}
                {current < pageCount - 1 && (
                  <button type="button" className="btn-primary" onClick={() => showPage(current + 1)}>
                    {t('next')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
