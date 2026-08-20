// Signatures of internal/environment failures — a missing interpreter, a
// missing binary, filesystem/OS errors, stack traces, Prisma error codes —
// that must never reach an API response or a job's stored error message
// verbatim. They'd expose server file paths/toolchain details and, worse,
// aren't remotely actionable for whoever's looking at the import screen.
// Anything NOT matching one of these is left untouched: it's either a
// genuine yt-dlp content error ("Video unavailable", a copyright claim, a
// geo-block, ...) or one of this app's own deliberately-worded validation
// errors (e.g. "Live streams can't be imported") — both are actionable and
// meant to reach the admin as-is.
const INTERNAL_ERROR_SIGNATURES = [
  /no such file or directory/i,
  /command not found/i,
  /permission denied/i,
  /\bENOENT\b/,
  /\bEACCES\b/,
  /\bEPIPE\b/,
  /\bECONNREFUSED\b/,
  /\/usr\/bin\/env/i,
  /^P\d{4}:/, // Prisma error codes, e.g. "P1001: Can't reach database server"
  /\bat\s+\S+\s+\(.*:\d+:\d+\)/, // a stack-trace line that leaked into a message
  /Traceback \(most recent call last\)/, // an uncaught Python traceback (yt-dlp itself crashed)
];

export function isInternalErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  return !trimmed || INTERNAL_ERROR_SIGNATURES.some((re) => re.test(trimmed));
}

// yt-dlp is a Python program — when it hits a video/playlist entry whose
// metadata it can't decode as UTF-8, it can crash with an uncaught
// UnicodeDecodeError and the last line of that traceback (Python's own
// "'utf-8' codec can't decode byte 0xXX in position N: invalid start byte"
// wording) ends up as the caught error's message. That's not remotely
// meaningful to an admin looking at the import screen, so it gets its own
// specific, honest message rather than falling into the generic
// "service unavailable" bucket below — the service isn't down, one video's
// metadata just couldn't be read.
const ENCODING_ERROR_SIGNATURES = [/UnicodeDecodeError/, /UnicodeEncodeError/, /'[\w.-]+' codec can't (?:decode|encode)/i];

export const METADATA_ENCODING_ERROR = "This video's metadata contains characters that couldn't be read, so it was skipped.";

export function isEncodingErrorMessage(message: string): boolean {
  return ENCODING_ERROR_SIGNATURES.some((re) => re.test(message));
}

export const GENERIC_IMPORT_ERROR = "The import service is temporarily unavailable. Please try again in a few minutes.";

// Thrown when an admin manually cancels a single item (the catalog import
// screen's per-item X button) while it's queued or actively
// downloading/processing. Lives here (not pipeline.ts, which already has
// DuplicateImportError) so ytdlp.ts can throw it directly on an aborted
// spawn without an import cycle back into pipeline.ts.
export class CancelledImportError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledImportError";
  }
}

// Converts any thrown value into a message safe to store on a job row or
// send in an API response — the real error is always logged server-side
// first (via console.error, picked up by the Render logs) so it's still
// fully diagnosable, it just never reaches the client raw. Domain errors
// this app throws itself (validation messages, DuplicateImportError, a
// sanitized YtDlpError) already read as plain human sentences and pass
// through unchanged; only OS/runtime-shaped messages get replaced.
export function toSafeErrorMessage(err: unknown, fallback: string, context: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (isEncodingErrorMessage(raw)) {
    console.error(`[${context}] metadata encoding error:`, err);
    return METADATA_ENCODING_ERROR;
  }
  if (isInternalErrorMessage(raw)) {
    console.error(`[${context}] internal error:`, err);
    return fallback;
  }
  return raw;
}
