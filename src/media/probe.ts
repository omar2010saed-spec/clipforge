import { createVideoPlayer } from 'expo-video';
import type { MediaKind } from '@/types';
import { getEngine } from '@/engine/ffmpeg';
import { uriToPath } from '@/utils/path';

export interface ProbeResult {
  durationMs: number;
  hasAudio?: boolean;
  /** true when the media engine was used (audio presence is reliable) */
  reliable: boolean;
}

/** Reads the duration of a media file with the media engine, falling back to the video player. */
export async function probeMedia(uri: string, kind: MediaKind, hintMs?: number | null): Promise<ProbeResult> {
  if (kind === 'image' || kind === 'gif') return { durationMs: 0, hasAudio: false, reliable: true };

  const engine = getEngine();
  if (engine) {
    try {
      const info = await engine.probe(uriToPath(uri));
      const durationMs = info.durationMs ?? hintMs ?? (await probeWithPlayer(uri));
      return { durationMs, hasAudio: kind === 'audio' ? true : info.hasAudio, reliable: true };
    } catch (e) {
      console.warn('[probe] engine probe failed, falling back', e);
    }
  }
  const durationMs = hintMs && hintMs > 0 ? hintMs : await probeWithPlayer(uri);
  return { durationMs, hasAudio: kind === 'audio' ? true : undefined, reliable: false };
}

function probeWithPlayer(uri: string, timeoutMs = 10_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const player = createVideoPlayer(uri);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.remove();
      try {
        player.release();
      } catch {
        /* already released */
      }
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('probe-timeout'))), timeoutMs);
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        const ms = Math.round((player.duration || 0) * 1000);
        finish(() => (ms > 0 ? resolve(ms) : reject(new Error('probe-no-duration'))));
      } else if (status === 'error') {
        finish(() => reject(new Error('probe-error')));
      }
    });
  });
}
