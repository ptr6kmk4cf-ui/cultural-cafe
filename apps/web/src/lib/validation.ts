import { z } from 'zod';
import { LANGUAGE_CODES, STYLE_VALUES } from '@conversa/shared';

export const zLang = z.enum(LANGUAGE_CODES);
export const zMode = z.enum(['SELECTED', 'AUTO', 'TRANSLATE']);
export const zStyle = z.enum(STYLE_VALUES);
export const zTagList = (max = 30, len = 60) =>
  z
    .array(z.string().trim().min(1).max(len))
    .max(max)
    .transform((a) => [...new Set(a)]);

export const zMemoryKind = z.enum(['INTEREST', 'FACT', 'TOPIC', 'QUESTION', 'COMMITMENT', 'PREFERENCE']);

export const zProfileInput = z.object({
  externalId: z.string().min(1).max(120),
  name: z.string().min(1).max(80),
  age: z.number().int().min(0).max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  distanceKm: z.number().min(0).max(40000).nullable().optional(),
  bio: z.string().max(4000).nullable().optional(),
  interests: z.array(z.string().max(60)).max(40).optional(),
  lookingFor: z.string().max(200).nullable().optional(),
  lifestyle: z.array(z.string().max(60)).max(30).optional(),
  statedAttributes: z.record(z.string().max(40), z.string().max(80)).optional(),
  language: z.string().max(5).nullable().optional(),
  photos: z.array(z.string().max(800_000)).max(3).optional(),
});

export const zThreadSnapshot = z.object({
  platform: z.string().min(1).max(60),
  externalId: z.string().min(1).max(120),
  contactName: z.string().min(1).max(80),
  profileExternalId: z.string().max(120).nullable().optional(),
  messages: z
    .array(
      z.object({
        externalId: z.string().min(1).max(120),
        direction: z.enum(['IN', 'OUT']),
        text: z.string().max(4000),
        sentAt: z.string().max(40).optional(),
        hasPhoto: z.boolean().optional(),
      }),
    )
    .max(300),
});
