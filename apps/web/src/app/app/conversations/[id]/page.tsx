'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { LANGUAGE_MODES, STYLES, isRtl, languageName, type ReplyResponse } from '@conversa/shared';
import { Alert, Badge, CopyButton, Field, Spinner, useToast } from '@/components/ui';
import { LanguageSelect } from '@/components/LanguageSelect';
import { api } from '@/lib/client';
import { bump, live } from '@/lib/table-lanes';

type Contact = {
  id: string;
  name: string;
  source: string;
  platform: string | null;
  profileNotes: string;
  objective: string;
  language: string | null;
  languageMode: string | null;
  style: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  doNotContact: boolean;
  humanTakeover: boolean;
  autopilotAllowed: boolean;
};
type Msg = { id: string; direction: 'IN' | 'OUT'; text: string; translatedText: string | null; aiGenerated: boolean; autopilot: boolean; photoId: string | null; sentAt: string };
type Mem = { id: string; kind: string; content: string; source: string; resolved: boolean };
type Reply = ReplyResponse & { needsUserInput: string | null };

const MEMORY_KINDS = ['INTEREST', 'FACT', 'TOPIC', 'QUESTION', 'COMMITMENT', 'PREFERENCE'];

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [memories, setMemories] = useState<Mem[]>([]);
  const [incoming, setIncoming] = useState('');
  const [instruction, setInstruction] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [openers, setOpeners] = useState<{ text: string; hook: string; translation?: string | null }[] | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'memory' | 'settings'>('memory');
  const [toast, show] = useToast();
  const bottom = useRef<HTMLDivElement>(null);
  const loadSlot = useRef({ current: 0 });

  const load = useCallback(async () => {
    const token = bump(loadSlot.current);
    const d = await api(`/api/contacts/${id}`);
    if (!live(loadSlot.current, token)) return false;
    setContact(d.contact);
    setMessages(d.messages);
    setMemories(d.memories);
    return true;
  }, [id]);

  useEffect(() => {
    load()
      .then((ok) => {
        if (!ok) return;
        const q = new URLSearchParams(window.location.search);
        if (q.get('openers')) genOpeners();
        if (q.get('reply')) getReplies();
      })
      .catch(() => {});
    return () => {
      bump(loadSlot.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [messages.length]);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const getReplies = () =>
    run('reply', async () => {
      const r = await api<Reply>(`/api/contacts/${id}/reply`, { body: { incoming: incoming.trim() || undefined, instruction: instruction.trim() || undefined } });
      setReply(r);
      setDrafts(r.suggestions.map((s) => s.text));
      setIncoming('');
      setOpeners(null);
      void load();
    });

  const genOpeners = () =>
    run('openers', async () => {
      const r = await api(`/api/contacts/${id}/openers`, { body: { avoid: openers?.map((o) => o.text) ?? [] } });
      setOpeners(r.openers);
      setDrafts(r.openers.map((o: { text: string }) => o.text));
      setReply(null);
    });

  const markSent = (text: string, photoId?: string) =>
    run('send', async () => {
      await api(`/api/contacts/${id}/messages`, { body: { direction: 'OUT', text, aiGenerated: true, photoId: photoId ?? null } });
      setReply(null);
      setOpeners(null);
      show('Logged as sent');
      void load();
    });

  const logMine = () =>
    run('log', async () => {
      await api(`/api/contacts/${id}/messages`, { body: { direction: 'OUT', text: incoming.trim() } });
      setIncoming('');
      void load();
    });

  async function patch(data: Partial<Contact>) {
    const r = await api(`/api/contacts/${id}`, { method: 'PATCH', body: data });
    setContact(r.contact);
    show('Saved');
  }

  if (!contact) return <Spinner />;
  const rtl = isRtl(contact.language);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-amber-800 text-lg font-bold text-white">{contact.name[0]}</span>
          <div>
            <h1 className="text-2xl font-bold text-white">{contact.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge>{contact.source.toLowerCase()}</Badge>
              {contact.platform && <Badge>{contact.platform}</Badge>}
              <Badge tone="brand">{contact.language ? languageName(contact.language) : 'auto language'}</Badge>
              {contact.doNotContact && <Badge tone="red">Do not contact</Badge>}
              {contact.humanTakeover && <Badge tone="amber">Human takeover</Badge>}
              {contact.status === 'ARCHIVED' && <Badge>Archived</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={`/api/contacts/${id}/export`}>Export</a>
          <button className="btn-ghost" onClick={() => patch({ status: contact.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' })}>
            {contact.status === 'ACTIVE' ? 'Archive' : 'Unarchive'}
          </button>
          <button
            className="btn-ghost text-red-300"
            onClick={async () => {
              if (!confirm(`Delete ${contact.name} and all their messages and memories?`)) return;
              await api(`/api/contacts/${id}`, { method: 'DELETE' });
              window.location.href = '/app/conversations';
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {contact.doNotContact && (
        <Alert kind="warning">
          {contact.name} declined or asked to stop. Cultural Café will not draft further messages or let Autopilot contact them.{' '}
          <button className="underline" onClick={() => patch({ doNotContact: false })}>This was a mistake — clear flag</button>
        </Alert>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card max-h-[50vh] space-y-3 overflow-y-auto">
            {messages.length === 0 && <p className="text-sm text-ink-400">No messages yet. Generate an opener below, or paste their message.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.direction === 'OUT' ? 'bg-gradient-to-br from-brand-600 to-amber-800 text-white' : 'bg-white/10 text-ink-100'}`}>
                  {m.photoId && <img src={`/api/photos/${m.photoId}/file`} alt="" className="mb-2 max-h-40 rounded-lg" />}
                  <p dir="auto" className="whitespace-pre-wrap">{m.text}</p>
                  {m.translatedText && <p dir="auto" className="mt-1 border-t border-white/10 pt-1 text-xs opacity-70">{m.translatedText}</p>}
                  <p className="mt-1 text-[10px] opacity-60">
                    {new Date(m.sentAt).toLocaleString()} {m.autopilot ? '· autopilot' : m.aiGenerated ? '· AI-assisted' : ''}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottom} />
          </div>

          <div className="card space-y-3">
            <Field label={`Paste ${contact.name}'s new message (optional)`}>
              <textarea className="input min-h-20" dir="auto" value={incoming} onChange={(e) => setIncoming(e.target.value)} placeholder="Their latest message…" />
            </Field>
            <Field label="Extra instruction for this reply (optional)">
              <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. suggest a coffee on Saturday, keep it short" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!!busy || contact.doNotContact} onClick={getReplies}>
                {busy === 'reply' ? <Spinner /> : '✦'} Suggest replies
              </button>
              <button className="btn-secondary" disabled={!!busy || contact.doNotContact} onClick={genOpeners}>
                {busy === 'openers' ? <Spinner /> : null} {openers ? 'Regenerate openers' : 'Write openers'}
              </button>
              <button className="btn-ghost" disabled={!incoming.trim() || !!busy} onClick={logMine}>Log as a message I sent</button>
            </div>
          </div>

          {reply && (
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="brand">Detected: {languageName(reply.detectedLanguage)}</Badge>
                <Badge>Reply in: {languageName(reply.replyLanguage)}</Badge>
                <Badge tone={reply.intent.interestLevel === 'high' ? 'green' : 'default'}>Interest: {reply.intent.interestLevel}</Badge>
                {reply.intent.meetingAppropriate && <Badge tone="green">Good moment to suggest meeting</Badge>}
                {reply.intent.stopRequested && <Badge tone="red">They asked to stop</Badge>}
                {reply.intent.needsHuman && <Badge tone="amber">Needs your judgement</Badge>}
                {reply.memoryAdded > 0 && <Badge>+{reply.memoryAdded} memories</Badge>}
                {reply.mockAi && <Badge tone="amber">Mock AI</Badge>}
              </div>
              {reply.incomingTranslation && (
                <div className="rounded-xl bg-white/5 p-3 text-sm">
                  <span className="label">Their message, translated</span>
                  <p dir="auto">{reply.incomingTranslation}</p>
                </div>
              )}
              {reply.intent.needsHuman && <Alert kind="warning">{reply.intent.needsHumanReason || 'This one needs your judgement.'}</Alert>}
              {reply.needsUserInput && <Alert kind="info">To improve this reply: {reply.needsUserInput}</Alert>}
              <Suggestions drafts={drafts} setDrafts={setDrafts} translations={reply.suggestions.map((s) => s.translation)} rtl={isRtl(reply.replyLanguage)} onSend={(t) => markSent(t)} busy={!!busy} />
              {reply.photoSuggestion && <PhotoSuggestion s={reply.photoSuggestion} onSend={(caption) => markSent(caption, reply.photoSuggestion!.photoId)} />}
              <button className="btn-ghost text-xs" onClick={getReplies} disabled={!!busy}>↻ Regenerate</button>
            </div>
          )}

          {openers && (
            <div className="card space-y-3">
              <h3 className="font-semibold text-white">Opening messages</h3>
              {openers.length === 0 && <p className="text-sm text-ink-400">No safe openers were generated — try adding profile notes.</p>}
              <Suggestions drafts={drafts} setDrafts={setDrafts} hooks={openers.map((o) => o.hook)} translations={openers.map((o) => o.translation ?? null)} rtl={rtl} onSend={(t) => markSent(t)} busy={!!busy} />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <button className={tab === 'memory' ? 'btn-secondary' : 'btn-ghost'} onClick={() => setTab('memory')}>Memory ({memories.length})</button>
            <button className={tab === 'settings' ? 'btn-secondary' : 'btn-ghost'} onClick={() => setTab('settings')}>Settings</button>
          </div>
          {tab === 'memory' ? <MemoryPanel contactId={id} memories={memories} reload={async () => { await load(); }} /> : <SettingsPanel contact={contact} onSave={patch} />}
        </div>
      </div>
      {toast}
    </div>
  );
}

function Suggestions({
  drafts,
  setDrafts,
  translations,
  hooks,
  rtl,
  onSend,
  busy,
}: {
  drafts: string[];
  setDrafts: (d: string[]) => void;
  translations?: (string | null)[];
  hooks?: string[];
  rtl: boolean;
  onSend: (text: string) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      {drafts.map((d, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-ink-900/50 p-3">
          {hooks?.[i] && <p className="mb-1 text-[11px] uppercase tracking-wide text-brand-300">Uses: {hooks[i]}</p>}
          <textarea
            className="w-full resize-y bg-transparent text-sm text-white outline-none"
            dir={rtl ? 'rtl' : 'auto'}
            rows={Math.min(6, Math.max(2, Math.ceil(d.length / 70)))}
            value={d}
            onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {translations?.[i] && <p className="mt-1 text-xs text-ink-400" dir="auto">↳ {translations[i]}</p>}
          <div className="mt-2 flex gap-2">
            <CopyButton text={d} />
            <button className="btn-secondary px-3 py-1 text-xs" disabled={busy || !d.trim()} onClick={() => onSend(d)}>I sent this</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PhotoSuggestion({ s, onSend }: { s: { photoId: string; caption: string; reason: string }; onSend: (caption: string) => void }) {
  const [caption, setCaption] = useState(s.caption);
  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
      <p className="label">Suggested photo</p>
      <div className="flex gap-3">
        <img src={`/api/photos/${s.photoId}/file`} alt="" className="h-24 w-24 rounded-lg object-cover" />
        <div className="flex-1 space-y-2">
          <p className="text-xs text-ink-300">{s.reason}</p>
          <input className="input" dir="auto" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <div className="flex gap-2">
            <a className="btn-ghost px-2 py-1 text-xs" href={`/api/photos/${s.photoId}/file`} download>Download</a>
            <button className="btn-secondary px-3 py-1 text-xs" onClick={() => onSend(caption)}>I sent this photo</button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">Photos are never sent automatically. Review before sharing.</p>
    </div>
  );
}

function MemoryPanel({ contactId, memories, reload }: { contactId: string; memories: Mem[]; reload: () => Promise<void> }) {
  const [kind, setKind] = useState('FACT');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const visible = memories.filter((m) => m.kind !== 'PHOTO_SHARED');
  const photos = memories.filter((m) => m.kind === 'PHOTO_SHARED');

  return (
    <div className="card space-y-3">
      <p className="text-xs text-ink-400">What Cultural Café remembers about this person. Review, correct or delete anything.</p>
      <ul className="space-y-2">
        {visible.map((m) => (
          <li key={m.id} className={`rounded-xl bg-white/5 p-2 text-sm ${m.resolved ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <Badge tone={m.kind === 'QUESTION' ? 'amber' : m.kind === 'COMMITMENT' ? 'brand' : 'default'}>{m.kind.toLowerCase()}</Badge>
              <div className="flex gap-1 text-xs">
                <button className="text-ink-400 hover:text-white" onClick={() => { setEditing(m.id); setEditText(m.content); }}>edit</button>
                <button
                  className="text-ink-400 hover:text-red-300"
                  onClick={async () => {
                    await api(`/api/contacts/${contactId}/memory/${m.id}`, { method: 'DELETE' });
                    reload();
                  }}
                >
                  delete
                </button>
              </div>
            </div>
            {editing === m.id ? (
              <div className="mt-1 flex gap-1">
                <input className="input py-1" value={editText} onChange={(e) => setEditText(e.target.value)} />
                <button
                  className="btn-secondary px-2 py-1 text-xs"
                  onClick={async () => {
                    await api(`/api/contacts/${contactId}/memory/${m.id}`, { method: 'PATCH', body: { content: editText } });
                    setEditing(null);
                    reload();
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <p className="mt-1" dir="auto">{m.content}</p>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="text-sm text-ink-400">Nothing yet — memories are added as you chat.</li>}
      </ul>
      {photos.length > 0 && <p className="text-xs text-ink-400">{photos.length} photo(s) already shared with this contact.</p>}
      <div className="space-y-2 border-t border-white/5 pt-3">
        <div className="flex gap-2">
          <select className="input w-36" value={kind} onChange={(e) => setKind(e.target.value)}>
            {MEMORY_KINDS.map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}
          </select>
          <input className="input" placeholder="Add a memory…" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="flex justify-between">
          <button
            className="btn-secondary px-3 py-1 text-xs"
            disabled={!content.trim()}
            onClick={async () => {
              await api(`/api/contacts/${contactId}/memory`, { body: { kind, content } });
              setContent('');
              reload();
            }}
          >
            Add
          </button>
          <button
            className="btn-ghost px-2 py-1 text-xs text-red-300"
            onClick={async () => {
              if (!confirm('Clear all memory for this contact?')) return;
              await api(`/api/contacts/${contactId}/memory`, { method: 'DELETE' });
              reload();
            }}
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ contact, onSave }: { contact: Contact; onSave: (d: Partial<Contact>) => Promise<void> }) {
  const [c, setC] = useState(contact);
  return (
    <div className="card space-y-3">
      <Field label="Name"><input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
      <Field label="Their language">
        <LanguageSelect value={c.language ?? ''} onChange={(v) => setC({ ...c, language: v || null })} emptyLabel="Auto / my default" />
      </Field>
      <Field label="Language mode">
        <select className="input" value={c.languageMode ?? ''} onChange={(e) => setC({ ...c, languageMode: e.target.value || null })}>
          <option value="">My default</option>
          {LANGUAGE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Field>
      <Field label="Style">
        <select className="input" value={c.style ?? ''} onChange={(e) => setC({ ...c, style: e.target.value || null })}>
          <option value="">My default</option>
          {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="Objective"><input className="input" value={c.objective} onChange={(e) => setC({ ...c, objective: e.target.value })} /></Field>
      <Field label="Profile notes"><textarea className="input min-h-24" value={c.profileNotes} onChange={(e) => setC({ ...c, profileNotes: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.autopilotAllowed} onChange={(e) => setC({ ...c, autopilotAllowed: e.target.checked })} /> Allow Autopilot for this contact</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.humanTakeover} onChange={(e) => setC({ ...c, humanTakeover: e.target.checked })} /> I&apos;m handling this one myself (pause Autopilot)</label>
      <button
        className="btn-primary w-full"
        onClick={() =>
          onSave({
            name: c.name,
            language: c.language,
            languageMode: c.languageMode,
            style: c.style,
            objective: c.objective,
            profileNotes: c.profileNotes,
            autopilotAllowed: c.autopilotAllowed,
            humanTakeover: c.humanTakeover,
          })
        }
      >
        Save settings
      </button>
    </div>
  );
}
