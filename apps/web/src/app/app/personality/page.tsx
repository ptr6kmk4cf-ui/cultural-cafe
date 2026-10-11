'use client';

import { useEffect, useState } from 'react';
import { LEVEL_LABELS, STYLES } from '@conversa/shared';
import { Alert, Field, Level, PageHeader, Spinner, useToast } from '@/components/ui';
import { api, splitTags } from '@/lib/client';

type P = {
  displayName: string;
  aboutMe: string;
  interests: string[];
  intentions: string;
  personality: string;
  style: string;
  humorLevel: number;
  flirtingLevel: number;
  formality: number;
  messageLength: 'short' | 'medium' | 'long';
  useEmojis: boolean;
  topicsToAvoid: string[];
  boundaries: string;
  grammaticalGender: 'masculine' | 'feminine' | 'neutral' | 'unspecified';
};

const GENDERS = ['unspecified', 'masculine', 'feminine', 'neutral'] as const;

export default function PersonalityPage() {
  const [p, setP] = useState<P | null>(null);
  const [interests, setInterests] = useState('');
  const [avoid, setAvoid] = useState('');
  const [error, setError] = useState('');
  const [toast, show] = useToast();

  useEffect(() => {
    api('/api/settings').then((d) => {
      setP(d.personality);
      setInterests(d.personality.interests.join(', '));
      setAvoid(d.personality.topicsToAvoid.join(', '));
    });
  }, []);

  if (!p) return <Spinner />;
  const set = <K extends keyof P>(k: K, v: P[K]) => setP({ ...p, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/api/settings/personality', { method: 'PUT', body: { ...p, interests: splitTags(interests), topicsToAvoid: splitTags(avoid) } });
      show('Personality saved');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <PageHeader
        title="Personality settings"
        subtitle="The AI writes as you, using only the facts you give it here. It will never invent experiences, jobs, places or opinions."
        actions={<button className="btn-primary">Save</button>}
      />
      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="font-semibold text-white">About you</h2>
          <Field label="First name shown in messages">
            <input className="input" value={p.displayName} onChange={(e) => set('displayName', e.target.value)} />
          </Field>
          <Field label="Facts the AI may use about you" hint="Job, city, what you do on weekends, travel, pets, favourite food… Only what you're happy to share.">
            <textarea className="input min-h-32" value={p.aboutMe} onChange={(e) => set('aboutMe', e.target.value)} maxLength={2000} />
          </Field>
          <Field label="Interests & hobbies" hint="Comma-separated">
            <input className="input" value={interests} onChange={(e) => setInterests(e.target.value)} />
          </Field>
          <Field label="Dating intentions">
            <input className="input" placeholder="e.g. long-term relationship, open to see where it goes" value={p.intentions} onChange={(e) => set('intentions', e.target.value)} />
          </Field>
          <Field label="Your personality in a few words">
            <input className="input" placeholder="e.g. curious, warm, a bit nerdy, loves banter" value={p.personality} onChange={(e) => set('personality', e.target.value)} />
          </Field>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-white">How you write</h2>
          <div>
            <span className="label">Style</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STYLES.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  onClick={() => set('style', s.value)}
                  title={s.help}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${p.style === s.value ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/10 bg-white/5 text-ink-300 hover:bg-white/10'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-400">{STYLES.find((s) => s.value === p.style)?.help}</p>
          </div>
          <div>
            <span className="label">Humor</span>
            <Level value={p.humorLevel} onChange={(v) => set('humorLevel', v)} labels={LEVEL_LABELS.humor} />
          </div>
          <div>
            <span className="label">Flirting</span>
            <Level value={p.flirtingLevel} onChange={(v) => set('flirtingLevel', v)} labels={LEVEL_LABELS.flirting} />
          </div>
          <div>
            <span className="label">Formality</span>
            <Level value={p.formality} onChange={(v) => set('formality', v)} labels={LEVEL_LABELS.formality} />
          </div>
          <div>
            <span className="label">Message length</span>
            <Level value={['short', 'medium', 'long'].indexOf(p.messageLength)} onChange={(v) => set('messageLength', (['short', 'medium', 'long'] as const)[v])} labels={['Short', 'Medium', 'Long']} />
          </div>
          <div>
            <span className="label">Grammar when writing about yourself</span>
            <Level
              value={Math.max(0, GENDERS.indexOf(p.grammaticalGender))}
              onChange={(v) => set('grammaticalGender', GENDERS[v])}
              labels={['Not set', 'Masculine', 'Feminine', 'Neutral']}
            />
            <p className="mt-1 text-xs text-ink-400">Only used for grammar in languages like French, Spanish or Arabic (“je suis content / contente”).</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={p.useEmojis} onChange={(e) => set('useEmojis', e.target.checked)} /> Allow emojis (max one per message)
          </label>
        </div>

        <div className="card space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-white">Boundaries</h2>
          <Field label="Topics to avoid" hint="Comma-separated, e.g. politics, exes, work stress">
            <input className="input" value={avoid} onChange={(e) => setAvoid(e.target.value)} />
          </Field>
          <Field label="Personal boundaries" hint="Rules the AI must always respect, e.g. “never suggest meeting at night”, “don't share my workplace”.">
            <textarea className="input min-h-20" value={p.boundaries} onChange={(e) => set('boundaries', e.target.value)} />
          </Field>
        </div>
      </div>
      {toast}
    </form>
  );
}
