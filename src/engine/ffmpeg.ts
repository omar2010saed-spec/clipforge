/**
 * Thin wrapper over FFmpegKit (optional dependency).
 *
 * The retired `ffmpeg-kit-react-native` package is NOT listed in package.json because its
 * binaries are no longer published (see README, "Enable export"). This wrapper loads it
 * lazily; when it is missing `getEngine()` returns null and the UI explains how to enable it.
 * Anything that exposes the same FFmpegKit / FFprobeKit / ReturnCode API can be used.
 */
export interface RunResult {
  ok: boolean;
  cancelled: boolean;
  log: string;
}

export interface MediaInfo {
  durationMs: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface Engine {
  run(args: string[], onTimeMs?: (ms: number) => void): Promise<RunResult>;
  cancel(): Promise<void>;
  probe(path: string): Promise<MediaInfo>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const require: (name: string) => any;

let cached: Engine | null | undefined;

export function getEngine(): Engine | null {
  if (cached !== undefined) return cached;
  try {
    const mod = require('ffmpeg-kit-react-native');
    cached = createEngine(mod);
  } catch {
    cached = null;
  }
  return cached;
}

export function isEngineAvailable(): boolean {
  return getEngine() !== null;
}

function createEngine(mod: any): Engine {
  const { FFmpegKit, FFprobeKit, ReturnCode } = mod;
  if (!FFmpegKit || !FFprobeKit || !ReturnCode) throw new Error('unsupported ffmpeg module');

  return {
    run(args, onTimeMs) {
      return new Promise<RunResult>((resolve) => {
        let log = '';
        FFmpegKit.executeWithArgumentsAsync(
          args,
          (session: any) => {
            session
              .getReturnCode()
              .then((rc: any) =>
                resolve({ ok: ReturnCode.isSuccess(rc), cancelled: ReturnCode.isCancel(rc), log }),
              )
              .catch((e: unknown) => resolve({ ok: false, cancelled: false, log: String(e) }));
          },
          (entry: any) => {
            log = (log + String(entry.getMessage())).slice(-8000);
          },
          (stats: any) => {
            const t = Number(stats.getTime());
            if (onTimeMs && Number.isFinite(t) && t >= 0) onTimeMs(t);
          },
        ).catch((e: unknown) => resolve({ ok: false, cancelled: false, log: String(e) }));
      });
    },

    async cancel() {
      await FFmpegKit.cancel();
    },

    async probe(path) {
      const session = await FFprobeKit.getMediaInformation(path);
      const info = session.getMediaInformation();
      if (!info) throw new Error('probe-failed');
      const seconds = Number.parseFloat(String(info.getDuration()));
      const streams: any[] = info.getStreams() ?? [];
      const types = streams.map((s) => String(s.getType()));
      return {
        durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
        hasAudio: types.includes('audio'),
        hasVideo: types.includes('video'),
      };
    },
  };
}
