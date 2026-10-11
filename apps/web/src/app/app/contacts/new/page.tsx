'use client';

import { useState } from 'react';
import { LANGUAGE_MODES, STYLES } from '@conversa/shared';
import { Alert, Field, PageHeader } from '@/components/ui';
import { LanguageSelect } from '@/components/LanguageSelect';
import { api } from '@/lib/client';

export default function NewContact() {
  const [f, setF] = useState({ name: '', profileNotes: '', objective: '', language: '', languageMode: '', style: '', firstMessage: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { contact } = await api('/api/contacts', {
        body: {
          name: f.name,
          profileNotes: f.profileNotes || undefined,
          objective: f.objective || undefined,
          language: f.language || null,
          languageMode: f.languageMode || null,
          style: f.style || null,
        },
      });
      if (f.firstMessage.trim()) {
        await api(`/api/contacts/${contact.id}/messages`, { body: { direction: 'IN', text: f.firstMessage.trim() } });
      }
      window.location.href = `/app/conversations/${contact.id}${f.firstMessage.trim() ? '?reply=1' : '?openers=1'}`;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <PageHeader title="Add a contact" subtitle="Chat with someone you already know or are already talking to — no compatibility screening. Each contact gets its own private memory." />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4">
          <Field label="Name or nickname *"><input className="input" required maxLength={80} value={f.name} onChange={set('name')} /></Field>
          <Field label="What you know about them (optional)" hint="Paste their bio or jot down what they've told you. Used to personalise messages.">
            <textarea className="input min-h-28" value={f.profileNotes} onChange={set('profileNotes')} maxLength={4000} />
          </Field>
          <Field label="Conversation objective (optional)" hint="e.g. get to know them, plan a coffee date, keep it light">
            <input className="input" value={f.objective} onChange={set('objective')} maxLength={300} />
          </Field>
        </div>
        <div className="card space-y-4">
          <Field label="Their language">
            <LanguageSelect value={f.language} onChange={(language) => setF({ ...f, language })} emptyLabel="Use my default / auto-detect" />
          </Field>
          <Field label="Language mode">
            <select className="input" value={f.languageMode} onChange={set('languageMode')}>
              <option value="">My default</option>
              {LANGUAGE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Communication style for this person">
            <select className="input" value={f.style} onChange={set('style')}>
              <option value="">My default</option>
              {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Their latest message (optional)" hint="Paste it to get reply suggestions straight away. Leave empty to write an opener.">
            <textarea className="input min-h-20" dir="auto" value={f.firstMessage} onChange={set('firstMessage')} maxLength={4000} />
          </Field>
        </div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add contact'}</button>
    </form>
  );
}
