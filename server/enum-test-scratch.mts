import "dotenv/config";
import { enumerateYoutubeCatalog } from "./src/youtube/catalogEnumerate.js";

try {
  const result = await enumerateYoutubeCatalog("https://www.youtube.com/@GoogleDevelopers/videos");
  console.log("SUCCESS. channelName:", result.channelName, "items:", result.items.length, "truncated:", result.truncated);
} catch (err) {
  console.log("ENUMERATION ERROR:", err instanceof Error ? err.message : err);
  console.log(err);
}
