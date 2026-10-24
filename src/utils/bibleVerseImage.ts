// Renders a selected verse (quote + citation) onto a shareable portrait
// image card. Two looks: the original solid navy/gold gradient card (no
// `background` option given — e.g. any caller that doesn't need a picker),
// and a photo-background card (VerseImageComposer) styled like the photo
// hero cards elsewhere on this page — a real photo, a dark wash for
// legibility, and the verse in the reader's own chosen font. Pure client-
// side canvas — no server round-trip, no dependency on any image library.
const WIDTH = 1080;
const HEIGHT = 1350;
const NAVY = "#241C3D";
const GOLD = "#d4af37";
const GOLD_GLOW = "#e4c765";
const CREAM = "#f5f1e9";

export type VerseImageOverlay = "light" | "medium" | "dark";

// How much of the photo gets darkened behind the text — "medium" matches
// the wash already used on the Books/hero photo cards elsewhere on this
// page, "light" leans on the photo more, "dark" favors legibility over
// seeing the photo.
const OVERLAY_ALPHA: Record<VerseImageOverlay, [number, number]> = {
  light: [0.1, 0.45],
  medium: [0.15, 0.68],
  dark: [0.25, 0.88],
};

export interface VerseImageOptions {
  // A photo URL (e.g. one of HERO_IMAGES) for a photo card, or omitted/
  // null for the original solid gradient card.
  background?: string | null;
  overlay?: VerseImageOverlay;
  // A CSS font-family stack, e.g. `"Merriweather", serif` — only meaningful
  // for English text; Amharic always renders in Noto Serif Ethiopic
  // regardless, since none of the picked Latin webfonts cover Ethiopic
  // glyphs.
  fontStack?: string;
}

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
  maxHeight: number,
  fontStack: string
): { fontSize: number; lines: string[]; lineHeight: number } {
  for (let fontSize = 72; fontSize >= 30; fontSize -= 2) {
    ctx.font = `italic 500 ${fontSize}px ${fontStack}`;
    const lineHeight = fontSize * 1.42;
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length * lineHeight <= maxHeight) {
      return { fontSize, lines, lineHeight };
    }
  }
  ctx.font = `italic 500 30px ${fontStack}`;
  return { fontSize: 30, lines: wrapLines(ctx, text, maxWidth), lineHeight: 30 * 1.42 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Classic "object-fit: cover" for canvas — crops whichever axis overflows
// so the photo fills the box with no letterboxing, same as every other
// photo card on this page.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function renderGradientCard(text: string, citation: string, fontStack: string): HTMLCanvasElement {
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
  ctx.font = `700 140px ${fontStack}`;
  ctx.fillText("“", WIDTH / 2, 300);

  const maxTextWidth = WIDTH - 220;
  const maxTextHeight = HEIGHT - 620;
  const { lines, lineHeight } = fitText(ctx, text, maxTextWidth, maxTextHeight, fontStack);

  ctx.fillStyle = CREAM;
  const blockHeight = lines.length * lineHeight;
  let y = HEIGHT / 2 - blockHeight / 2 + lineHeight * 0.35;
  for (const line of lines) {
    ctx.fillText(line, WIDTH / 2, y);
    y += lineHeight;
  }

  // Citation.
  ctx.fillStyle = GOLD;
  ctx.font = `600 34px ${fontStack}`;
  ctx.fillText(citation, WIDTH / 2, HEIGHT - 190);

  // Small divider + wordmark.
  ctx.strokeStyle = "rgba(212,175,55,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 40, HEIGHT - 150);
  ctx.lineTo(WIDTH / 2 + 40, HEIGHT - 150);
  ctx.stroke();

  ctx.fillStyle = "rgba(245,241,233,0.55)";
  ctx.font = `600 26px ${fontStack}`;
  ctx.fillText("MEZMUR", WIDTH / 2, HEIGHT - 105);

  return canvas;
}

async function renderPhotoCard(
  text: string,
  citation: string,
  photoSrc: string,
  overlay: VerseImageOverlay,
  fontStack: string
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const img = await loadImage(photoSrc);
  drawCover(ctx, img, WIDTH, HEIGHT);

  // Dark wash, heavier toward the bottom where the text sits — same
  // top-light/bottom-dark shape as the Books/hero photo cards, just
  // tuned per the chosen overlay strength.
  const [topAlpha, bottomAlpha] = OVERLAY_ALPHA[overlay];
  const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  wash.addColorStop(0, `rgba(0,0,0,${topAlpha})`);
  wash.addColorStop(0.55, `rgba(0,0,0,${(topAlpha + bottomAlpha) / 2})`);
  wash.addColorStop(1, `rgba(0,0,0,${bottomAlpha})`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 18;

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `700 140px ${fontStack}`;
  ctx.fillText("“", WIDTH / 2, 300);

  const maxTextWidth = WIDTH - 220;
  const maxTextHeight = HEIGHT - 620;
  const { lines, lineHeight } = fitText(ctx, text, maxTextWidth, maxTextHeight, fontStack);

  ctx.fillStyle = "#ffffff";
  const blockHeight = lines.length * lineHeight;
  let y = HEIGHT / 2 - blockHeight / 2 + lineHeight * 0.35;
  for (const line of lines) {
    ctx.fillText(line, WIDTH / 2, y);
    y += lineHeight;
  }

  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `600 34px ${fontStack}`;
  ctx.fillText(citation, WIDTH / 2, HEIGHT - 190);

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 40, HEIGHT - 150);
  ctx.lineTo(WIDTH / 2 + 40, HEIGHT - 150);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `600 26px ${fontStack}`;
  ctx.fillText("MEZMUR", WIDTH / 2, HEIGHT - 105);
  ctx.shadowBlur = 0;

  return canvas;
}

export async function renderVerseCard(
  text: string,
  citation: string,
  options: VerseImageOptions = {}
): Promise<HTMLCanvasElement> {
  const fontStack = options.fontStack ?? `Georgia, "Noto Serif Ethiopic", serif`;
  if (options.background) {
    return renderPhotoCard(text, citation, options.background, options.overlay ?? "medium", fontStack);
  }
  return renderGradientCard(text, citation, fontStack);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// Shares the canvas as an image file where the OS share sheet supports
// files (iOS/Android via Web Share API Level 2), falling back to a plain
// download when it doesn't.
export async function shareCanvasAsImage(canvas: HTMLCanvasElement, fileBaseName: string, title: string): Promise<void> {
  const blob = await canvasToBlob(canvas);
  if (!blob) return;

  const fileName = `${fileBaseName.replace(/[^\w]+/g, "-").toLowerCase()}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: title });
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

// Original one-call path (gradient card, no picker) — kept for any caller
// that just wants the default card shared immediately.
export async function shareVerseAsImage(text: string, citation: string): Promise<void> {
  const canvas = await renderVerseCard(text, citation);
  await shareCanvasAsImage(canvas, citation, citation);
}
