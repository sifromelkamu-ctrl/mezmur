import { prisma } from "./prisma.js";
import type { FeaturedBannerEntityType } from "./generated/prisma/enums.js";

export const FEATURED_BANNER_ENTITY_TYPES: FeaturedBannerEntityType[] = [
  "album",
  "single",
  "artist",
  "playlist",
  "concert",
];

export interface ResolvedFeaturedEntity {
  title: string;
  subtitle: string;
  coverUrl?: string;
  gradient: [string, string];
}

// The one place that knows how to turn a FeaturedBanner's (entityType,
// entityId) pair into displayable fields. Only "album" is implemented today
// — adding single/artist/playlist/concert support later means adding a case
// here, nothing else in the Featured Banner system (schema, routes, admin
// UI list/reorder/enable) needs to change.
export async function resolveFeaturedEntity(
  entityType: FeaturedBannerEntityType,
  entityId: string
): Promise<ResolvedFeaturedEntity | null> {
  switch (entityType) {
    case "album": {
      const album = await prisma.album.findUnique({ where: { id: entityId }, include: { artist: true } });
      if (!album) return null;
      return {
        title: album.title,
        subtitle: album.artist.name,
        coverUrl: album.coverUrl ?? undefined,
        gradient: [album.gradientFrom ?? "#333333", album.gradientTo ?? "#111111"],
      };
    }
    // Future: single / artist / playlist / concert resolution.
    case "single":
    case "artist":
    case "playlist":
    case "concert":
      return null;
  }
}
