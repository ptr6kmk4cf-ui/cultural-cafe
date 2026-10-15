/** Asks Chrome to keep the email and password, like a normal sign-up form. */
export async function keepBrowserLogin(email: string, password: string, name = '') {
  const id = email.trim();
  if (!id || !password || typeof window === 'undefined') return;
  try {
    const Cred = (window as Window & { PasswordCredential?: new (data: { id: string; password: string; name?: string }) => Credential }).PasswordCredential;
    if (!Cred || !navigator.credentials?.store) return;
    await navigator.credentials.store(new Cred({ id, password, name: name.trim() || id }));
  } catch {
    /* The browser may ignore this if the person declined. Autocomplete still works. */
  }
}
