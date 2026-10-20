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

const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪[^♪]*♪?|<[^>]+>/g;
const SENTENCE = /[^.!?؟…،,;؛]+[.!?؟…،,;؛]*/g;
const MIN_LINE_MS = 600;

/** Removes non-speech tags ("[music]", "(applause)", "♪") that whisper emits and tidies spaces. */
export function cleanCaptionText(text: string): string {
  const t = text.replace(NON_SPEECH, ' ').replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : '';
}

function balancedChunks(words: string[], maxWords: number, maxChars: number): string[] {
  const chars = words.join(' ').length;
  const count = Math.max(Math.ceil(words.length / maxWords), Math.ceil(chars / maxChars), 1);
  const per = Math.ceil(words.length / count);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per).join(' '));
  return out;
}

/**
 * Turns recognizer segments into short, readable caption lines:
 *  - drops non-speech tags and empty text,
 *  - splits at sentence punctuation, then into balanced chunks (<= maxWords words / maxChars chars),
 *  - merges one-word crumbs into their neighbour,
 *  - distributes each segment's duration over its lines by character count,
 *  - removes repeated lines (a common recognizer loop), overlaps and flashes shorter than 0.6 s.
 */
export function splitIntoCaptionLines(segments: RawSegment[], maxWords = 6, maxChars = 34): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (const seg of segments) {
    const text = cleanCaptionText(seg.text);
    if (!text || seg.endMs <= seg.startMs) continue;

    const sentences = (text.match(SENTENCE) ?? [text]).map((x) => x.trim()).filter(Boolean);
    const chunks: string[] = [];
    for (const sentence of sentences) {
      const words = sentence.split(' ').filter(Boolean);
      const parts = balancedChunks(words, maxWords, maxChars);
      for (const part of parts) {
        const prev = chunks[chunks.length - 1];
        const crumb = part.split(' ').length < 2 || (prev !== undefined && prev.split(' ').length < 2);
        if (prev !== undefined && crumb && prev.split(' ').length + part.split(' ').length <= maxWords + 1) {
          chunks[chunks.length - 1] = `${prev} ${part}`;
        } else chunks.push(part);
      }
    }

    const totalChars = chunks.reduce((n, c) => n + c.length, 0);
    const duration = seg.endMs - seg.startMs;
    let cursor = seg.startMs;
    chunks.forEach((chunk, i) => {
      const isLast = i === chunks.length - 1;
      const end = isLast ? seg.endMs : cursor + Math.round((duration * chunk.length) / totalChars);
      lines.push({ text: chunk, startMs: Math.round(cursor), endMs: Math.round(end) });
      cursor = end;
    });
  }
  return polishLines(lines);
}

export function polishLines(input: CaptionLine[]): CaptionLine[] {
  const sorted = [...input].sort((a, b) => a.startMs - b.startMs);
  const out: CaptionLine[] = [];
  for (const l of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.text === l.text && l.startMs - prev.endMs < 1500) {
      prev.endMs = Math.max(prev.endMs, l.endMs); // repeated line: extend instead of showing twice
      continue;
    }
    out.push({ ...l });
  }
  for (let i = 0; i < out.length; i++) {
    const cur = out[i]!;
    const next = out[i + 1];
    if (next && cur.endMs > next.startMs) cur.endMs = next.startMs;
    if (cur.endMs - cur.startMs < MIN_LINE_MS) {
      const limit = next ? next.startMs : Infinity;
      cur.endMs = Math.min(limit, cur.startMs + MIN_LINE_MS);
    }
  }
  return out.filter((l) => l.endMs - l.startMs >= 100);
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
