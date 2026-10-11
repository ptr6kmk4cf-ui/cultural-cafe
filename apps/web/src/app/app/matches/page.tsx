'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PLATFORMS } from '@conversa/shared';
import { Alert, Badge, Field, PageHeader, Spinner, useToast } from '@/components/ui';
import { api, splitTags } from '@/lib/client';

type Prefs = {
  ageMin: number;
  ageMax: number;
  location: string;
  maxDistanceKm: number;
  relationshipGoals: string[];
  interests: string[];
  lifestyle: string[];
  physicalPreferences: string;
  dealbreakers: string[];
  analyzePhotos: boolean;
};

export default function FindMatches() {
  const [p, setP] = useState<Prefs | null>(null);
  const [tags, setTags] = useState({ relationshipGoals: '', interests: '', lifestyle: '', dealbreakers: '' });
  const [error, setError] = useState('');
  const [toast, show] = useToast();

  useEffect(() => {
    api('/api/settings').then((d) => {
      setP(d.preferences);
      setTags({
        relationshipGoals: d.preferences.relationshipGoals.join(', '),
        interests: d.preferences.interests.join(', '),
        lifestyle: d.preferences.lifestyle.join(', '),
        dealbreakers: d.preferences.dealbreakers.join(', '),
      });
    });
  }, []);
  if (!p) return <Spinner />;

  async function save() {
    setError('');
    try {
      await api('/api/settings/preferences', {
        method: 'PUT',
        body: {
          ...p,
          relationshipGoals: splitTags(tags.relationshipGoals),
          interests: splitTags(tags.interests),
          lifestyle: splitTags(tags.lifestyle),
          dealbreakers: splitTags(tags.dealbreakers),
        },
      });
      show('Preferences saved');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find matches"
        subtitle="Set what you're looking for. Then open a supported dating site with the extension installed and press “Find matches” in the Cultural Café panel."
        actions={<button className="btn-primary" onClick={save}>Save preferences</button>}
      />
      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min age"><input className="input" type="number" min={18} max={99} value={p.ageMin} onChange={(e) => setP({ ...p, ageMin: Math.max(18, +e.target.value) })} /></Field>
            <Field label="Max age"><input className="input" type="number" min={18} max={99} value={p.ageMax} onChange={(e) => setP({ ...p, ageMax: +e.target.value })} /></Field>
            <Field label="Location"><input className="input" value={p.location} onChange={(e) => setP({ ...p, location: e.target.value })} placeholder="e.g. Paris" /></Field>
            <Field label="Max distance (km)"><input className="input" type="number" min={0} value={p.maxDistanceKm} onChange={(e) => setP({ ...p, maxDistanceKm: +e.target.value })} /></Field>
          </div>
          <Field label="Relationship goals" hint="Comma-separated, e.g. long-term, marriage, casual dating">
            <input className="input" value={tags.relationshipGoals} onChange={(e) => setTags({ ...tags, relationshipGoals: e.target.value })} />
          </Field>
          <Field label="Interests & hobbies you'd love to share">
            <input className="input" value={tags.interests} onChange={(e) => setTags({ ...tags, interests: e.target.value })} placeholder="hiking, jazz, cooking, travel" />
          </Field>
          <Field label="Lifestyle preferences">
            <input className="input" value={tags.lifestyle} onChange={(e) => setTags({ ...tags, lifestyle: e.target.value })} placeholder="non-smoker, early riser, wants kids" />
          </Field>
          <Field label="Physical preferences" hint="Only compared with what people state in their profile text (e.g. stated height). Never estimated from photos.">
            <input className="input" value={p.physicalPreferences} onChange={(e) => setP({ ...p, physicalPreferences: e.target.value })} />
          </Field>
          <Field label="Dealbreakers" hint="Profiles listing these in interests/lifestyle are filtered out before any AI analysis.">
            <input className="input" value={tags.dealbreakers} onChange={(e) => setTags({ ...tags, dealbreakers: e.target.value })} placeholder="smokes, doesn't want kids" />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={p.analyzePhotos} onChange={(e) => setP({ ...p, analyzePhotos: e.target.checked })} />
            <span>
              Use public profile photos for context (Premium) — only activities, places, pets and hobbies are noted. Appearance is never judged or scored.
            </span>
          </label>
        </div>

        <div className="space-y-4">
          <div className="card space-y-3 text-sm">
            <h2 className="font-semibold text-white">How it works</h2>
            <ol className="list-decimal space-y-1 pl-4 text-ink-300">
              <li>Open a supported site with the extension connected.</li>
              <li>Click <b>Find matches</b> in the Cultural Café panel.</li>
              <li>Hard filters (age, distance, dealbreakers) run first; the AI then scores the rest and explains why.</li>
              <li>Recommended profiles go to <Link className="text-brand-300" href="/app/shortlist">Selected Matches</Link>. Everything else is discarded immediately.</li>
            </ol>
          </div>
          <div className="card space-y-2 text-sm">
            <h2 className="font-semibold text-white">Supported sites</h2>
            {Object.values(PLATFORMS).map((pl) => (
              <div key={pl.id} className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{pl.name}</span>
                  {pl.demo ? <Badge tone="amber">Demo</Badge> : <Badge tone="green">Verified</Badge>}
                </div>
                <a className="text-xs text-brand-300" href={pl.origins[0]} target="_blank" rel="noreferrer">{pl.origins[0]}</a>
              </div>
            ))}
            <p className="text-xs text-ink-400">No external dating sites are integrated yet. They will be added only with the platform&apos;s permission.</p>
          </div>
        </div>
      </div>
      {toast}
    </div>
  );
}
