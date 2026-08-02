import { Api } from "teleproto";
import { prisma } from "../prisma.js";
import { getTelegramClient } from "./client.js";
import { extractTelegramChannelUsername } from "./validate.js";

// Same ceiling YouTube catalog import uses, for the same reason: keeps the
// selection UI and resulting DB rows manageable even for a channel with a
// very long posting history.
const MAX_TOTAL_ITEMS = 500;

export interface TelegramCatalogEntry {
  messageId: string;
  title: string;
  performer: string | null;
  duration: number | null;
  position: number;
  isDuplicate: boolean;
}

export interface TelegramCatalogEnumeration {
  channelId: string;
  channelName: string | null;
  items: TelegramCatalogEntry[];
  truncated: boolean;
}

// Builds the same dedup id importTelegramAudio() writes to Track.sourceId —
// scoped by channel since a bare Telegram message id is only unique within
// its own channel.
export function buildTelegramSourceId(channelId: string, messageId: string | number): string {
  return `tg:${channelId}:${messageId}`;
}

function findAudioAttribute(doc: Api.Document): Api.DocumentAttributeAudio | undefined {
  return doc.attributes.find((a): a is Api.DocumentAttributeAudio => a instanceof Api.DocumentAttributeAudio && !a.voice);
}

function findFileNameAttribute(doc: Api.Document): string | undefined {
  const attr = doc.attributes.find((a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename);
  return attr?.fileName;
}

// Enumerates a public Telegram channel's audio posts (server-side filtered
// via InputMessagesFilterMusic, so this never has to page through every
// message the channel has ever posted — mirrors how YouTube enumeration
// reads the Releases/Playlists tabs instead of scanning everything). Reads
// title/performer/duration straight off each message's own
// DocumentAttributeAudio — Telegram's own tagging is usually already clean,
// unlike YouTube video titles which need heuristic cleanup.
export async function enumerateTelegramChannel(channelUrlOrUsername: string): Promise<TelegramCatalogEnumeration> {
  const username = extractTelegramChannelUsername(channelUrlOrUsername);
  if (!username) {
    throw new Error("That doesn't look like a Telegram channel link (expected t.me/channelname or @channelname)");
  }

  const client = await getTelegramClient();
  const entity = await client.getEntity(username);
  const channelId = String((entity as { id?: unknown }).id ?? username);
  const channelName = "title" in entity && typeof entity.title === "string" ? entity.title : null;

  const rawItems: Omit<TelegramCatalogEntry, "isDuplicate">[] = [];
  let truncated = false;
  let position = 0;

  for await (const message of client.iterMessages(entity, {
    filter: new Api.InputMessagesFilterMusic(),
    limit: MAX_TOTAL_ITEMS + 1,
    reverse: false,
  })) {
    if (rawItems.length >= MAX_TOTAL_ITEMS) {
      truncated = true;
      break;
    }
    const doc = message.document;
    if (!doc) continue;
    const audio = findAudioAttribute(doc);
    if (!audio) continue; // a music-filtered document without an audio attribute at all — shouldn't happen, skip defensively

    const title = audio.title?.trim() || findFileNameAttribute(doc)?.replace(/\.[a-z0-9]+$/i, "") || "Untitled";
    rawItems.push({
      messageId: String(message.id),
      title,
      performer: audio.performer?.trim() || null,
      duration: audio.duration ?? null,
      position: position++,
    });
  }

  if (rawItems.length === 0) {
    throw new Error("No audio files found in this channel");
  }

  const candidateSourceIds = rawItems.map((i) => buildTelegramSourceId(channelId, i.messageId));
  const existing = await prisma.track.findMany({
    where: { sourceId: { in: candidateSourceIds } },
    select: { sourceId: true },
  });
  const existingIds = new Set(existing.map((t) => t.sourceId));

  return {
    channelId,
    channelName,
    truncated,
    items: rawItems.map((item) => ({
      ...item,
      isDuplicate: existingIds.has(buildTelegramSourceId(channelId, item.messageId)),
    })),
  };
}
