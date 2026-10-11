import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { createContact, serializeContact } from '@/lib/services/contacts';
import { zLang, zMode, zStyle } from '@/lib/validation';

const ContactBody = z.object({
  name: z.string().trim().min(1).max(80),
  profileNotes: z.string().max(4000).optional(),
  objective: z.string().max(300).optional(),
  language: zLang.nullable().optional(),
  languageMode: zMode.nullable().optional(),
  style: zStyle.nullable().optional(),
});

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const status = req.nextUrl.searchParams.get('status') === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  const contacts = await db.contact.findMany({
    where: { userId: user.id, status },
    orderBy: { lastActivityAt: 'desc' },
    include: { _count: { select: { messages: true } } },
  });
  return json({ contacts: contacts.map(serializeContact) });
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, ContactBody);
  const contact = await createContact(user, { ...body, source: 'MANUAL' });
  return json({ contact: serializeContact(contact) }, 201);
});
