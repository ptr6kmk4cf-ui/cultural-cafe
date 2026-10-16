'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type TransitionEvent } from 'react';
import { languageName } from '@conversa/shared';
import { useUi } from '@/components/UiLocale';
import { Badge } from '@/components/ui';
import { CafeMap } from '@/components/CafeMap';
import { atlasCountryNames } from '@/lib/atlas';
import type { WheelPerson } from '@/lib/fortune-wheel';
import { matchCountry } from '@/lib/map-places';

const NO_COUNTS = new Map<string, number>();

/** World map, then the country, then the pin, then the window fills in. */
const REVEAL = ['world', 'country', 'pin', 'window', 'photo', 'name', 'place', 'words', 'bio', 'interests', 'sit'] as const;
const REVEAL_AT = [0, 850, 1850, 2800, 3500, 4050, 4600, 5150, 5700, 6250, 6800];

function useReveal(personId: string | null) {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (!personId) {
      setStep(-1);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setStep(REVEAL.length - 1);
      return;
    }
    setStep(0);
    const timers = REVEAL_AT.map((ms, index) => window.setTimeout(() => setStep(index), ms));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [personId]);
  return { step, seen: (beat: (typeof REVEAL)[number]) => step >= REVEAL.indexOf(beat) };
}

function Slow({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-[550ms] ease-out ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="overflow-hidden">
        <div className="pb-1">{children}</div>
      </div>
    </div>
  );
}

