'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Empty, PageHeader, Spinner } from '@/components/ui';
import { CafeMap } from '@/components/CafeMap';
import { api } from '@/lib/client';
import { atlasCountryNames } from '@/lib/atlas';
import { citiesForCountry, countriesWithPeople, peopleInCity, searchCities, searchCountries } from '@/lib/map-places';

type Card = {
  id: string;
  name: string;
  city: string;
  country: string;
  bio: string;
  languageLabel: string;
  portraitUrl: string | null;
  guest?: boolean;
};

export default function MapPage() {
  const [people, setPeople] = useState<Card[] | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [cityKey, setCityKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const peopleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ people: Card[] }>('/api/world/people')
      .then((data) => setPeople(data.people))
      .catch((err) => setError((err as Error).message));
  }, []);

  const counts = useMemo(() => (people ? countriesWithPeople(people, atlasCountryNames) : new Map<string, number>()), [people]);
  const cities = useMemo(
    () => (country ? citiesForCountry(country, people ?? [], atlasCountryNames) : []),
    [people, country],
  );
  const city = cities.find((item) => item.key === cityKey) ?? null;
  const here = useMemo(() => {
    if (!people || !country || !city) return [];
    return peopleInCity(people, country, city.key, atlasCountryNames).slice().sort((a, b) => Number(!!a.guest) - Number(!!b.guest) || a.name.localeCompare(b.name));
  }, [people, country, city]);

  const countryHits = query.trim() ? searchCountries(query, atlasCountryNames) : [];
  const cityHits = query.trim() ? searchCities(query, atlasCountryNames, people ?? []) : [];

  useEffect(() => {
    if (!error) return;
    (peopleRef.current ?? document.getElementById('map-error'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    const panel = peopleRef.current;
    if (!cityKey || !panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.top >= 88 && rect.bottom <= window.innerHeight - 16) return;
    const top = rect.top + window.scrollY - 88;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [country, cityKey]);

  function pickCountry(name: string) {
    setCountry(name);
    setCityKey(null);
    setQuery('');
    setError('');
  }

  function pickCity(countryName: string, key: string) {
    setCountry(countryName);
    setCityKey(key);
    setQuery('');
    setError('');
  }

  async function sit(person: Card) {
    setError('');
    setBusy(person.id);
    try {
      const result = await api<{ conversation?: { id: string } | null }>('/api/world/invite', { body: { toId: person.id } });
      if (result.conversation?.id) {
        window.location.href = `/app/world/${result.conversation.id}`;
        return;
      }
      setError(`${person.name} still has to accept. The table has not started.`);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy('');
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Map" subtitle="Tap a country, then a city. The people from that city are listed there, and you sit down with one of them." />
      {error && !city && <div id="map-error"><Alert kind="error">{error}</Alert></div>}
      <CafeMap selected={country} counts={counts} onSelect={pickCountry} />

      {country && (
        <section className="scroll-mt-24 space-y-3" aria-label={`Cities in ${country}`}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-brand-300">Cities</p>
              <h2 className="text-xl font-bold text-white">{country}</h2>
            </div>
            <button type="button" className="btn-secondary text-xs" onClick={() => { setCountry(null); setCityKey(null); }}>
              Whole map
            </button>
          </div>
          <p className="text-sm text-ink-300">Tap a city. The people from that city open underneath it.</p>
          {!people && !error && <Spinner />}
          {cities.length === 0 ? (
            <Empty title={`No cities are listed for ${country}`} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {cities.map((item) => {
                const open = cityKey === item.key;
                return (
                  <Fragment key={item.key}>
                    <button
                      type="button"
                      aria-pressed={open}
                      className={`card flex items-center justify-between gap-3 py-3 text-left ${open ? 'border-brand-400 sm:col-span-2' : ''}`}
                      onClick={() => setCityKey(open ? null : item.key)}
                    >
                      <span className="text-lg font-semibold text-white">{item.label}</span>
                      {people && (
                        <span className={`text-xs ${item.count ? 'text-brand-200' : 'text-ink-400'}`}>
                          {item.count ? `${item.count} here` : 'No one yet'}
                        </span>
                      )}
                    </button>
                    {open && city && (
                      <div ref={peopleRef} className="scroll-mt-24 space-y-3 sm:col-span-2" aria-label={`People in ${city.label}`}>
                        {error && <Alert kind="error">{error}</Alert>}
                        {people && here.length === 0 ? <Empty title={`Nobody from ${city.label} is here`} /> : null}
                        {people && here.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {here.map((person) => (
                              <button
                                key={person.id}
                                type="button"
                                className="card space-y-2 text-left transition hover:border-brand-500/40"
                                disabled={!!busy}
                                onClick={() => sit(person)}
                              >
                                <span className="flex items-center gap-3">
                                  <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white/10 text-lg font-bold text-white">
                                    {person.portraitUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={person.portraitUrl} alt="" className="h-full w-full object-cover" />
                                    ) : person.name.slice(0, 1)}
                                  </span>
                                  <span>
                                    <span className="block text-lg font-semibold text-white underline decoration-white/30 underline-offset-4">{person.name}</span>
                                    <span className="block text-xs text-ink-400">{city.label}, {country} · {person.languageLabel}</span>
                                    {person.guest && <span className="mt-1 inline-flex"><Badge>Guest</Badge></span>}
                                  </span>
                                </span>
                                {person.bio && <span className="block text-sm text-ink-200">{person.bio}</span>}
                                <span className={person.guest ? 'btn-primary w-full' : 'btn-secondary w-full'}>
                                  {busy === person.id ? (person.guest ? 'Opening the table…' : 'Asking…') : person.guest ? `Sit with ${person.name}` : `Ask ${person.name}`}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!country && <div className="space-y-3">
        <label className="block">
          <span className="label">Find a country or a city</span>
          <input
            className="input text-base"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="France, Lyon, Alexandria…"
            aria-label="Find a country or a city"
          />
        </label>
        {(countryHits.length > 0 || cityHits.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {countryHits.map((name) => (
              <button key={name} type="button" className="chip" onClick={() => pickCountry(name)}>
                {name}
                {counts.get(name) ? ` · ${counts.get(name)}` : ''}
              </button>
            ))}
            {cityHits.map((hit) => (
              <button key={`${hit.country}:${hit.key}`} type="button" className="chip" onClick={() => pickCity(hit.country, hit.key)}>
                {hit.label}, {hit.country}
                {hit.count ? ` · ${hit.count}` : ''}
              </button>
            ))}
          </div>
        )}
        {query.trim() && countryHits.length === 0 && cityHits.length === 0 && (
          <p className="text-sm text-ink-300">No country or city matches that.</p>
        )}
        {!query.trim() && counts.size > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-ink-300">Someone is in these countries. The same countries are marked on the map.</p>
            <div className="flex flex-wrap gap-2">
              {[...counts.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([name, count]) => (
                  <button key={name} type="button" className={`chip ${country === name ? 'border-brand-400 bg-brand-500/20 text-white' : ''}`} onClick={() => pickCountry(name)}>
                    {name} · {count}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>}

      {!country && !people && !error && <Spinner />}
    </div>
  );
}
