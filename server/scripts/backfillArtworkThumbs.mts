// One-off backfill: generates the small "-thumb" artwork derivative (see
// src/storage/artworkThumbBackfill.ts) for every piece of artwork uploaded
// before that feature existed. Only useful where R2 credentials are
// actually available (production) — the same job also runs via
// POST /api/admin/artwork-thumbs/backfill, which is the way to trigger it
// against production from a machine that only has prod DB access. Run with:
// npx tsx scripts/backfillArtworkThumbs.mts
import "dotenv/config";
import { prisma } from "../src/prisma.js";
import { backfillState, runArtworkThumbBackfill } from "../src/storage/artworkThumbBackfill.js";

async function main() {
  await runArtworkThumbBackfill();
  const s = backfillState;
  console.log(
    `Done. Checked ${s.checked}/${s.total}. Generated ${s.generated}, already had one ${s.alreadyHadOne}, non-R2 ${s.skippedNonR2}, failed ${s.failed}.`
  );
  if (s.recentFailures.length) console.log("Recent failures:", s.recentFailures);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
