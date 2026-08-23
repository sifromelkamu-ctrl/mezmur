// Renders a selected verse (quote + citation) onto a shareable portrait
// image card, styled with the Bible section's own navy/gold palette (see
// Bible.tsx's --bible-navy) rather than inventing new colors. Pure client-
// side canvas — no server round-trip, no dependency on any image library.
const WIDTH = 1080;
const HEIGHT = 1350;
const NAVY = "#241C3D";
const GOLD = "#d4af37";
const GOLD_GLOW = "#e4c765";
const CREAM = "#f5f1e9";

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Picks the largest font size (within a sane range) whose wrapped line
// count still fits the card, so a short verse renders large and a long
// one shrinks to fit rather than overflowing or needing to scroll.
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number
): { fontSize: number; lines: string[]; lineHeight: number } {
  for (let fontSize = 72; fontSize >= 30; fontSize -= 2) {
    ctx.font = `italic 500 ${fontSize}px Georgia, "Noto Serif Ethiopic", serif`;
    const lineHeight = fontSize * 1.42;
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length * lineHeight <= maxHeight) {
      return { fontSize, lines, lineHeight };
    }
  }
  ctx.font = `italic 500 30px Georgia, "Noto Serif Ethiopic", serif`;
  return { fontSize: 30, lines: wrapLines(ctx, text, maxWidth), lineHeight: 30 * 1.42 };
}

function renderCard(text: string, citation: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#2f2552");
  bg.addColorStop(1, NAVY);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft gold radial glow, upper-left, echoing the app's own card lighting.
  const glow = ctx.createRadialGradient(WIDTH * 0.18, HEIGHT * 0.16, 0, WIDTH * 0.18, HEIGHT * 0.16, WIDTH * 0.7);
  glow.addColorStop(0, "rgba(228,199,101,0.16)");
  glow.addColorStop(1, "rgba(228,199,101,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Thin gold frame.
  ctx.strokeStyle = "rgba(212,175,55,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, WIDTH - 96, HEIGHT - 96);

  ctx.textAlign = "center";

  // Opening quotation mark.
  ctx.fillStyle = GOLD_GLOW;
  ctx.font = "700 140px Georgia, serif";
  ctx.fillText("“", WIDTH / 2, 300);

  const maxTextWidth = WIDTH - 220;
  const maxTextHeight = HEIGHT - 620;
  const { lines, lineHeight } = fitText(ctx, text, maxTextWidth, maxTextHeight);

  ctx.fillStyle = CREAM;
  const blockHeight = lines.length * lineHeight;
  let y = HEIGHT / 2 - blockHeight / 2 + lineHeight * 0.35;
  for (const line of lines) {
    ctx.fillText(line, WIDTH / 2, y);
    y += lineHeight;
  }

  // Citation.
  ctx.fillStyle = GOLD;
  ctx.font = "600 34px Georgia, serif";
  ctx.fillText(citation, WIDTH / 2, HEIGHT - 190);

  // Small divider + wordmark.
  ctx.strokeStyle = "rgba(212,175,55,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 40, HEIGHT - 150);
  ctx.lineTo(WIDTH / 2 + 40, HEIGHT - 150);
  ctx.stroke();

  ctx.fillStyle = "rgba(245,241,233,0.55)";
  ctx.font = "600 26px Georgia, serif";
  ctx.fillText("MEZMUR", WIDTH / 2, HEIGHT - 105);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// Renders the card, then shares it as an image file where the OS share
// sheet supports files (iOS/Android via Web Share API Level 2), falling
// back to a plain download when it doesn't.
export async function shareVerseAsImage(text: string, citation: string): Promise<void> {
  const canvas = renderCard(text, citation);
  const blob = await canvasToBlob(canvas);
  if (!blob) return;

  const fileName = `${citation.replace(/[^\w]+/g, "-").toLowerCase()}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: citation, text: citation });
      return;
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
