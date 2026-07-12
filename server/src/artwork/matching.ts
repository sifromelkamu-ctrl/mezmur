// Fuzzy title/artist matching for artwork candidates — deliberately not
// exact-string matching, since the same release routinely has slightly
// different text between a YouTube channel's own labeling and what a music
// service calls it (punctuation, "feat." placement, transliteration of
// Amharic names into Latin script with a different spelling convention,
// parenthetical "(Official Audio)"/"(Remastered)" suffixes, etc).

// Strips the kind of trailing noise that shows up in YouTube-derived titles
// but never in a real service's catalog metadata, so comparisons aren't
// penalized for it.
const NOISE_RE =
  /[([]?\s*(official\s*(video|audio|music\s*video)?|lyric(s)?\s*video|remaster(ed)?(\s*\d{4})?|full\s*album|audio)\s*[)\]]?/gi;

// Normalizes for comparison: Unicode NFC (so visually-identical Amharic
// characters built from different combining sequences compare equal),
// lowercased, diacritics stripped (café vs cafe, é vs e), noise phrases
// removed, punctuation collapsed to spaces, whitespace collapsed.
export function normalizeForMatch(input: string): string {
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(NOISE_RE, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks (Latin accents only — safe no-op on Amharic)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

// 0 (no relation) .. 1 (identical after normalization). Blends edit-distance
// similarity (catches typos/minor spelling variants) with token-overlap
// (catches reordered words and titles where one side has extra words, e.g.
// "Album Name" vs "Album Name (Deluxe Edition)").
export function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const maxLen = Math.max(na.length, nb.length);
  const editSim = 1 - levenshtein(na, nb) / maxLen;

  const tokensA = new Set(na.split(" ").filter(Boolean));
  const tokensB = new Set(nb.split(" ").filter(Boolean));
  const shared = [...tokensA].filter((t) => tokensB.has(t)).length;
  const tokenSim = shared / Math.max(tokensA.size, tokensB.size, 1);

  return editSim * 0.5 + tokenSim * 0.5;
}
