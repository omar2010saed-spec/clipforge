import * as FileSystem from 'expo-file-system';
import { getEngine } from '@/engine/ffmpeg';
import { uriToPath } from '@/utils/path';

/**
 * Timeline thumbnails: one small JPEG per clip (frame at the clip's trim-in point),
 * cached on disk. Extraction runs one at a time so it never competes with playback.
 */
const THUMB_HEIGHT = 96;
const memory = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

function keyOf(uri: string, atMs: number): string {
  let h = 0;
  const s = `${uri}@${Math.round(atMs / 100)}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `t${(h >>> 0).toString(36)}`;
}

export function getVideoThumbnail(uri: string, atMs: number): Promise<string | null> {
  const key = keyOf(uri, atMs);
  const hit = memory.get(key);
  if (hit) return hit;

  const job = queue.then(async () => {
    try {
      const dir = `${FileSystem.cacheDirectory}thumbs/`;
      const out = `${dir}${key}.jpg`;
      const info = await FileSystem.getInfoAsync(out);
      if (info.exists) return out;
      const engine = getEngine();
      if (!engine) return null;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
      const seconds = Math.max(0, atMs / 1000).toFixed(3);
      const res = await engine.run([
        '-y',
        '-ss',
        seconds,
        '-i',
        uriToPath(uri),
        '-frames:v',
        '1',
        '-an',
        '-vf',
        `scale=-2:${THUMB_HEIGHT}`,
        '-q:v',
        '6',
        uriToPath(out),
      ]);
      return res.ok ? out : null;
    } catch {
      return null;
    }
  });
  const result = job as Promise<string | null>;
  queue = result.catch(() => undefined);
  memory.set(key, result);
  // do not cache failures forever (e.g. engine briefly busy)
  result.then((r) => {
    if (r === null) memory.delete(key);
  });
  return result;
}
