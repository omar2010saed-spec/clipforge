/**
 * Built-in sound effects, synthesized in code (no bundled audio files, no licensing issues).
 * Pure functions: the app writes the generated WAV to disk the first time an effect is used.
 */
export const SAMPLE_RATE = 32000;

export type SfxId =
  | 'whoosh' | 'riser' | 'pop' | 'click' | 'ding' | 'coin'
  | 'impact' | 'shutter' | 'glitch' | 'applause' | 'buzz' | 'typing';

export const SFX_IDS: SfxId[] = ['whoosh', 'riser', 'pop', 'click', 'ding', 'coin', 'impact', 'shutter', 'glitch', 'applause', 'buzz', 'typing'];

/** Small deterministic PRNG so an effect always sounds the same. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

const TAU = Math.PI * 2;
const secs = (s: number) => Math.round(s * SAMPLE_RATE);
const env = (t: number, attack: number, decay: number) => Math.min(1, t / attack) * Math.exp(-t / decay);

function render(seconds: number, fn: (t: number, i: number) => number): number[] {
  const n = secs(seconds);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SAMPLE_RATE, i);
  return out;
}

/** Peak-normalizes and applies a short fade-out so nothing ends with a click. */
function finish(samples: number[], peak = 0.85): number[] {
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  const g = max > 0 ? peak / max : 1;
  const fade = Math.min(secs(0.01), samples.length);
  return samples.map((v, i) => {
    const tail = samples.length - i;
    return v * g * (tail < fade ? tail / fade : 1);
  });
}

function lowpassNoise(seed: number, cutoff: (t: number) => number, seconds: number): (t: number, i: number) => number {
  const n = rng(seed);
  let y = 0;
  return (t) => {
    const a = Math.min(0.99, (TAU * cutoff(t)) / SAMPLE_RATE);
    y += a * (n() - y);
    return y;
  };
}

export function synthesize(id: SfxId): number[] {
  switch (id) {
    case 'whoosh': {
      const lp = lowpassNoise(1, (t) => 300 + 5200 * Math.sin((Math.PI * t) / 0.8) ** 2, 0.8);
      return finish(render(0.8, (t, i) => lp(t, i) * 6 * Math.sin((Math.PI * t) / 0.8) ** 1.5));
    }
    case 'riser': {
      const n = rng(2);
      let phase = 0;
      return finish(
        render(1.2, (t) => {
          const f = 200 * Math.pow(10, t / 1.2);
          phase += (TAU * f) / SAMPLE_RATE;
          return (Math.sin(phase) * 0.6 + n() * 0.25) * Math.min(1, t / 0.2) * (t > 1.1 ? (1.2 - t) / 0.1 : 1) * (0.3 + t / 1.2);
        }),
      );
    }
    case 'pop': {
      let phase = 0;
      return finish(
        render(0.18, (t) => {
          phase += (TAU * (160 + 700 * Math.exp(-t / 0.025))) / SAMPLE_RATE;
          return Math.sin(phase) * env(t, 0.002, 0.04);
        }),
      );
    }
    case 'click': {
      const n = rng(3);
      return finish(render(0.06, (t) => (n() * 0.7 + Math.sin(TAU * 1800 * t) * 0.5) * env(t, 0.0005, 0.008)));
    }
    case 'ding': {
      return finish(
        render(1.4, (t) => (Math.sin(TAU * 880 * t) + 0.5 * Math.sin(TAU * 2217 * t) + 0.25 * Math.sin(TAU * 3520 * t)) * env(t, 0.002, 0.35)),
      );
    }
    case 'coin': {
      return finish(
        render(0.6, (t) => {
          const f = t < 0.09 ? 988 : 1319;
          const tt = t < 0.09 ? t : t - 0.09;
          return (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * env(tt, 0.002, t < 0.09 ? 0.2 : 0.18);
        }),
      );
    }
    case 'impact': {
      const n = rng(4);
      let phase = 0;
      let y = 0;
      return finish(
        render(1.2, (t) => {
          phase += (TAU * (38 + 90 * Math.exp(-t / 0.07))) / SAMPLE_RATE;
          y += 0.08 * (n() - y);
          return Math.sin(phase) * env(t, 0.001, 0.28) * 1.2 + y * env(t, 0.001, 0.09) * 1.5;
        }),
      );
    }
    case 'shutter': {
      const n = rng(5);
      return finish(
        render(0.3, (t) => {
          const a = env(t, 0.0005, 0.012);
          const b = t > 0.07 ? env(t - 0.07, 0.0005, 0.02) : 0;
          return n() * (a + b * 0.8) + Math.sin(TAU * 2400 * t) * a * 0.3;
        }),
      );
    }
    case 'glitch': {
      const n = rng(6);
      let hold = 0;
      let freq = 400;
      return finish(
        render(0.4, (t, i) => {
          if (i % secs(0.02) === 0) {
            hold = n();
            freq = 150 + Math.abs(n()) * 2500;
          }
          const sq = Math.sin(TAU * freq * t) > 0 ? 1 : -1;
          return (sq * 0.6 + hold * 0.4) * (Math.sin(TAU * 38 * t) > -0.3 ? 1 : 0.15) * (1 - t / 0.4);
        }),
      );
    }
    case 'applause': {
      const n = rng(7);
      const m = rng(8);
      let y = 0;
      let crackle = 0;
      return finish(
        render(2.2, (t) => {
          if (n() > 0.985) crackle = 1;
          crackle *= 0.9;
          y += 0.5 * (m() - y);
          const swell = Math.min(1, t / 0.35) * (t > 1.7 ? (2.2 - t) / 0.5 : 1);
          return (y * 0.35 + m() * crackle * 0.9) * swell;
        }),
        0.7,
      );
    }
    case 'buzz': {
      return finish(
        render(0.4, (t) => {
          const on = t < 0.17 || (t > 0.22 && t < 0.39) ? 1 : 0;
          const sq = Math.sin(TAU * 140 * t) > 0 ? 1 : -1;
          return (sq * 0.7 + Math.sin(TAU * 280 * t) * 0.3) * on;
        }),
        0.6,
      );
    }
    case 'typing': {
      const n = rng(9);
      const hits: number[] = [];
      let at = 0.02;
      while (at < 1.1) {
        hits.push(at);
        at += 0.07 + Math.abs(n()) * 0.09;
      }
      return finish(
        render(1.25, (t) => {
          let v = 0;
          for (const h of hits) if (t >= h && t < h + 0.05) v += (n() * 0.8 + Math.sin(TAU * 1400 * (t - h)) * 0.4) * env(t - h, 0.0004, 0.009);
          return v;
        }),
      );
    }
  }
}

export function sfxDurationMs(id: SfxId): number {
  return Math.round((synthesize(id).length / SAMPLE_RATE) * 1000);
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: number[]): Uint8Array {
  const dataLen = samples.length * 2;
  const out = new Uint8Array(44 + dataLen);
  const view = new DataView(out.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] as number));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}
