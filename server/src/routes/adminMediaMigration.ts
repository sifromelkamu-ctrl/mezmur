import { Router } from "express";
import { z } from "zod";
import { isAdmin, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { r2Configured } from "../storage/r2.js";
import {
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

// POST /api/admin/media-migration/run — starts one batch and returns
// immediately; the batch itself keeps running on this server regardless of
// whether the admin's browser stays open (see storage/migration.ts). Poll
// /status for progress. Refuses to start a second batch on top of one
// already running (runMigrationBatch throws; caught here as a 409) rather
// than letting two batches race each other over the same pending jobs.
router.post("/run", async (req: AuthedRequest, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  if (!r2Configured) {
    res.status(400).json({ error: "R2 is not configured yet — see the required R2_* environment variables" });
    return;
  }
  const batchSize = parsed.data.batchSize ?? (Number(process.env.MEDIA_MIGRATION_BATCH_SIZE) || 50);

  runMigrationBatch(batchSize).catch((err) => {
    console.error("[media-migration] batch failed to start:", err);
  });

  res.status(202).json({ started: true, batchSize });
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
