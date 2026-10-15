const FROM = process.env.SUPPORT_EMAIL || 'hello@culturalcafe.online';

/** Sends a plain café email. Resend in production; the terminal in local development. */
export async function sendCafeEmail(opts: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[mail] RESEND_API_KEY is missing');
      return false;
    }
    console.info(`[mail] ${opts.to}\n${opts.subject}\n${opts.text}`);
    return true;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: `Cultural Café <${FROM}>`,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
    }),
  });
  if (!res.ok) {
    console.error('[mail]', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}
