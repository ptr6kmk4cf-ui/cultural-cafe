import type { ProfileInput, ThreadSnapshot } from '@conversa/shared';

export type PageKind = 'discover' | 'profile' | 'messages' | 'other';

export interface ThreadLink {
  threadId: string;
  unread: boolean;
}

/**
 * One adapter per authorised site. Adapters only read what the user is looking at
 * on that site and only act on the composer — no background crawling.
 */
export interface SiteAdapter {
  platformId: string;
  pageKind(): PageKind;
  /** Profiles visible on a discover/search page. */
  readProfiles(): Promise<ProfileInput[]>;
  /** The profile on a profile page. */
  readProfile(): Promise<ProfileInput | null>;
  /** The open conversation thread. */
  readThread(): ThreadSnapshot | null;
  listThreads(): ThreadLink[];
  openThread(threadId: string): Promise<boolean>;
  /** Opens a composer for a profile (discover page modal / profile page). */
  openComposer(profileExternalId: string): boolean;
  insertText(text: string): boolean;
  attachPhoto(file: File): boolean;
  /** Programmatic send — only ever used by Autopilot on platforms with autoSend. */
  clickSend(): boolean;
  /** Called after the USER clicks the site's send button. */
  onUserSend(cb: () => void): () => void;
  /** Called whenever the visible conversation / page content changes. */
  observe(cb: () => void): () => void;
  markProfiles(marks: Record<string, { recommended: boolean; label?: string }>): void;
}
