import { Fragment, type ReactNode } from "react";

// Ethiopic + Ethiopic Supplement + Ethiopic Extended/Extended-A (Unicode
// blocks, via \u escapes rather than literal glyphs to keep the exact
// boundaries unambiguous) — covers Amharic (and Tigrigna/Ge'ez) script used
// throughout the catalog's titles.
const ETHIOPIC_RUN = new RegExp("[\\u1200-\\u137F\\u1380-\\u139F\\u2D80-\\u2DDF\\uAB00-\\uAB2F]+", "g");

// Splits mixed Amharic/Latin text (e.g. "Yidnekachew Teka · ኢየሱስ") into runs
// and shrinks only the Latin runs — Abyssinica SIL (the font --font-sans
// falls back to for Ethiopic glyphs) renders noticeably larger than Inter at
// the same declared font-size, so scaling the Latin side down instead of
// pushing Amharic down further keeps mixed-script lines visually even
// without ever making the Amharic side harder to read.
export function renderWithAmharicStyle(text: string): ReactNode[] {
  const parts: { text: string; amharic: boolean }[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(ETHIOPIC_RUN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ text: text.slice(lastIndex, index), amharic: false });
    parts.push({ text: match[0], amharic: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), amharic: false });

  return parts.map((part, i) =>
    part.amharic ? (
      <Fragment key={i}>{part.text}</Fragment>
    ) : (
      <span key={i} className="text-[0.85em]">
        {part.text}
      </span>
    )
  );
}
