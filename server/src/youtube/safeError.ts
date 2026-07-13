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
];

export function isInternalErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  return !trimmed || INTERNAL_ERROR_SIGNATURES.some((re) => re.test(trimmed));
}

export const GENERIC_IMPORT_ERROR = "The import service is temporarily unavailable. Please try again in a few minutes.";

// Converts any thrown value into a message safe to store on a job row or
// send in an API response — the real error is always logged server-side
// first (via console.error, picked up by the Render logs) so it's still
// fully diagnosable, it just never reaches the client raw. Domain errors
// this app throws itself (validation messages, DuplicateImportError, a
// sanitized YtDlpError) already read as plain human sentences and pass
// through unchanged; only OS/runtime-shaped messages get replaced.
export function toSafeErrorMessage(err: unknown, fallback: string, context: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (isInternalErrorMessage(raw)) {
    console.error(`[${context}] internal error:`, err);
    return fallback;
  }
  return raw;
}
