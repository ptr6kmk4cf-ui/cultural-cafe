'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Empty, Field, PageHeader, Spinner, useToast } from '@/components/ui';
import { api, splitTags } from '@/lib/client';

const CATEGORIES = ['GENERAL', 'TRAVEL', 'HOBBY', 'FOOD', 'PET', 'PORTRAIT', 'PRIVATE'];
type Photo = { id: string; albumId: string | null; url: string; caption: string; tags: string[]; category: string; aiApproved: boolean; width: number; height: number; sizeBytes: number };
type Album = { id: string; name: string; photoCount: number };

export default function Photos() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [album, setAlbum] = useState<string>('');
  const [newAlbum, setNewAlbum] = useState('');
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [meta, setMeta] = useState({ caption: '', tags: '', category: 'GENERAL', aiApproved: true });
  const [selected, setSelected] = useState<Photo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, show] = useToast();

  const load = async () => {
    const [p, a] = await Promise.all([api(`/api/photos${album ? `?albumId=${album}` : ''}`), api('/api/albums')]);
    setPhotos(p.photos);
    setAlbums(a.albums);
  };
  useEffect(() => {
    load().catch((e) => {
      setError((e as Error).message);
      setPhotos([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setError('Only JPEG, PNG and WebP images are supported.');
    if (f.size > 10 * 1024 * 1024) return setError('Max 10 MB per photo.');
    setError('');
    setPreview({ file: f, url: URL.createObjectURL(f) });
  }

  async function upload() {
    if (!preview) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', preview.file);
      form.append('caption', meta.caption);
      form.append('tags', splitTags(meta.tags).join(','));
      form.append('category', meta.category);
      form.append('aiApproved', String(meta.category !== 'PRIVATE' && meta.aiApproved));
      if (album) form.append('albumId', album);
      await api('/api/photos', { form });
      setPreview(null);
      setMeta({ caption: '', tags: '', category: 'GENERAL', aiApproved: true });
      if (fileRef.current) fileRef.current.value = '';
      show('Uploaded — location metadata removed');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function update(p: Photo, data: Partial<Photo>) {
    const r = await api(`/api/photos/${p.id}`, { method: 'PATCH', body: data });
    setSelected(r.photo);
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Photo" subtitle="Optional. Pick one for your café card so the other person can see a face." />
      {error && <Alert kind="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <button className={album === '' ? 'btn-secondary' : 'btn-ghost'} onClick={() => setAlbum('')}>All photos</button>
        {albums.map((a) => (
          <span key={a.id} className="flex items-center">
            <button className={album === a.id ? 'btn-secondary' : 'btn-ghost'} onClick={() => setAlbum(a.id)}>{a.name} ({a.photoCount})</button>
            {album === a.id && (
              <button
                className="ml-1 text-xs text-red-300"
                onClick={async () => {
                  const withPhotos = confirm('Also delete the photos inside this album? (Cancel keeps them, unsorted)');
                  await api(`/api/albums/${a.id}${withPhotos ? '?withPhotos=1' : ''}`, { method: 'DELETE' });
                  setAlbum('');
                }}
              >
                delete album
              </button>
            )}
          </span>
        ))}
        <input className="input ml-auto max-w-[180px] py-1.5" placeholder="New album" value={newAlbum} onChange={(e) => setNewAlbum(e.target.value)} />
        <button
          className="btn-secondary"
          disabled={!newAlbum.trim()}
          onClick={async () => {
            await api('/api/albums', { body: { name: newAlbum } });
            setNewAlbum('');
            load();
          }}
        >
          Create
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-white">Upload</h2>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="text-sm" />
        {preview && (
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <img src={preview.url} alt="preview" className="h-48 w-full rounded-xl object-cover" />
            <div className="space-y-3">
              <Field label="Caption"><input className="input" value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} placeholder="e.g. Sunset hike in Sintra last summer" /></Field>
              <Field label="Tags" hint="Comma-separated, helps the AI match photos to topics (e.g. hiking, portugal, travel)"><input className="input" value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} /></Field>
              <div className="flex flex-wrap items-center gap-3">
                <select className="input w-40" value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={meta.category === 'PRIVATE'} checked={meta.category !== 'PRIVATE' && meta.aiApproved} onChange={(e) => setMeta({ ...meta, aiApproved: e.target.checked })} />
                  Approve for AI suggestions
                </label>
              </div>
              {meta.category === 'PRIVATE' && <p className="text-xs text-amber-200">Private photos are never suggested or shared by the AI.</p>}
              <button className="btn-primary" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        )}
        <p className="text-xs text-ink-400">Do not upload intimate images, identity documents or photos of other people without their consent. EXIF / GPS metadata is stripped on upload.</p>
      </div>

      {!photos ? (
        <Spinner />
      ) : photos.length === 0 ? (
        <Empty title="No photos yet" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setSelected(p)} className="group relative overflow-hidden rounded-xl border border-white/5 text-left">
              <img src={p.url} alt={p.caption} className="aspect-square w-full object-cover transition group-hover:scale-105" />
              <div className="absolute left-2 top-2 flex gap-1">
                {p.aiApproved ? <Badge tone="green">AI ✓</Badge> : <Badge>{p.category === 'PRIVATE' ? 'Private' : 'Not approved'}</Badge>}
              </div>
              {p.caption && <p className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-xs">{p.caption}</p>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={() => setSelected(null)}>
          <div className="card w-full max-w-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <img src={selected.url} alt="" className="max-h-[50vh] w-full rounded-xl object-contain" />
            <PhotoEditor photo={selected} albums={albums} onSave={(d) => update(selected, d)} />
            <div className="flex justify-between">
              <button
                className="btn-danger"
                onClick={async () => {
                  if (!confirm('Delete this photo permanently?')) return;
                  await api(`/api/photos/${selected.id}`, { method: 'DELETE' });
                  setSelected(null);
                  load();
                }}
              >
                Delete
              </button>
              <button className="btn-ghost" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}

function PhotoEditor({ photo, albums, onSave }: { photo: Photo; albums: Album[]; onSave: (d: Partial<Photo>) => void }) {
  const [caption, setCaption] = useState(photo.caption);
  const [tags, setTags] = useState(photo.tags.join(', '));
  const [category, setCategory] = useState(photo.category);
  const [approved, setApproved] = useState(photo.aiApproved);
  const [albumId, setAlbumId] = useState(photo.albumId ?? '');
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption" />
      <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags" />
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className="input" value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
        <option value="">No album</option>
        {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={category === 'PRIVATE'} checked={category !== 'PRIVATE' && approved} onChange={(e) => setApproved(e.target.checked)} /> Approved for AI suggestions
      </label>
      <button
        className="btn-primary"
        onClick={() => onSave({ caption, tags: splitTags(tags).map((t) => t.toLowerCase()), category, aiApproved: approved, albumId: albumId || null })}
      >
        Save
      </button>
    </div>
  );
}
