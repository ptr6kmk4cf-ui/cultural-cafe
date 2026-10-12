'use client';

const KEEP = 'cafe-keep-lines';
const PREFIX = 'cafe-lines:';

export type DeviceLine = {
  id: string;
  mine: boolean;
  text: string;
  language: string;
  translation: string | null;
  translationLang: string | null;
  flagged: boolean;
  createdAt: string;
};

export function deviceKeepsLines() {
  try {
    return localStorage.getItem(KEEP) === '1';
  } catch {
    return false;
  }
}

export function setDeviceKeepsLines(on: boolean) {
  try {
    localStorage.setItem(KEEP, on ? '1' : '0');
    if (!on) {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
      }
      for (const key of keys) localStorage.removeItem(key);
    }
  } catch {
    /* private mode */
  }
}

export function loadDeviceLines(conversationId: string): DeviceLine[] {
  if (!deviceKeepsLines()) return [];
  try {
    const raw = localStorage.getItem(PREFIX + conversationId);
    const data = raw ? (JSON.parse(raw) as DeviceLine[]) : [];
    return Array.isArray(data) ? data.filter((m) => m?.id && m.text).slice(-200) : [];
  } catch {
    return [];
  }
}

export function forgetDeviceLines(conversationId: string) {
  try {
    localStorage.removeItem(PREFIX + conversationId);
  } catch {
    /* private mode */
  }
}

export function saveDeviceLines(conversationId: string, lines: DeviceLine[]) {
  if (!deviceKeepsLines()) return;
  try {
    const slim = lines.filter((m) => m.id && m.text && !m.id.startsWith('local_')).slice(-200);
    localStorage.setItem(PREFIX + conversationId, JSON.stringify(slim));
  } catch {
    /* storage full or private mode */
  }
}
