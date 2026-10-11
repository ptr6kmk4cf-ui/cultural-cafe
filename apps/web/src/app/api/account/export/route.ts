import { requireUser } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { route } from '@/lib/http';
import { serializeContact, serializeMemory, serializeMessage } from '@/lib/services/contacts';
import { serializePhoto } from '@/lib/services/photos';

/** Full machine-readable export of everything stored about the user (GDPR art. 15/20). */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const u = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: {
      personality: true,
      language: true,
      preferences: true,
      autopilot: true,
      subscription: true,
      albums: true,
      photos: true,
      matches: true,
      contacts: { include: { messages: { orderBy: { sentAt: 'asc' } }, memories: true } },
      aiUsage: { orderBy: { createdAt: 'desc' }, take: 1000 },
      autopilotEvents: { orderBy: { createdAt: 'desc' }, take: 1000 },
      sessions: { select: { kind: true, label: true, createdAt: true, lastUsedAt: true, expiresAt: true } },
      worldProfile: true,
      worldBlocksMade: true,
      worldInvitesFrom: true,
      worldInvitesTo: true,
      worldConvA: { include: { messages: { orderBy: { createdAt: 'asc' } } } },
      worldConvB: { include: { messages: { orderBy: { createdAt: 'asc' } } } },
      worldReports: true,
    },
  });
  const data = {
    exportedAt: new Date().toISOString(),
    account: { id: u.id, email: u.email, name: u.name, birthDate: u.birthDate, plan: u.plan, role: u.role, createdAt: u.createdAt },
    personality: u.personality && { ...u.personality, aboutMe: decrypt(u.personality.aboutMe), boundaries: decrypt(u.personality.boundaries) },
    language: u.language,
    matchPreferences: u.preferences,
    autopilot: u.autopilot,
    subscription: u.subscription,
    albums: u.albums,
    photos: u.photos.map(serializePhoto),
    shortlist: u.matches.map((m) => ({ ...m, summary: decrypt(m.summary) })),
    contacts: u.contacts.map((c) => ({
      ...serializeContact(c),
      messages: c.messages.map(serializeMessage),
      memories: c.memories.map(serializeMemory),
    })),
    aiUsage: u.aiUsage,
    autopilotEvents: u.autopilotEvents,
    sessions: u.sessions,
    world: {
      profile: u.worldProfile && { ...u.worldProfile, bio: decrypt(u.worldProfile.bio) },
      blocks: u.worldBlocksMade,
      invites: [...u.worldInvitesFrom, ...u.worldInvitesTo],
      conversations: [...u.worldConvA, ...u.worldConvB].map((c) => ({
        id: c.id,
        status: c.status,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        messages: c.messages.map((m) => ({
          id: m.id,
          mine: m.senderId === u.id,
          text: decrypt(m.text),
          language: m.language,
          translation: decrypt(m.translation),
          createdAt: m.createdAt,
        })),
      })),
      reports: u.worldReports.map((r) => ({ ...r, detail: decrypt(r.detail) })),
    },
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="conversa-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
