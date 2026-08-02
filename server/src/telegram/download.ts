import { spawn } from "node:child_process";
import path from "node:path";
import { getTelegramClient } from "./client.js";
import { CancelledImportError } from "../youtube/safeError.js";

// Telegram audio commonly arrives as ogg/opus or m4a (whatever the uploader's
// client encoded it as) — Safari/iOS can't reliably play ogg, so anything not
// already mp3 is normalized here. 160kbps matches the bitrate YouTube imports
// already use (see youtube/ytdlp.ts) for the same reason: keeps even a
// full-length track comfortably under Supabase's 50MB per-file limit.
function convertToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-b:a", "160k", outputPath]);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });
}

// Re-resolves the specific message (enumeration doesn't keep the live
// message object around) and streams its audio document to disk, converting
// to mp3 if the source isn't one already. Mirrors youtube/ytdlp.ts's
// downloadYoutubeAudio in shape: a tmpDir + progress callback + AbortSignal
// in, a finished audio file path out.
export async function downloadTelegramAudio(
  channelUsername: string,
  messageId: string,
  outDir: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) throw new CancelledImportError();

  const client = await getTelegramClient();
  const entity = await client.getEntity(channelUsername);
  const [message] = await client.getMessages(entity, { ids: Number(messageId) });
  if (!message || !message.document) {
    throw new Error("This message is no longer available or no longer contains an audio file");
  }

  const isMp3 = message.document.mimeType === "audio/mpeg";
  const rawExt = isMp3 ? "mp3" : (message.document.mimeType?.split("/")[1] ?? "bin");
  const rawPath = path.join(outDir, `audio-raw.${rawExt}`);

  await client.downloadMedia(message, {
    outputFile: rawPath,
    signal,
    progressCallback: (downloaded, total) => {
      const totalNum = Number(total);
      if (totalNum > 0) onProgress?.((Number(downloaded) / totalNum) * 100);
    },
  });

  if (signal?.aborted) throw new CancelledImportError();
  if (isMp3) return rawPath;

  const mp3Path = path.join(outDir, "audio.mp3");
  await convertToMp3(rawPath, mp3Path);
  return mp3Path;
}
