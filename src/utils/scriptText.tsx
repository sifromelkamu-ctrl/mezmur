import { Fragment, type ReactNode } from "react";

// Ethiopic + Ethiopic Supplement + Ethiopic Extended/Extended-A (Unicode
// blocks, via \u escapes rather than literal glyphs to keep the exact
// boundaries unambiguous) — covers Amharic (and Tigrigna/Ge'ez) script used
// throughout the catalog's titles.
const ETHIOPIC_RUN = new RegExp("[\\u1200-\\u137F\\u1380-\\u139F\\u2D80-\\u2DDF\\uAB00-\\uAB2F]+", "g");

// Splits mixed Amharic/Latin text (e.g. "Yidnekachew Teka · ኢየሱስ") into runs
// and wraps only the Amharic runs in `amharicClassName` — Abyssinica SIL
// renders noticeably larger than Inter at the same font-size, so pairing an
// explicit font with a slightly smaller size keeps mixed-script lines (very
// common here: artist names, "Title · Album") visually even instead of the
// Amharic half looming over the Latin half.
export function renderWithAmharicStyle(text: string, amharicClassName: string): ReactNode[] {
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
      <span key={i} className={amharicClassName}>
        {part.text}
      </span>
    ) : (
      <Fragment key={i}>{part.text}</Fragment>
    )
  );
}
