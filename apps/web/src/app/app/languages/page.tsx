'use client';

import { useEffect, useState } from 'react';
import { LANGUAGES, type LanguageModeValue } from '@conversa/shared';
import { Alert, Field, PageHeader, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/client';
import { LanguagePicker, LanguageSelect, refreshPreferredLanguages } from '@/components/LanguageSelect';

type L = { myLanguage: string; defaultReplyLanguage: string; defaultMode: LanguageModeValue; preferredLanguages: string[] };

export default function LanguagesPage() {
  const [l, setL] = useState<L | null>(null);
  const [error, setError] = useState('');
  const [toast, show] = useToast();
  const [testText, setTestText] = useState('');
  const [testOut, setTestOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/settings').then((d) => setL(d.language));
  }, []);
  if (!l) return <Spinner />;

  async function save() {
    setError('');
    try {
      await api('/api/settings/language', { method: 'PUT', body: l });
      refreshPreferredLanguages(l!.preferredLanguages);
      show('Language settings saved');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function translate() {
    setBusy(true);
    setTestOut(null);
    try {
      const r = await api('/api/ai/translate', { body: { text: testText, target: l!.myLanguage } });
      setTestOut(`${r.translation}  (detected: ${r.detectedLanguage})`);
    } catch (err) {
      setTestOut(`Error: ${(err as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Language" subtitle="The language you read. People you meet see a live translation." actions={<button className="btn-primary" onClick={save}>Save</button>} />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4">
          <div>
            <span className="label">My languages</span>
            <p className="mb-2 text-xs text-ink-400">
              Languages you speak. They appear first in menus. All {LANGUAGES.length} stay available.
            </p>
            <LanguagePicker value={l.preferredLanguages} onChange={(preferredLanguages) => setL({ ...l, preferredLanguages })} />
          </div>
          <Field label="Language I read" hint="Their messages are translated into this language.">
            <LanguageSelect native value={l.myLanguage} preferred={l.preferredLanguages} onChange={(myLanguage) => setL({ ...l, myLanguage })} />
          </Field>
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="font-semibold text-white">Try translation</h2>
        <textarea className="input min-h-20" dir="auto" placeholder="Paste a message in any language… e.g. مرحبا، كيف كان يومك؟ / Привет, как дела? / 今日はどうだった？" value={testText} onChange={(e) => setTestText(e.target.value)} />
        <button className="btn-secondary" disabled={!testText.trim() || busy} onClick={translate}>{busy ? 'Translating…' : `Translate to ${LANGUAGES.find((x) => x.code === l.myLanguage)?.name}`}</button>
        {testOut && <p className="rounded-xl bg-white/5 p-3 text-sm" dir="auto">{testOut}</p>}
      </div>
      {toast}
    </div>
  );
}
