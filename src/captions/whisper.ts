import * as FileSystem from 'expo-file-system';
import * as Whisper from 'whisper.rn';
import type { Clip } from '@/types';
import type { Engine } from '@/engine/ffmpeg';
import { uriToPath } from '@/utils/path';
import { normalizeWhisperTimes, type RawSegment } from './segments';

export type ModelKey = 'tiny' | 'base' | 'small';
export type SpeechLanguage = 'ar' | 'en' | 'auto';

/** ggml models published by the whisper.cpp project on Hugging Face. */
export const MODELS: Record<ModelKey, { file: string; url: string; sizeMb: number }> = {
  tiny: { file: 'ggml-tiny.bin', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin', sizeMb: 75 },
  base: { file: 'ggml-base.bin', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin', sizeMb: 142 },
  small: { file: 'ggml-small.bin', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin', sizeMb: 466 },
};

const modelDir = () => `${FileSystem.documentDirectory}models/`;

/** Minimal shape of the whisper.rn API we rely on (kept local so a version bump can't break typing). */
interface WhisperContextLike {
  transcribe(
    path: string,
    options: { language?: string },
  ): { stop: () => Promise<void>; promise: Promise<{ result: string; segments?: { text: string; t0: number; t1: number }[] }> };
  release(): Promise<void>;
}

let activeDownload: FileSystem.DownloadResumable | null = null;

export async function cancelModelDownload(): Promise<void> {
  try {
    await activeDownload?.cancelAsync();
  } catch {
    /* nothing to cancel */
  }
  activeDownload = null;
}

/** Returns the local path of the model, downloading it first when needed. */
export async function ensureModel(key: ModelKey, onProgress: (pct: number) => void): Promise<string> {
  const def = MODELS[key];
  const dest = `${modelDir()}${def.file}`;
  const existing = await FileSystem.getInfoAsync(dest);
  const minBytes = def.sizeMb * 1024 * 1024 * 0.9;
  if (existing.exists && existing.size >= minBytes) return uriToPath(dest);

  await FileSystem.makeDirectoryAsync(modelDir(), { intermediates: true }).catch(() => undefined);
  const part = `${dest}.part`;
  await FileSystem.deleteAsync(part, { idempotent: true });
  const download = FileSystem.createDownloadResumable(def.url, part, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress(Math.min(99, Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100)));
    }
  });
  activeDownload = download;
  try {
    const res = await download.downloadAsync();
    if (!res || res.status !== 200) throw new Error(`model-download-failed:${res?.status ?? 'none'}`);
    const info = await FileSystem.getInfoAsync(part);
    if (!info.exists || info.size < minBytes) throw new Error('model-incomplete');
    await FileSystem.moveAsync({ from: part, to: dest });
    onProgress(100);
    return uriToPath(dest);
  } catch (e) {
    await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => undefined);
    throw e;
  } finally {
    activeDownload = null;
  }
}

/** Extracts [startMs, endMs] (source time) of a clip as 16 kHz mono WAV, the format whisper expects. */
export async function extractWav(engine: Engine, clip: Clip, startMs: number, endMs: number): Promise<string> {
  const out = `${FileSystem.cacheDirectory}caption-${Date.now()}.wav`;
  const args = [
    '-y', '-ss', (startMs / 1000).toFixed(3), '-t', ((endMs - startMs) / 1000).toFixed(3),
    '-i', uriToPath(clip.sourceUri), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', uriToPath(out),
  ];
  const res = await engine.run(args);
  if (res.cancelled) throw new Error('cancelled');
  if (!res.ok) throw new Error('extract-failed');
  return uriToPath(out);
}

export async function deleteQuietly(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
}

/** Runs speech recognition and returns segments relative to the start of the audio file. */
export async function transcribeWav(
  wavPath: string,
  modelPath: string,
  language: SpeechLanguage,
  rangeMs: number,
  onStop?: (stop: () => Promise<void>) => void,
): Promise<RawSegment[]> {
  const init = (Whisper as unknown as { initWhisper: (o: { filePath: string }) => Promise<WhisperContextLike> }).initWhisper;
  const ctx = await init({ filePath: modelPath });
  try {
    const { stop, promise } = ctx.transcribe(wavPath, language === 'auto' ? {} : { language });
    onStop?.(stop);
    const res = await promise;
    return normalizeWhisperTimes(res.segments ?? [], rangeMs);
  } finally {
    await ctx.release().catch(() => undefined);
  }
}
