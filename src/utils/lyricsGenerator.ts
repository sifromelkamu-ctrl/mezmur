function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(hash, 31) + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickUnique(rand: () => number, pool: string[], count: number): string[] {
  const available = [...pool];
  const picked: string[] = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(rand() * available.length);
    picked.push(available[idx]);
    available.splice(idx, 1);
  }
  return picked;
}

const AMHARIC_LINES = [
  "እግዚአብሔር ይመስገን ለዘላለም",
  "ጌታ ኢየሱስ ስሙ የተመሰገነ ነው",
  "በእግዚአብሔር ፊት እንደሰግዳለሁ",
  "ምስጋና ይሁንልህ ጌታ ሆይ",
  "ልቤ በደስታ ይዘምራል",
  "መንፈስ ቅዱስ ሆይ ና ውረድ",
  "ፍቅርህ ታላቅ ነው ጌታ ሆይ",
  "ስምህ የተባረከ ነው ለዘላለም",
  "ሃሌሉያ ለጌታ ዘምሩ",
  "በጸሎት ወደ አንተ እንቀርባለን",
  "ጸጋህ በቂ ነው ለኔ",
  "ተስፋዬ ሁሉ በአንተ ነው",
  "ወደ ዙፋንህ በእምነት እቀርባለሁ",
  "ክብር ለንጉሠ ነገሥት ይሁን",
  "ጌታ መሲህ የዘላለም ንጉሥ ነው",
  "በስምህ ኃይል አለ ጌታ",
  "እውነተኛ አምላክ አንተ ብቻ ነህ",
  "ፈውስን የምትሰጥ አምላክ ነህ",
  "ብርሃንህ በሕይወቴ ያብራል",
  "ጨለማ ከፊቴ ይገፈፋል",
  "ዘወትር አመሰግንሃለሁ ጌታ",
  "መዝሙር ለልዑል እግዚአብሔር",
  "ልብን የሚያድስ ውዳሴ ላንተ",
  "ቸርነትህ ለዘላለም ጸንቶ ይኖራል",
  "ጸሎቴን ስማልኝ ጌታ ሆይ",
  "በረከትህ ሕይወቴን ይሙላው",
  "መንገዴን ምራኝ ጌታ ሆይ",
  "በአንተ ብቻ እታመናለሁ",
  "ውዳሴ ይገባሃል አንተ ብቻህን",
  "ስምህ ከሁሉ በላይ ከፍ ያለ ነው",
  "ደስታዬ ሁሉ ካንተ ዘንድ ነው",
  "በመዝሙር ስምህን ከፍ አደርጋለሁ",
  "አንተ መጠጊያዬ ዓለት ነህ",
  "ላንተ ብቻ እጅ እነሳለሁ",
  "ቃልህ መንገዴን ያበራል",
  "ምስጋና ከልብ ላንተ አቀርባለሁ",
];

interface GeneratedLyricLine {
  text: string;
  section: "verse" | "chorus" | "bridge";
}

export interface GeneratedLyrics {
  language: "am";
  lines: GeneratedLyricLine[];
}

export function generateLyrics(seed: string): GeneratedLyrics {
  const rand = mulberry32(hashString(seed));
  const chorus = pickUnique(rand, AMHARIC_LINES, 3);
  const verse1 = pickUnique(
    rand,
    AMHARIC_LINES.filter((l) => !chorus.includes(l)),
    4
  );
  const verse2 = pickUnique(
    rand,
    AMHARIC_LINES.filter((l) => !chorus.includes(l) && !verse1.includes(l)),
    4
  );
  const bridge = pickUnique(
    rand,
    AMHARIC_LINES.filter((l) => !chorus.includes(l) && !verse1.includes(l) && !verse2.includes(l)),
    2
  );

  const toLines = (arr: string[], section: GeneratedLyricLine["section"]): GeneratedLyricLine[] =>
    arr.map((text) => ({ text, section }));

  return {
    language: "am",
    lines: [
      ...toLines(verse1, "verse"),
      ...toLines(chorus, "chorus"),
      ...toLines(verse2, "verse"),
      ...toLines(chorus, "chorus"),
      ...toLines(bridge, "bridge"),
      ...toLines(chorus, "chorus"),
    ],
  };
}
