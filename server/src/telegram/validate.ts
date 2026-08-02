// Parses a Telegram channel link into a bare @username, the only form
// GramJS's getEntity() needs. Invite links (t.me/+xxxx or t.me/joinchat/xxxx)
// are deliberately rejected — following one would mean actually joining a
// private channel programmatically, a materially different and riskier
// action than reading a public channel's history, and out of scope here.
export function extractTelegramChannelUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("@")) {
    return isValidUsername(trimmed.slice(1)) ? trimmed.slice(1) : null;
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    // Not a URL and not an @handle — but might just be a bare username.
    return isValidUsername(trimmed) ? trimmed : null;
  }

  if (!/^(t|telegram)\.me$/i.test(url.hostname) && !/^(www\.)?telegram\.org$/i.test(url.hostname)) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  if (segments[0] === "s" && segments[1]) {
    // t.me/s/channelname — the web-preview form of a channel link.
    return isValidUsername(segments[1]) ? segments[1] : null;
  }
  if (segments[0].startsWith("+") || segments[0] === "joinchat") {
    return null; // invite link — out of scope, see the doc comment above
  }
  return isValidUsername(segments[0]) ? segments[0] : null;
}

function isValidUsername(name: string): boolean {
  // Telegram usernames: 5-32 chars, letters/digits/underscore, can't start
  // with a digit.
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(name);
}
