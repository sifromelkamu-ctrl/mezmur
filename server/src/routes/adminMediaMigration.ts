import { Router, type Response } from "express";
import { z } from "zod";
import { isAdmin, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { r2Configured, setPublicBucketCors } from "../storage/r2.js";
import {
  assertCanStartBatch,
  discoverPendingMedia,
  getMigrationSummary,
  resetFailedJobs,
  runMigrationBatch,
} from "../storage/migration.js";

const router = Router();

// Settings > Admin > Media Migration. Everything here is admin-only and
// none of it ever touches a Supabase original destructively — see
// storage/migration.ts's own comments for the full safety reasoning.
router.use(isAdmin);

// GET /api/admin/media-migration/status — counts by status + whether a
// batch is running right now. Poll this from the dashboard; cheap enough
// (one groupBy query) to hit every couple seconds while a batch runs.
router.get("/status", async (_req: AuthedRequest, res) => {
  res.json({ r2Configured, ...(await getMigrationSummary()) });
});

// POST /api/admin/media-migration/discover — "dry run": scans the database
// for media still on Supabase and records one MediaMigrationJob per file.
// Touches zero actual files. Safe to call repeatedly (re-running after new
// content was imported only adds jobs for the new stuff — see the function's
// own comment for why nothing already tracked is disturbed).
router.post("/discover", async (_req: AuthedRequest, res) => {
  const result = await discoverPendingMedia();
  res.json(result);
});

const runSchema = z.object({ batchSize: z.number().int().min(1).max(500).optional() });

// Shared by /run and /test below — validates fast (awaited, so a real error
// like "already running" or "test gate not satisfied" actually reaches the
// admin instead of only ever landing in server logs), then fires the actual
// (possibly minutes-long) transfer loop without awaiting it.
async function startBatch(res: Response, batchSize: number) {
  try {
    await assertCanStartBatch(batchSize);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : "Could not start" });
    return;
  }
  runMigrationBatch(batchSize).catch((err) => {
    console.error("[media-migration] batch failed:", err);
  });
  res.status(202).json({ started: true, batchSize });
}

// POST /api/admin/media-migration/test — the small-test-migration step
// (requirement F): always exactly 1 file, regardless of what batchSize the
// client might otherwise send. This is what's meant to satisfy the
// small-test-first gate below — deliberately its own endpoint rather than
// just "call /run with batchSize: 1", so the dashboard can offer one
// unambiguous "run the test" action instead of the admin having to
// remember the right number.
router.post("/test", async (_req: AuthedRequest, res) => {
  await startBatch(res, 1);
});

// POST /api/admin/media-migration/run — starts one batch and returns
// immediately; the batch itself keeps running on this server regardless of
// whether the admin's browser stays open (see storage/migration.ts). Poll
// /status for progress. Refuses a batch above a small threshold until at
// least one job has ever reached "verified" (i.e. until /test has actually
// succeeded once) — see assertCanStartBatch.
router.post("/run", async (req: AuthedRequest, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const batchSize = parsed.data.batchSize ?? (Number(process.env.MEDIA_MIGRATION_BATCH_SIZE) || 50);
  await startBatch(res, batchSize);
});

// TEMP: one-time fix for R2 buckets having no CORS policy by default
// (Supabase's public buckets always allowed cross-origin GETs; R2 doesn't
// unless configured), which broke the client's crossOrigin="anonymous"
// canvas reads (smart-crop analysis, ArtworkEditor natural-dimension probe)
// for every R2-hosted image. Remove this route once it's been called.
router.post("/fix-cors", async (_req: AuthedRequest, res) => {
  await setPublicBucketCors();
  res.json({ ok: true });
});

// POST /api/admin/media-migration/retry-failed — resets every failed job
// back to pending; the next /run picks them up like any other pending job.
router.post("/retry-failed", async (_req: AuthedRequest, res) => {
  res.json(await resetFailedJobs());
});

// GET /api/admin/media-migration/jobs — the actual per-file list (mainly for
// seeing which specific files failed and why). ?status= filters, defaults to
// everything, newest first, capped at 200 per page since a full catalog
// migration can be thousands of rows.
router.get("/jobs", async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 200;
  const where = status ? { status: status as never } : {};
  const [jobs, total] = await Promise.all([
    prisma.mediaMigrationJob.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mediaMigrationJob.count({ where }),
  ]);
  res.json({ jobs, total, page, pageSize });
});

export default router;
