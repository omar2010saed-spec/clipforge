/**
 * Per-clip color grading (brightness / contrast / saturation / warmth).
 * Pure helpers: the export turns an adjustment into FFmpeg filters, the preview into
 * translucent tint layers (an approximation, native video views have no color matrix).
 */
import type { ClipAdjust } from '../types';

export const NEUTRAL_ADJUST: ClipAdjust = { brightness: 0, contrast: 1, saturation: 1, warmth: 0 };

export const ADJUST_LIMITS = {
  brightness: [-1, 1],
  contrast: [0.3, 2],
  saturation: [0, 2],
  warmth: [-1, 1],
} as const;

export type AdjustKey = keyof ClipAdjust;

export const PRESETS: Record<string, ClipAdjust> = {
  none: NEUTRAL_ADJUST,
  bw: { brightness: 0, contrast: 1.1, saturation: 0, warmth: 0 },
  vivid: { brightness: 0.05, contrast: 1.15, saturation: 1.5, warmth: 0 },
  warm: { brightness: 0.03, contrast: 1.05, saturation: 1.1, warmth: 0.5 },
  cool: { brightness: 0, contrast: 1.05, saturation: 1, warmth: -0.5 },
  vintage: { brightness: -0.05, contrast: 1.1, saturation: 0.7, warmth: 0.35 },
  fade: { brightness: 0.08, contrast: 0.8, saturation: 0.8, warmth: 0 },
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function clampAdjust(a: ClipAdjust): ClipAdjust {
  const c = (v: number, [lo, hi]: readonly [number, number]) => round2(Math.min(hi, Math.max(lo, v)));
  return {
    brightness: c(a.brightness, ADJUST_LIMITS.brightness),
    contrast: c(a.contrast, ADJUST_LIMITS.contrast),
    saturation: c(a.saturation, ADJUST_LIMITS.saturation),
    warmth: c(a.warmth, ADJUST_LIMITS.warmth),
  };
}

export function isNeutral(a: ClipAdjust | undefined): boolean {
  if (!a) return true;
  return a.brightness === 0 && a.contrast === 1 && a.saturation === 1 && a.warmth === 0;
}

/** Name of the preset matching the adjustment exactly (or null for a custom one). */
export function matchingPreset(a: ClipAdjust | undefined): string | null {
  const cur = a ?? NEUTRAL_ADJUST;
  for (const [name, p] of Object.entries(PRESETS)) {
    if (p.brightness === cur.brightness && p.contrast === cur.contrast && p.saturation === cur.saturation && p.warmth === cur.warmth) return name;
  }
  return null;
}

const fmt = (v: number) => String(round2(v));

/** FFmpeg filter chain (comma separated, no labels) or null when nothing changes. */
export function adjustFilter(a: ClipAdjust | undefined): string | null {
  if (!a || isNeutral(a)) return null;
  const parts: string[] = [];
  if (a.brightness !== 0 || a.contrast !== 1 || a.saturation !== 1) {
    // UI brightness spans -1..1; the eq filter is very sensitive, so use a +-0.4 range.
    parts.push(`eq=brightness=${fmt(a.brightness * 0.4)}:contrast=${fmt(a.contrast)}:saturation=${fmt(a.saturation)}`);
  }
  if (a.warmth !== 0) {
    const w = a.warmth * 0.25;
    parts.push(`colorbalance=rs=${fmt(w)}:rm=${fmt(w)}:rh=${fmt(w)}:bs=${fmt(-w)}:bm=${fmt(-w)}:bh=${fmt(-w)}`);
  }
  return parts.join(',');
}

export interface Tint {
  color: string;
  opacity: number;
}

/** Translucent layers that roughly mimic the adjustment in the live preview. */
export function previewTints(a: ClipAdjust | undefined): Tint[] {
  if (!a || isNeutral(a)) return [];
  const tints: Tint[] = [];
  if (a.saturation < 1) tints.push({ color: 'rgb(128,128,128)', opacity: round2((1 - a.saturation) * 0.7) });
  if (a.contrast < 1) tints.push({ color: 'rgb(128,128,128)', opacity: round2((1 - a.contrast) * 0.6) });
  if (a.warmth > 0) tints.push({ color: 'rgb(255,150,40)', opacity: round2(a.warmth * 0.22) });
  if (a.warmth < 0) tints.push({ color: 'rgb(60,140,255)', opacity: round2(-a.warmth * 0.22) });
  if (a.brightness > 0) tints.push({ color: 'rgb(255,255,255)', opacity: round2(a.brightness * 0.45) });
  if (a.brightness < 0) tints.push({ color: 'rgb(0,0,0)', opacity: round2(-a.brightness * 0.6) });
  return tints;
}
