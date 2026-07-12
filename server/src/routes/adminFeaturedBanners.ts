import { Router } from "express";
import { z } from "zod";
import { isAdmin, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { uploadImageToStorage, upload } from "../upload.js";
import { FEATURED_BANNER_ENTITY_TYPES, resolveFeaturedEntity, type ResolvedFeaturedEntity } from "../featuredBanners.js";
import type { FeaturedBanner } from "../generated/prisma/client.js";

// Admin-only management of the Home hero carousel's Featured Banner
// collection — see src/featuredBanners.ts for the entity-resolution
// contract this shares with the public-facing route.
const router = Router();
router.use(isAdmin);

function toAdminBannerDTO(banner: FeaturedBanner, entity: ResolvedFeaturedEntity | null) {
  return {
    id: banner.id,
    entityType: banner.entityType,
    entityId: banner.entityId,
    title: banner.title ?? undefined,
    subtitle: banner.subtitle ?? undefined,
    badgeText: banner.badgeText ?? undefined,
    buttonText: banner.buttonText ?? undefined,
    bannerImageUrl: banner.bannerImageUrl ?? undefined,
    displayOrder: banner.displayOrder,
    enabled: banner.enabled,
    // What will actually render right now, with overrides applied — lets
    // the admin UI show real title/artwork even for fields left blank.
    resolvedTitle: banner.title || entity?.title || "(deleted item)",
    resolvedSubtitle: banner.subtitle || entity?.subtitle || "",
    resolvedImageUrl: banner.bannerImageUrl || entity?.coverUrl,
    gradient: entity?.gradient ?? (["#333333", "#111111"] as [string, string]),
    // True when the referenced album/etc. no longer exists — the admin can
    // still see and remove a dangling banner even though it won't render.
    entityMissing: entity === null,
  };
}

// GET / - every banner (including disabled), in display order, for the
// admin's Home Featured Banner settings page.
router.get("/", async (_req, res) => {
  const banners = await prisma.featuredBanner.findMany({ orderBy: { displayOrder: "asc" } });
  const dtos = await Promise.all(
    banners.map(async (banner) => toAdminBannerDTO(banner, await resolveFeaturedEntity(banner.entityType, banner.entityId)))
  );
  res.json(dtos);
});

const createSchema = z.object({
  entityType: z.enum(FEATURED_BANNER_ENTITY_TYPES as [string, ...string[]]).default("album"),
  entityId: z.string().min(1),
});

// POST / - feature an existing album (etc.) by referencing its id. Never
// creates or modifies the entity itself.
router.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const entityType = parsed.data.entityType as FeaturedBanner["entityType"];
  const entity = await resolveFeaturedEntity(entityType, parsed.data.entityId);
  if (!entity) {
    res.status(404).json({ error: "Referenced item not found, or that type isn't supported yet" });
    return;
  }
  const max = await prisma.featuredBanner.aggregate({ _max: { displayOrder: true } });
  const banner = await prisma.featuredBanner.create({
    data: {
      entityType,
      entityId: parsed.data.entityId,
      displayOrder: (max._max.displayOrder ?? -1) + 1,
    },
  });
  res.status(201).json(toAdminBannerDTO(banner, entity));
});

const updateSchema = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(120).nullable().optional(),
  badgeText: z.string().trim().max(40).nullable().optional(),
  buttonText: z.string().trim().max(40).nullable().optional(),
  enabled: z.boolean().optional(),
});

// PATCH /:id - edit title/subtitle/badge/button overrides and enabled state.
// An empty string clears the override back to "use the entity's own value".
router.patch("/:id", async (req: AuthedRequest, res) => {
  const banner = await prisma.featuredBanner.findUnique({ where: { id: String(req.params.id) } });
  if (!banner) {
    res.status(404).json({ error: "Banner not found" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { title, subtitle, badgeText, buttonText, enabled } = parsed.data;
  const updated = await prisma.featuredBanner.update({
    where: { id: banner.id },
    data: {
      ...(title !== undefined ? { title: title || null } : {}),
      ...(subtitle !== undefined ? { subtitle: subtitle || null } : {}),
      ...(badgeText !== undefined ? { badgeText: badgeText || null } : {}),
      ...(buttonText !== undefined ? { buttonText: buttonText || null } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    },
  });
  const entity = await resolveFeaturedEntity(updated.entityType, updated.entityId);
  res.json(toAdminBannerDTO(updated, entity));
});

// PATCH /:id/image - upload a custom banner image, entirely independent of
// the entity's own artwork (e.g. Album.coverUrl is never touched).
router.patch("/:id/image", upload.single("image"), async (req: AuthedRequest, res) => {
  const banner = await prisma.featuredBanner.findUnique({ where: { id: String(req.params.id) } });
  if (!banner) {
    res.status(404).json({ error: "Banner not found" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No image uploaded" });
    return;
  }
  const bannerImageUrl = await uploadImageToStorage(req.file.buffer, req.file.mimetype);
  const updated = await prisma.featuredBanner.update({ where: { id: banner.id }, data: { bannerImageUrl } });
  const entity = await resolveFeaturedEntity(updated.entityType, updated.entityId);
  res.json(toAdminBannerDTO(updated, entity));
});

// DELETE /:id/image - drop the custom banner image; the entity's own cover
// becomes the fallback again.
router.delete("/:id/image", async (req: AuthedRequest, res) => {
  const banner = await prisma.featuredBanner.findUnique({ where: { id: String(req.params.id) } });
  if (!banner) {
    res.status(404).json({ error: "Banner not found" });
    return;
  }
  const updated = await prisma.featuredBanner.update({ where: { id: banner.id }, data: { bannerImageUrl: null } });
  const entity = await resolveFeaturedEntity(updated.entityType, updated.entityId);
  res.json(toAdminBannerDTO(updated, entity));
});

const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });

// POST /reorder - drag-and-drop reordering: sets displayOrder sequentially
// from the given id order.
router.post("/reorder", async (req: AuthedRequest, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const banners = await prisma.featuredBanner.findMany({ where: { id: { in: parsed.data.ids } } });
  if (banners.length !== parsed.data.ids.length) {
    res.status(400).json({ error: "One or more banners not found" });
    return;
  }
  await prisma.$transaction(
    parsed.data.ids.map((id, index) => prisma.featuredBanner.update({ where: { id }, data: { displayOrder: index } }))
  );
  res.status(204).end();
});

// DELETE /:id - un-feature it. Only removes the banner row; the referenced
// album (etc.) is completely untouched.
router.delete("/:id", async (req: AuthedRequest, res) => {
  const banner = await prisma.featuredBanner.findUnique({ where: { id: String(req.params.id) } });
  if (!banner) {
    res.status(404).json({ error: "Banner not found" });
    return;
  }
  await prisma.featuredBanner.delete({ where: { id: banner.id } });
  res.status(204).end();
});

export default router;
