const DEVOTIONAL_LINES = [
  "Sing joyfully today — someone near you needs to hear it.",
  "Let today's mezmur lift your spirit before it lifts your feet.",
  "Worship is better together. Share a song with someone today.",
  "Your voice matters in the choir of heaven.",
  "Take a moment. Breathe. Worship.",
  "Every mezmur is a small prayer set to melody.",
  "Let gratitude be the first song of your day.",
  "Peace grows quietly in a heart that sings.",
  "Carry today's worship with you, wherever you go.",
  "A grateful heart finds a reason to sing in anything.",
  "Music was made to carry what words alone cannot.",
  "Today's worship doesn't have to be loud to be heard by heaven.",
  "Let the melody remind you: you are not alone today.",
  "A song of praise can turn an ordinary morning into holy ground.",
  "Sing until your worries feel smaller than your worship.",
  "Every note of gratitude is a step closer to peace.",
  "Let today begin with a song instead of a scroll.",
  "The quietest hum of worship still reaches heaven's ear.",
  "Your playlist can be a prayer if you let it.",
  "Joy multiplies the moment you share it in song.",
  "There's no wrong way to worship — just begin.",
  "Let today's mezmur remind you that you are loved.",
  "A worshipful heart turns waiting into praise.",
  "Sing your gratitude before you speak your worries.",
  "Music makes room for God even on the busiest days.",
  "Today, let a song do what silence couldn't.",
  "Worship first. Let everything else follow.",
  "Some days need a hymn more than an explanation.",
  "The songs you sing today shape the peace you carry tomorrow.",
  "Let gospel music be the soundtrack to your gratitude.",
  "A heart that sings is a heart that heals.",
  "Turn up the worship — turn down the worry.",
  "Every mezmur is a reminder that you're never far from grace.",
  "Praise doesn't wait for perfect days — start now.",
  "Let today's song carry you closer to peace.",
  "Worship is the language the soul understands best.",
  "Sing like heaven is already listening — because it is.",
  "A grateful song today plants seeds of joy for tomorrow.",
  "Let the mezmur remind you: your story isn't over.",
  "There is strength hidden in a simple worship song.",
  "Today's melody might be exactly what someone else needs too.",
  "Praise is the quiet rebellion against a hard day.",
  "Let a song remind you who's still writing your story.",
  "Worship turns ordinary moments into sacred ones.",
  "Sing your thanks before the day asks for your worries.",
  "Every worship song is a small act of hope.",
  "Let today's music remind your heart to rest.",
  "A song of praise is never wasted — heaven keeps every note.",
  "Start your day the way heaven starts every morning — with song.",
  "Worship doesn't need permission — just a willing heart.",
  "Let the mezmur remind you that joy is still available today.",
  "Today, let gratitude find its voice in song.",
  "A single hymn can carry the weight of a whole week.",
  "Sing not because you feel joyful, but because joy follows worship.",
  "Let today's worship be simple, honest, and enough.",
  "Music reminds the weary heart that morning always comes.",
  "Praise is the bridge between where you are and where grace is.",
  "Let a song remind you: you were made for more than survival.",
  "Worship quietly today — heaven still hears every word.",
  "Let gratitude hum in the background of your whole day.",
];

// Well-mixed 32-bit integer hash (Murmur3-style finalizer) — a plain
// `dayOfYear % length` walked the list in the exact order it's written,
// which after a few weeks reads as an obviously fixed rotation rather than
// something that feels freshly picked. Hashing the day number scrambles
// the day-to-day order into something that looks genuinely shuffled while
// staying stable for the whole day and identical for every visitor (same
// approach server/src/push.ts uses for the daily verse push, minus the
// per-user salt — this is shown to everyone, not sent to one subscriber).
function mix32(n: number): number {
  let x = n;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function devotionalLineOfTheDay(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
  );
  return DEVOTIONAL_LINES[mix32(dayOfYear) % DEVOTIONAL_LINES.length];
}
