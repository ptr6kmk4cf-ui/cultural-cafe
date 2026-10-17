const SIT_STORE = 'cafe_sit';

/** A café guest slug from the landing wheel, safe to put in a URL. */
export function normalizeSitKey(raw: string) {
  const key = (raw || '').trim().toLowerCase();
  return /^[a-z][a-z0-9]{0,31}$/.test(key) ? key : '';
}

export function rememberLandingSit(sit: string) {
  const key = normalizeSitKey(sit);
  if (!key) return '';
  try {
    sessionStorage.setItem(SIT_STORE, key);
  } catch {
    /* Private browsing can block storage. The query string still carries the seat. */
  }
  return key;
}

export function readLandingSit(search = '') {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('sit') || '';
  let stored = '';
  try {
    stored = sessionStorage.getItem(SIT_STORE) || '';
  } catch {
    /* ignore */
  }
  const key = normalizeSitKey(query) || normalizeSitKey(stored);
  if (key) rememberLandingSit(key);
  return key;
}

export function clearLandingSit() {
  try {
    sessionStorage.removeItem(SIT_STORE);
  } catch {
    /* ignore */
  }
}

export function registerHrefForSit(sit: string) {
  const key = normalizeSitKey(sit);
  return key ? `/register?sit=${encodeURIComponent(key)}` : '/register';
}

export function loginHrefForSit(sit: string) {
  const key = normalizeSitKey(sit);
  return key ? `/login?next=${encodeURIComponent(openSitPath(key))}` : '/login';
}

export function openSitPath(sit: string) {
  const key = normalizeSitKey(sit);
  return key ? `/app/world/open/${key}` : '/app?welcome=1';
}

/** After sign-up, go to the spun table. A friend invite still opens the profile. */
export function afterRegisterPath(opts: { sit?: string; invite?: string }) {
  const sit = normalizeSitKey(opts.sit || '');
  if (sit) return openSitPath(sit);
  if ((opts.invite || '').trim()) return '/app/world?from=friend';
  return '/app?welcome=1';
}
