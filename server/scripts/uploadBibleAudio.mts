// One-off migration script: uploads the local Amharic chapter-audio mp3s
// (~2.8GB, 1173 files across 66 books) to a public Supabase Storage bucket
// so the app can stream them instead of bundling them as static assets.
// Run with: npx tsx scripts/uploadBibleAudio.mts
//
// Safe to re-run: it lists each book's already-uploaded chapters first and
// skips them, so an interrupted run can just be started again.
import "dotenv/config";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { supabaseAdmin } from "../src/supabase.js";

const BUCKET = "bible-audio";

// Slugs only, in canonical 66-book order — mirrors src/data/bibleBooks.ts on
// the frontend (kept as a plain local copy here since this script lives in a
// separate package and only needs the slug, not the full book metadata).
const BOOK_SLUGS = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges", "ruth", "1-samuel", "2-samuel",
  "1-kings", "2-kings", "1-chronicles", "2-chronicles", "ezra", "nehemiah", "esther", "job", "psalms", "proverbs",
  "ecclesiastes", "song-of-solomon", "isaiah", "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos",
  "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi",
  "matthew", "mark", "luke", "john", "acts", "romans", "1-corinthians", "2-corinthians", "galatians", "ephesians",
  "philippians", "colossians", "1-thessalonians", "2-thessalonians", "1-timothy", "2-timothy", "titus", "philemon", "hebrews", "james",
  "1-peter", "2-peter", "1-john", "2-john", "3-john", "jude", "revelation",
] as const;

const OLD_TESTAMENT_DIR = "/Users/melkamuasfaw/Desktop/OLD TESTEMENT";
const NEW_TESTAMENT_DIR = "/Users/melkamuasfaw/Desktop/NEW TESTEMENT";

// Local book folders are named "<NN>_<BookName>" (e.g. "09_1Samuel"),
// numbered 1-66 in canonical Bible order — the same order as BIBLE_BOOKS, so
// the numeric prefix is all that's needed to line a folder up with its slug.
function bookNumber(folderName: string): number {
  const match = /^(\d+)_/.exec(folderName);
  if (!match) throw new Error(`Unexpected folder name: ${folderName}`);
  return Number(match[1]);
}

// Every book except Psalms is named "<NN>_<BookName>_Ch_<CC>.mp3", one file
// per chapter, one-to-one with the app's own chapter numbering.
function chapterNumber(fileName: string): number {
  const match = /_[Cc]h_(\d+)\.mp3$/i.exec(fileName);
  if (!match) throw new Error(`Unexpected file name: ${fileName}`);
  return Number(match[1]);
}

// Psalms is the one book recorded against the Septuagint/Ge'ez chapter
// numbering instead of the Masoretic/standard numbering the app's Amharic
// text uses (verified against public/bible/psalms.json's own verse counts,
// e.g. standard ch.9 has 20 verses and ch.10 has 18 — not merged — so the
// app is on standard numbering). Most files are annotated "<lxx>(<standard>)"
// to say so explicitly; this maps every file to its real standard chapter.
function parsePsalmFile(fileName: string): { src: number; target: number } {
  const match = /_[Cc]h_(\d+)(?:\((\d+)\))?\.mp3$/i.exec(fileName);
  if (!match) throw new Error(`Unexpected Psalm file name: ${fileName}`);
  const src = Number(match[1]);
  let target = match[2] ? Number(match[2]) : src;
  // "146" is the one split point in this set left bare instead of annotated
  // "(147)" — per the standard LXX/Masoretic correspondence table, LXX 146
  // is really the first half of standard Psalm 147 (LXX 147, which stays
  // bare, is genuinely the second half — Masoretic numbers it 147 too).
  if (src === 146 && !match[2]) target = 147;
  return { src, target };
}

async function concatMp3(filePaths: string[]): Promise<Buffer> {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const listPath = path.join(tmpdir(), `bible-audio-concat-${tag}.txt`);
  const outPath = path.join(tmpdir(), `bible-audio-concat-${tag}.mp3`);
  const listContent = filePaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, listContent);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += String(d)));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });
  const buffer = await readFile(outPath);
  await Promise.all([unlink(listPath), unlink(outPath)]);
  return buffer;
}

async function ensureBucket() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  if (buckets.some((b) => b.name === BUCKET)) return;
  const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "50MB",
  });
  if (createError) throw new Error(`createBucket failed: ${createError.message}`);
  console.log(`Created public bucket "${BUCKET}"`);
}

const counts = { uploaded: 0, skipped: 0, failed: 0 };

async function processBook(slug: string, bookDir: string, files: string[]) {
  // Explicit limit: Supabase Storage's list() defaults to 100 items per
  // page, which silently truncated this for Psalms (150 chapters) — the
  // script then thought everything past the 100th was never uploaded and
  // tried to re-upload it, hitting "resource already exists" conflicts.
  const { data: existing } = await supabaseAdmin.storage.from(BUCKET).list(slug, { limit: 1000 });
  const already = new Set((existing ?? []).map((f) => f.name));

  // Groups source files by their real target chapter — for every book but
  // Psalms this is a trivial one-file-per-target grouping; for Psalms a
  // target can have two source files (a chapter the Ge'ez numbering splits
  // in two), which get concatenated in source order below.
  const targets = new Map<number, { src: number; file: string }[]>();
  for (const file of files) {
    const { src, target } = slug === "psalms" ? parsePsalmFile(file) : { src: chapterNumber(file), target: chapterNumber(file) };
    const list = targets.get(target) ?? [];
    list.push({ src, file });
    targets.set(target, list);
  }

  for (const [target, group] of targets) {
    const destName = `${target}.mp3`;
    if (already.has(destName)) {
      counts.skipped++;
      continue;
    }
    group.sort((a, b) => a.src - b.src);
    const paths = group.map((g) => path.join(bookDir, g.file));
    const buffer = group.length === 1 ? await readFile(paths[0]) : await concatMp3(paths);

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(`${slug}/${destName}`, buffer, { contentType: "audio/mpeg", upsert: false });
    if (error) {
      console.error(`FAILED ${slug}/${destName}: ${error.message}`);
      counts.failed++;
      continue;
    }
    counts.uploaded++;
    console.log(`Uploaded ${slug}/${destName} (${counts.uploaded} done, ${counts.skipped} skipped, ${counts.failed} failed)`);
  }
}

async function main() {
  await ensureBucket();

  const bookDirs = [
    ...readdirSync(OLD_TESTAMENT_DIR).map((name) => ({ name, parent: OLD_TESTAMENT_DIR })),
    ...readdirSync(NEW_TESTAMENT_DIR).map((name) => ({ name, parent: NEW_TESTAMENT_DIR })),
  ];

  for (const { name, parent } of bookDirs) {
    const num = bookNumber(name);
    const slug = BOOK_SLUGS[num - 1];
    if (!slug) throw new Error(`No slug for book number ${num} (folder ${name})`);

    const bookDir = path.join(parent, name);
    const files = readdirSync(bookDir).filter((f) => f.toLowerCase().endsWith(".mp3"));
    await processBook(slug, bookDir, files);
  }

  console.log(`\nDone. Uploaded ${counts.uploaded}, skipped ${counts.skipped} (already present), failed ${counts.failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
