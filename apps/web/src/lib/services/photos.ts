import type { Photo } from '@prisma/client';

export function serializePhoto(p: Photo) {
  return {
    id: p.id,
    albumId: p.albumId,
    url: `/api/photos/${p.id}/file`,
    mimeType: p.mimeType,
    width: p.width,
    height: p.height,
    sizeBytes: p.sizeBytes,
    caption: p.caption,
    tags: p.tags,
    category: p.category,
    aiApproved: p.aiApproved,
    createdAt: p.createdAt,
  };
}

export const PHOTO_CATEGORIES = ['GENERAL', 'TRAVEL', 'HOBBY', 'FOOD', 'PET', 'PORTRAIT', 'PRIVATE'] as const;
