import { randomUUID } from "node:crypto";
import { toTrackDTO } from "../routes/artists.js";
import { DuplicateImportError, importYoutubeVideo } from "./pipeline.js";
import { toSafeErrorMessage } from "./safeError.js";

type ImportJobStatus = "pending" | "downloading" | "processing" | "uploading" | "saving" | "done" | "error";

export interface ImportJob {
  id: string;
  status: ImportJobStatus;
  progress: number;
  message: string;
  error?: string;
  track?: ReturnType<typeof toTrackDTO>;
  createdAt: number;
}

export interface StartImportParams {
  url: string;
  adminId: string;
  albumId?: string;
  genre?: string;
  isSingle?: boolean;
  // "Edit Metadata" step overrides (Single destination only) — see
  // ImportVideoParams in pipeline.ts for what each one does.
  titleOverride?: string;
  targetArtistId?: string;
  artistNameOverride?: string;
  createArtist?: boolean;
}

const jobs = new Map<string, ImportJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

// Sweeps finished jobs older than JOB_TTL_MS so the in-memory map can't grow
// without bound across a long-running server process.
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if ((job.status === "done" || job.status === "error") && job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000).unref();

export function getImportJob(jobId: string): ImportJob | undefined {
  return jobs.get(jobId);
}

function update(jobId: string, patch: Partial<ImportJob>) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch);
}

export function startYoutubeImport(params: StartImportParams): string {
  const jobId = randomUUID();
  jobs.set(jobId, {
    id: jobId,
    status: "pending",
    progress: 0,
    message: "Fetching video info…",
    createdAt: Date.now(),
  });

  importYoutubeVideo({
    ...params,
    onProgress: (status, progress, message) => update(jobId, { status: status as ImportJobStatus, progress, message }),
  })
    .then(({ dto }) => update(jobId, { status: "done", progress: 100, message: "Done", track: dto }))
    .catch((err) => {
      const message =
        err instanceof DuplicateImportError ? err.message : toSafeErrorMessage(err, "Import failed", "youtube-import");
      update(jobId, { status: "error", progress: 0, message: "Failed", error: message });
    });

  return jobId;
}
