import { requireUser } from '@/lib/auth';
import { transcribeSpeech } from '@/lib/ai/transcribe';
import { HttpError, json, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export const POST = route(async (req) => {
  const user = await requireUser(req);
  rateLimit(`transcribe:${user.id}`, 90, 60_000);
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(422, 'No recording');
  if (file.size < 200) throw new HttpError(422, 'No words were heard. Tap Speak and try again.', 'empty');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'That recording is too long.');
  const language = String(form.get('language') || 'en').slice(0, 8);
  const topic = String(form.get('topic') || '').slice(0, 300);
  return json({ text: await transcribeSpeech(user, file, language, topic) });
});
