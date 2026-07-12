import { spawn } from "node:child_process";

const PEAK_COUNT = 200;
const SAMPLE_RATE = 8000;

// Decodes the audio file to raw mono PCM via ffmpeg and reduces it to a
// fixed-length array of normalized peak amplitudes (0..1), suitable for
// drawing a waveform in the UI without shipping the whole file client-side.
// Returns null (rather than throwing) if ffmpeg isn't available or decoding
// fails — a waveform is a nice-to-have, not required for the import to succeed.
export async function generateWaveform(filePath: string): Promise<number[] | null> {
  try {
    const pcm = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-i",
        filePath,
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "pipe:1",
      ]);
      const chunks: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });

    const sampleCount = Math.floor(pcm.length / 2);
    if (sampleCount === 0) return null;

    const samplesPerPeak = Math.max(1, Math.floor(sampleCount / PEAK_COUNT));
    const peaks: number[] = [];
    for (let i = 0; i < PEAK_COUNT; i++) {
      const start = i * samplesPerPeak;
      if (start >= sampleCount) break;
      const end = Math.min(sampleCount, start + samplesPerPeak);
      let max = 0;
      for (let j = start; j < end; j++) {
        const sample = Math.abs(pcm.readInt16LE(j * 2));
        if (sample > max) max = sample;
      }
      peaks.push(Math.round((max / 32768) * 1000) / 1000);
    }
    return peaks;
  } catch {
    return null;
  }
}
