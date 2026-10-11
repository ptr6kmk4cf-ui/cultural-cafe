import type { ProfileInput, ThreadSnapshot } from '@conversa/shared';
import type { PageKind, SiteAdapter } from './types';
import { imageToJpegDataUrl, setFiles, setNativeValue, sleep, waitFor } from './dom';

/**
 * Adapter for the local "Amora" demo site (platform id `conversa-demo`).
 * Reads the site's documented data-conversa-* markup contract.
 */
const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const text = (root: ParentNode, field: string) => q(`[data-field="${field}"]`, root)?.textContent?.trim() || null;

async function readProfileEl(root: HTMLElement, withPhotos: boolean): Promise<ProfileInput> {
  const photos: string[] = [];
  if (withPhotos) {
    for (const img of qa<HTMLImageElement>('img[data-field="photo"]', root).slice(0, 2)) {
      const d = await imageToJpegDataUrl(img.src);
      if (d) photos.push(d);
    }
  }
  const age = Number(text(root, 'age'));
  const distance = Number(text(root, 'distance'));
  const height = text(root, 'height');
  return {
    externalId: root.dataset.profileId!,
    name: text(root, 'name') ?? 'Unknown',
    age: Number.isFinite(age) && age > 0 ? age : null,
    location: text(root, 'city'),
    distanceKm: Number.isFinite(distance) ? distance : null,
    bio: text(root, 'bio'),
    interests: qa('[data-field="interest"]', root).map((e) => e.textContent!.trim()),
    lookingFor: text(root, 'lookingFor'),
    lifestyle: qa('[data-field="lifestyle"]', root).map((e) => e.textContent!.trim()),
    statedAttributes: height ? { height } : {},
    language: text(root, 'language'),
    photos,
  };
}

function activeComposer(): HTMLElement | null {
  const modal = q('#composerModal.open [data-conversa-composer]');
  return modal ?? q('[data-conversa-thread] [data-conversa-composer]') ?? q('[data-page="profile"] [data-conversa-composer]') ?? null;
}

export const demoAdapter: SiteAdapter = {
  platformId: 'conversa-demo',

  pageKind(): PageKind {
    const p = document.body.dataset.page;
    return p === 'discover' || p === 'profile' || p === 'messages' ? p : 'other';
  },

  async readProfiles() {
    const cards = qa('[data-conversa-results] [data-conversa-profile]').slice(0, 12);
    return Promise.all(cards.map((c) => readProfileEl(c, true)));
  },

  async readProfile() {
    const root = q('[data-conversa-profile][data-page="profile"]');
    return root ? readProfileEl(root, true) : null;
  },

  readThread(): ThreadSnapshot | null {
    const root = q('[data-conversa-thread]');
    if (!root) return null;
    return {
      platform: 'conversa-demo',
      externalId: root.dataset.threadId!,
      contactName: root.dataset.contactName || 'Unknown',
      profileExternalId: root.dataset.profileId || null,
      messages: qa('[data-conversa-message]', root).map((m) => ({
        externalId: m.dataset.messageId!,
        direction: m.dataset.direction === 'out' ? 'OUT' : 'IN',
        text: q('[data-text]', m)?.textContent ?? '',
        sentAt: m.dataset.sentAt,
        hasPhoto: m.dataset.hasPhoto === '1',
      })),
    };
  },

  listThreads() {
    return qa('[data-conversa-thread-link]').map((a) => ({ threadId: a.dataset.threadId!, unread: a.dataset.unread === '1' }));
  },

  async openThread(threadId) {
    const link = q<HTMLAnchorElement>(`[data-conversa-thread-link][data-thread-id="${CSS.escape(threadId)}"]`);
    if (!link) return false;
    link.click();
    const ok = await waitFor(() => q(`[data-conversa-thread][data-thread-id="${CSS.escape(threadId)}"]`) && q('[data-conversa-message]'), 5000);
    await sleep(300);
    return !!ok;
  },

  openComposer(profileExternalId) {
    if (this.pageKind() === 'discover') {
      const btn = q<HTMLButtonElement>(`[data-conversa-open-composer="${CSS.escape(profileExternalId)}"]`);
      btn?.click();
      return !!btn;
    }
    return !!activeComposer();
  },

  insertText(value) {
    const input = activeComposer()?.querySelector<HTMLTextAreaElement>('[data-conversa-input]');
    if (!input) return false;
    setNativeValue(input, value);
    input.focus();
    input.scrollIntoView({ block: 'nearest' });
    return true;
  },

  attachPhoto(file) {
    const input = activeComposer()?.querySelector<HTMLInputElement>('[data-conversa-photo-input]');
    if (!input) return false;
    setFiles(input, [file]);
    return true;
  },

  clickSend() {
    const btn = activeComposer()?.querySelector<HTMLButtonElement>('[data-conversa-send]');
    if (!btn) return false;
    btn.click();
    return true;
  },

  onUserSend(cb) {
    const handler = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (e.isTrusted && t?.closest('[data-conversa-send]')) cb();
    };
    const keyHandler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.isTrusted && e.key === 'Enter' && !e.shiftKey && !e.isComposing && t?.closest('[data-conversa-input]')) cb();
    };
    document.addEventListener('click', handler, true);
    document.addEventListener('keydown', keyHandler, true);
    return () => {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('keydown', keyHandler, true);
    };
  },

  observe(cb) {
    let t: number | undefined;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = window.setTimeout(cb, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-thread-id', 'data-unread'] });
    return () => mo.disconnect();
  },

  markProfiles(marks) {
    for (const card of qa('[data-conversa-results] [data-conversa-profile]')) {
      card.querySelector('.conversa-mark')?.remove();
      const m = marks[card.dataset.profileId!];
      card.style.opacity = m && !m.recommended ? '0.35' : '';
      card.style.outline = m?.recommended ? '3px solid #e8436b' : '';
      if (m?.recommended) {
        const badge = document.createElement('div');
        badge.className = 'conversa-mark';
        badge.textContent = m.label ?? '★ Café pick';
        Object.assign(badge.style, {
          position: 'absolute', top: '10px', left: '10px', background: '#e8436b', color: '#fff',
          padding: '4px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: '700', zIndex: '2',
        });
        card.prepend(badge);
      }
    }
  },
};
