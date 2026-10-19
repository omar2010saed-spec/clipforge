/**
 * Pure helpers that turn raw speech-recognition segments into caption lines
 * and map them onto the project timeline.
 */
import type { Clip } from '../types';

export interface RawSegment {
  text: string;
  /** Source time in milliseconds */
  startMs: number;
  endMs: number;
}

export interface CaptionLine {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * whisper.cpp reports segment times in 10 ms units. If a runtime reports milliseconds the
 * values would overshoot the audio range by ~10x, so we detect that and avoid scaling.
 */
export function normalizeWhisperTimes(
  segments: { text: string; t0: number; t1: number }[],
  rangeMs: number,
): RawSegment[] {
  const maxT1 = segments.reduce((m, s) => Math.max(m, s.t1), 0);
  const scale = maxT1 * 10 > rangeMs * 1.5 + 1000 ? 1 : 10;
  return segments.map((s) => ({ text: s.text, startMs: s.t0 * scale, endMs: s.t1 * scale }));
}

/**
 * Splits long segments into short, readable lines (max `maxWords` words) and distributes
 * the segment duration over the lines in proportion to their character count.
 */
export function splitIntoCaptionLines(segments: RawSegment[], maxWords = 6): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0 || seg.endMs <= seg.startMs) continue;
    const chunks: string[] = [];
    const chunkCount = Math.ceil(words.length / maxWords);
    const per = Math.ceil(words.length / chunkCount); // balanced chunks
    for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(' '));
    const totalChars = chunks.reduce((n, c) => n + c.length, 0);
    const duration = seg.endMs - seg.startMs;
    let cursor = seg.startMs;
    chunks.forEach((text, i) => {
      const isLast = i === chunks.length - 1;
      const end = isLast ? seg.endMs : cursor + Math.round((duration * text.length) / totalChars);
      lines.push({ text, startMs: Math.round(cursor), endMs: Math.round(end) });
      cursor = end;
    });
  }
  return lines;
}

/**
 * Converts source-time caption lines of one clip into timeline time.
 * Lines outside the clip's trimmed range are dropped. Reversed clips are not supported.
 */
export function mapLinesToTimeline(lines: CaptionLine[], clip: Clip): CaptionLine[] {
  if (clip.reversed) return [];
  const result: CaptionLine[] = [];
  for (const l of lines) {
    const s = Math.max(l.startMs, clip.inMs);
    const e = Math.min(l.endMs, clip.outMs);
    if (e - s < 50) continue;
    result.push({
      text: l.text,
      startMs: Math.round(clip.startMs + (s - clip.inMs) / clip.speed),
      endMs: Math.round(clip.startMs + (e - clip.inMs) / clip.speed),
    });
  }
  return result;
}