export function FortuneWheel({
  people,
  busyId = '',
  onSit,
  sitLabel,
}: {
  people: WheelPerson[];
  busyId?: string;
  onSit: (person: WheelPerson) => void;
  sitLabel: (person: WheelPerson) => string;
}) {
  const { t } = useUi();
  const [rotation, setRotation] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<WheelPerson | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const landed = useRef<WheelPerson | null>(null);
  const finishTimer = useRef<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reveal = useReveal(winner?.id ?? null);
  const seen = reveal.seen;
  const roster = people.map((person) => person.id).join('\n');

  useEffect(() => {
    setWinner((current) => (current && people.some((person) => person.id === current.id) ? current : null));
  }, [roster, people]);

  useEffect(() => () => {
    if (finishTimer.current != null) window.clearTimeout(finishTimer.current);
  }, []);

  function showWinner() {
    if (finishTimer.current != null) {
      window.clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
    const person = landed.current;
    setSpinning(false);
    if (person) setWinner(person);
  }

  function spin() {
    if (spinning || busyId || people.length === 0) return;
    const person = people[Math.floor(Math.random() * people.length)];
    if (!person) return;
    const turns = Math.floor(rotation / 360) + 5 + Math.floor(Math.random() * 2);
    const nextRotation = turns * 360 + Math.floor(Math.random() * 360);
    landed.current = person;
    setWinner(null);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setAnimate(false);
      setRotation(nextRotation);
      setSpinning(false);
      setWinner(person);
      return;
    }
    setAnimate(true);
    setSpinning(true);
    setRotation(nextRotation);
    if (finishTimer.current != null) window.clearTimeout(finishTimer.current);
    finishTimer.current = window.setTimeout(showWinner, 4800);
  }

  function onWheelEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.propertyName !== 'transform' || event.target !== wheelRef.current) return;
    showWinner();
  }

  const windowOpen = reveal.step >= 3;
  useEffect(() => {
    if (!winner) return;
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [winner]);
  useEffect(() => {
    if (!winner || !windowOpen) return;
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [winner, windowOpen]);
  useEffect(() => {
    if (reveal.step < REVEAL.length - 1) return;
    dialogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [reveal.step]);

  const country = winner ? matchCountry(winner.country, atlasCountryNames) : null;
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    if (country) map.set(country, 1);
    return map;
  }, [country]);
  if (people.length === 0) return null;
  const alsoReads = winner
    ? [...new Set((winner.languages ?? []).map((code) => languageName(code)))].filter((name) => name && name !== winner.languageLabel)
    : [];
  const place = winner ? (winner.city || country) : null;
  const zoomed = !!country && seen('country');

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-white">Choose somebody at random</h3>
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-full border border-amber-100/40 bg-ink-800 shadow-2xl shadow-black/40">
        <div
          ref={wheelRef}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 w-[210%] brightness-125"
          style={{
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            transition: animate ? 'transform 4.4s cubic-bezier(0.12, 0.65, 0.05, 1)' : 'none',
          }}
          onTransitionEnd={onWheelEnd}
        >
          <CafeMap selected={null} counts={NO_COUNTS} bare quiet onSelect={() => {}} />
        </div>
        <button
          type="button"
          className="absolute left-1/2 top-1/2 z-10 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink-900 text-sm font-bold uppercase tracking-[0.18em] text-white ring-2 ring-amber-100 disabled:opacity-70"
          disabled={spinning || !!busyId}
          onClick={spin}
        >
          Spin
        </button>
      </div>
      {winner && (
        <div ref={resultRef} className="flex flex-col gap-3 md:flex-row md:items-stretch">
          <div className="relative aspect-[960/500] min-w-0 flex-1 overflow-hidden rounded-2xl">
            <div
              className={zoomed ? 'pointer-events-none absolute inset-0' : 'absolute inset-0'}
              style={{ opacity: zoomed ? 0 : 1, transition: 'opacity 1s ease' }}
            >
              <CafeMap selected={null} counts={NO_COUNTS} quiet onSelect={() => {}} />
            </div>
            {country && (
              <div className="absolute inset-0" style={{ opacity: zoomed ? 1 : 0, transition: 'opacity 1.15s ease' }}>
                <CafeMap
                  selected={country}
                  counts={counts}
                  place={seen('pin') ? place : null}
                  focus
                  quiet
                  onSelect={() => {}}
                />
              </div>
            )}
          </div>
          <div
            className={`overflow-hidden transition-all duration-[800ms] ease-out md:shrink-0 ${seen('window') ? 'max-h-[48rem] w-full opacity-100 md:w-[24rem]' : 'max-h-0 w-0 opacity-0'}`}
          >
            <div
              ref={dialogRef}
              className="card w-full space-y-3 border-brand-500/30 shadow-2xl shadow-black/40 md:w-[24rem]"
              role="dialog"
              aria-label={winner.name}
              aria-live="polite"
            >
                <Slow on={seen('window')}>
                  <p className="text-xs uppercase tracking-wide text-brand-300">
                    {[winner.city, winner.country].filter(Boolean).join(', ') || 'Somewhere'}
                  </p>
                </Slow>
                <Slow on={seen('photo')}>
                  <span className="grid h-28 w-28 place-items-center overflow-hidden rounded-3xl bg-white/10 text-3xl font-bold text-white">
                    {winner.portraitUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={winner.portraitUrl} alt="" className="h-full w-full object-cover" />
                    ) : winner.name.slice(0, 1)}
                  </span>
                </Slow>
                <Slow on={seen('name')}>
                  <h3 className="text-3xl font-bold text-white">{winner.name}</h3>
                  {(winner.gender === 'man' || winner.gender === 'woman') && <p className="text-sm text-ink-300">{t(winner.gender)}</p>}
                </Slow>
                <Slow on={seen('place')}>
                  <p className="text-sm text-ink-200">
                    {[winner.city, winner.country].filter(Boolean).join(', ') || 'Somewhere'}
                    {typeof winner.age === 'number' ? ` · ${winner.age}` : ''}
                  </p>
                </Slow>
                <Slow on={seen('words')}>
                  <p className="text-sm text-ink-300">
                    Reads {winner.languageLabel}
                    {alsoReads.length > 0 ? ` · Also ${alsoReads.join(', ')}` : ''}
                    {winner.online ? ' · Here now' : ''}
                  </p>
                  {winner.guest && <span className="mt-2 inline-flex"><Badge>Guest</Badge></span>}
                </Slow>
                {winner.bio && (
                  <Slow on={seen('bio')}>
                    <p className="text-base text-ink-100">{winner.bio}</p>
                  </Slow>
                )}
                {!!winner.interests?.length && (
                  <Slow on={seen('interests')}>
                    <div className="flex flex-wrap gap-2">
                      {winner.interests.map((interest) => <span key={interest} className="chip">{interest}</span>)}
                    </div>
                  </Slow>
                )}
                {!country && winner.country && (
                  <Slow on={seen('place')}>
                    <p className="text-xs text-ink-400">The map has no outline for “{winner.country}”. The city is what they typed.</p>
                  </Slow>
                )}
                <Slow on={seen('sit')}>
                  <button type="button" className="btn-primary w-full" disabled={!!busyId || !seen('sit')} onClick={() => onSit(winner)}>
                    {busyId === winner.id ? 'Opening the table…' : sitLabel(winner)}
                  </button>
                </Slow>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
