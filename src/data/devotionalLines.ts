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
];

export function devotionalLineOfTheDay(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
  );
  return DEVOTIONAL_LINES[dayOfYear % DEVOTIONAL_LINES.length];
}
