import { z } from 'zod';
import type { AnalyzeResponse, MatchRecommendation } from '@conversa/shared';
import { requireUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { loadPersona } from '@/lib/ai/persona';
import { analyzeProfiles, hardFilter } from '@/lib/ai/tasks';
import { db } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';
import { PLAN_LIMITS } from '@/lib/plans';
import { assertCapability } from '@/lib/platform';
import { zProfileInput } from '@/lib/validation';

const Body = z.object({ platform: z.string(), profiles: z.array(zProfileInput).min(1).max(12) });

/**
 * Screens the profiles currently shown on an authorised site.
 * Privacy: profiles are processed in memory. Only RECOMMENDED profiles are
 * written to the shortlist (with a minimal summary); everything about rejected
 * profiles — including photos — is dropped when this request ends. The response
 * reports only a count of rejected profiles.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);
  assertCapability(body.platform, 'discovery');

  const prefsRow = await db.matchPreferences.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const { persona } = await loadPersona(user.id);

  const existing = await db.contact.findMany({
    where: { userId: user.id, platform: body.platform, externalId: { in: body.profiles.map((p) => p.externalId) } },
    select: { externalId: true },
  });
  const known = new Set(existing.map((e) => e.externalId));
  const eligible = body.profiles.filter((p) => !known.has(p.externalId) && hardFilter(p, prefsRow).ok);

  let recommendations: MatchRecommendation[] = [];
  if (eligible.length) {
    const withPhotos = prefsRow.analyzePhotos && (PLAN_LIMITS[user.plan].photoAnalysis || user.role === 'ADMIN');
    const { results } = await analyzeProfiles({ user, persona, prefs: prefsRow, profiles: eligible, withPhotos });
    const byId = new Map(eligible.map((p) => [p.externalId, p]));
    const accepted = results.filter((r) => r.recommended && r.score >= 60 && byId.has(r.externalId));

    for (const r of accepted) {
      const p = byId.get(r.externalId)!;
      const summary = [
        p.bio ? `Bio: ${p.bio.slice(0, 1200)}` : '',
        p.interests?.length ? `Interests: ${p.interests.join(', ')}` : '',
        p.lookingFor ? `Looking for: ${p.lookingFor}` : '',
        r.photoObservations.length ? `Photo context: ${r.photoObservations.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const reasons = { reasons: r.reasons, cautions: r.cautions, photoObservations: r.photoObservations };
      const row = await db.matchCandidate.upsert({
        where: { userId_platform_externalId: { userId: user.id, platform: body.platform, externalId: p.externalId } },
        update: { score: Math.round(r.score), reasons, summary: encrypt(summary) },
        create: {
          userId: user.id,
          platform: body.platform,
          externalId: p.externalId,
          name: p.name,
          age: p.age ?? null,
          location: p.location ?? null,
          summary: encrypt(summary),
          score: Math.round(r.score),
          reasons,
        },
      });
      recommendations.push({
        id: row.id,
        externalId: row.externalId,
        name: row.name,
        age: row.age,
        location: row.location,
        score: row.score,
        ...reasons,
        status: row.status,
        contactId: row.contactId,
      });
    }
    recommendations = recommendations.sort((a, b) => b.score - a.score);
  }

  // A previously shortlisted profile that no longer qualifies is discarded too.
  const keep = new Set(recommendations.map((r) => r.externalId));
  await db.matchCandidate.deleteMany({
    where: {
      userId: user.id,
      platform: body.platform,
      status: 'SHORTLISTED',
      externalId: { in: body.profiles.map((p) => p.externalId).filter((id) => !keep.has(id) && !known.has(id)) },
    },
  });

  const response: AnalyzeResponse = {
    recommendations,
    rejectedCount: body.profiles.length - recommendations.length,
    analyzedCount: body.profiles.length,
  };
  return json(response);
});
