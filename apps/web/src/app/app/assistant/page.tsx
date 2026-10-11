'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LANGUAGE_MODES, STYLES, languageName } from '@conversa/shared';
import { Alert, Badge, CopyButton, Field, PageHeader, Spinner } from '@/components/ui';
import { LanguageSelect } from '@/components/LanguageSelect';
import { api } from '@/lib/client';

/** Parses lines like "Them: …" / "Me: …"; a bare block is treated as their message. */
function parseConversation(raw: string) {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: { direction: 'IN' | 'OUT'; text: string }[] = [];
  for (const l of lines) {
    const m = l.match(/^(me|moi|yo|ich|io|eu|ik|أنا)\s*:\s*(.*)$/i);
    const t = l.match(/^(them|they|her|him|[^:]{1,20})\s*:\s*(.*)$/i);
    if (m) out.push({ direction: 'OUT', text: m[2] });
    else if (t) out.push({ direction: 'IN', text: t[2] });
    else if (out.length) out[out.length - 1].text += `\n${l}`;
    else out.push({ direction: 'IN', text: l });
  }
  return out.length ? out : [{ direction: 'IN' as const, text: raw.trim() }];
}

export default function Assistant() {
  const [raw, setRaw] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState('');
  const [language, setLanguage] = useState('');
  const [style, setStyle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<any>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    api('/api/contacts').then((d) => setContacts(d.contacts));
    // Text shared from another app (Android share sheet): via #shared=… (service worker) or ?text= (first launch).
    const hash = new URLSearchParams(window.location.hash.slice(1)).get('shared');
    const q = new URLSearchParams(window.location.search);
    const text = hash ?? [q.get('title'), q.get('text')].filter(Boolean).join('\n');
    if (text?.trim()) {
      setRaw(text.trim().slice(0, 8000));
      setShared(true);
      window.history.replaceState(null, '', '/app/assistant');
    }
  }, []);

  async function go() {
    setBusy(true);
    setError('');
    setRes(null);
    try {
      setRes(
        await api('/api/ai/quick-reply', {
          body: {
            name: name || 'Them',
            conversation: parseConversation(raw),
            mode: mode || undefined,
            language: language || undefined,
            style: style || null,
            instruction: instruction || undefined,
          },
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Reply Assistant"
        subtitle="Quick help with any message — nothing is saved. For memory and continuity, open a contact's conversation instead."
      />
      {contacts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-ink-400">Your contacts:</span>
          {contacts.slice(0, 12).map((c) => (
            <Link key={c.id} className="chip hover:bg-white/10" href={`/app/conversations/${c.id}`}>{c.name}</Link>
          ))}
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {shared && <Alert kind="info">Conversation received from another app. Check it below, then tap Suggest replies.</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <Field label="Their name (optional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Conversation" hint={'Paste their message, or several lines like "Them: …" and "Me: …".'}>
            <textarea className="input min-h-48 font-mono text-xs" dir="auto" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'Them: Hey! I saw you like hiking, what is your favourite trail?'} />
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Mode">
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="">Default</option>
                {LANGUAGE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Language">
              <LanguageSelect value={language} onChange={setLanguage} emptyLabel="Default" />
            </Field>
            <Field label="Style">
              <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="">Default</option>
                {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Extra instruction (optional)"><input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} /></Field>
          <button className="btn-primary" disabled={!raw.trim() || busy} onClick={go}>{busy ? <Spinner /> : '✦'} Suggest replies</button>
        </div>
        <div className="space-y-3">
          {res && (
            <div className="card space-y-3">
              <div className="flex flex-wrap gap-1">
                <Badge tone="brand">Detected: {languageName(res.detectedLanguage)}</Badge>
                <Badge>Reply in: {languageName(res.replyLanguage)}</Badge>
                <Badge>Interest: {res.intent.interestLevel}</Badge>
                {res.intent.stopRequested && <Badge tone="red">They asked to stop</Badge>}
                {res.mockAi && <Badge tone="amber">Mock AI</Badge>}
              </div>
              {res.incomingTranslation && <p className="rounded-xl bg-white/5 p-3 text-sm" dir="auto">{res.incomingTranslation}</p>}
              {res.intent.needsHuman && <Alert kind="warning">{res.intent.needsHumanReason}</Alert>}
              {res.needsUserInput && <Alert kind="info">{res.needsUserInput}</Alert>}
              {res.suggestions.map((s: { text: string; translation: string | null }, i: number) => (
                <div key={i} className="rounded-xl border border-white/10 p-3 text-sm">
                  <p dir="auto" className="whitespace-pre-wrap text-white">{s.text}</p>
                  {s.translation && <p dir="auto" className="mt-1 text-xs text-ink-400">↳ {s.translation}</p>}
                  <CopyButton text={s.text} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
