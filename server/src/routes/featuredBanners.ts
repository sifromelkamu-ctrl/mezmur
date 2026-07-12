import { Router } from "express";
import { prisma } from "../prisma.js";
import { resolveFeaturedEntity } from "../featuredBanners.js";

const router = Router();

// GET / - public: only enabled banners, in display order, with every field
// already resolved (override applied, or fallen back to the entity's own
// title/artist/cover) so the Home hero carousel can render directly off
// this response with no further lookups. Never derives from "newest" or
// "recently imported" albums — only what an admin explicitly featured here.
router.get("/", async (_req, res) => {
  const banners = await prisma.featuredBanner.findMany({
    where: { enabled: true },
    orderBy: { displayOrder: "asc" },
  });

  const resolved = await Promise.all(
    banners.map(async (banner) => {
      const entity = await resolveFeaturedEntity(banner.entityType, banner.entityId);
      // The referenced item was deleted after being featured — skip it
      // silently rather than showing a broken slide.
      if (!entity) return null;
      return {
        id: banner.id,
        entityType: banner.entityType,
        entityId: banner.entityId,
        title: banner.title || entity.title,
        subtitle: banner.subtitle || entity.subtitle,
        badgeText: banner.badgeText || "Featured",
        buttonText: banner.buttonText || "Play Now",
        imageUrl: banner.bannerImageUrl || entity.coverUrl,
        gradient: entity.gradient,
      };
    })
  );

  res.json(resolved.filter((b) => b !== null));
});

export default router;
