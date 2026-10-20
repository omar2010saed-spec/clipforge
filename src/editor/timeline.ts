/**
 * Pure, immutable editing operations on a Project.
 * Every function returns a new Project (or the same one when the operation is a no-op).
 * No React / native imports here so everything is unit-testable.
 */
import type { Clip, ClipAdjust, MediaKind, Project, TextOverlay, Track, TrackKind } from '../types';
import { clipDurationMs, clipEndMs } from '../models/project';
import { newId } from '../utils/id';
import { clampAdjust, isNeutral, NEUTRAL_ADJUST } from './adjust';

export const MIN_CLIP_MS = 100;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
export const DEFAULT_IMAGE_MS = 3000;
/** Images / gifs have no real length: allow stretching them up to one hour. */
export const IMAGE_MAX_MS = 3_600_000;
export const DEFAULT_TEXT_MS = 3000;

export type AddTarget = 'main' | 'overlay' | 'audio';

export interface NewMedia {
  kind: MediaKind;
  uri: string;
  name: string;
  durationMs: number;
  hasAudio?: boolean;
}

// ---------------------------------------------------------------- lookups

export function trackOf(project: Project, kind: TrackKind): Track | undefined {
  return project.tracks.find((t) => t.kind === kind);
}

export function findClip(project: Project, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function findText(project: Project, textId: string): TextOverlay | undefined {
  return project.texts.find((t) => t.id === textId);
}

export function mainTrackEndMs(project: Project): number {
  const main = trackOf(project, 'video');
  if (!main) return 0;
  return main.clips.reduce((end, c) => Math.max(end, clipEndMs(c)), 0);
}

/** Clips of a track that are visible / audible at timeline position t. */
export function activeClips(project: Project, kind: TrackKind, t: number): Clip[] {
  const track = trackOf(project, kind);
  if (!track) return [];
  return track.clips.filter((c) => t >= c.startMs && t < clipEndMs(c));
}

export function activeTexts(project: Project, t: number): TextOverlay[] {
  return project.texts.filter((x) => t >= x.startMs && t < x.endMs);
}

/** Position inside the source file that is shown at timeline time t. */
export function sourceTimeMs(clip: Clip, t: number): number {
  const rel = Math.max(0, t - clip.startMs) * clip.speed;
  return clip.reversed ? clip.outMs - rel : clip.inMs + rel;
}

// ---------------------------------------------------------------- internals

function mapTrack(project: Project, trackId: string, fn: (t: Track) => Track): Project {
  return { ...project, tracks: project.tracks.map((t) => (t.id === trackId ? fn(t) : t)) };
}

/** Packs the clips of the main track back-to-back, ordered by `key` (default: start time). */
function pack(clips: Clip[], key: (c: Clip) => number = (c) => c.startMs): Clip[] {
  const sorted = [...clips].sort((a, b) => key(a) - key(b));
  let cursor = 0;
  return sorted.map((c) => {
    const placed = c.startMs === cursor ? c : { ...c, startMs: cursor };
    cursor += clipDurationMs(placed);
    return placed;
  });
}

function withClipUpdate(project: Project, clipId: string, fn: (c: Clip, t: Track) => Clip): Project {
  const found = findClip(project, clipId);
  if (!found) return project;
  const { track } = found;
  return mapTrack(project, track.id, (t) => {
    const clips = t.clips.map((c) => (c.id === clipId ? fn(c, t) : c));
    return { ...t, clips: t.kind === 'video' ? pack(clips) : clips };
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------- clips

export function addMedia(
  project: Project,
  media: NewMedia,
  target: AddTarget,
  atMs = 0,
): { project: Project; clipId: string | null } {
  const kind: TrackKind = target === 'main' ? 'video' : target;
  const track = trackOf(project, kind);
  if (!track) return { project, clipId: null };
  const still = media.kind === 'image' || media.kind === 'gif';
  const duration = still ? DEFAULT_IMAGE_MS : Math.max(MIN_CLIP_MS, Math.round(media.durationMs));
  const clip: Clip = {
    id: newId(),
    trackId: track.id,
    kind: media.kind,
    sourceUri: media.uri,
    name: media.name,
    startMs: target === 'main' ? track.clips.reduce((e, c) => Math.max(e, clipEndMs(c)), 0) : Math.max(0, Math.round(atMs)),
    inMs: 0,
    outMs: duration,
    sourceDurationMs: still ? IMAGE_MAX_MS : duration,
    speed: 1,
    reversed: false,
    volume: 1,
    hasAudio: media.kind === 'audio' ? true : media.hasAudio,
    x: 0.5,
    y: 0.5,
    scale: target === 'overlay' ? 0.5 : 1,
  };
  return {
    project: mapTrack(project, track.id, (t) => ({ ...t, clips: [...t.clips, clip] })),
    clipId: clip.id,
  };
}

export function splitClipAt(
  project: Project,
  clipId: string,
  atMs: number,
): { project: Project; newClipId: string | null } {
  const found = findClip(project, clipId);
  if (!found) return { project, newClipId: null };
  const { clip, track } = found;
  const end = clipEndMs(clip);
  if (atMs <= clip.startMs + MIN_CLIP_MS || atMs >= end - MIN_CLIP_MS) {
    return { project, newClipId: null };
  }
  const srcOffset = (atMs - clip.startMs) * clip.speed;
  const left: Clip = clip.reversed
    ? { ...clip, inMs: clip.outMs - srcOffset }
    : { ...clip, outMs: clip.inMs + srcOffset };
  const right: Clip = clip.reversed
    ? { ...clip, id: newId(), startMs: atMs, outMs: clip.outMs - srcOffset }
    : { ...clip, id: newId(), startMs: atMs, inMs: clip.inMs + srcOffset };
  const next = mapTrack(project, track.id, (t) => {
    const clips = t.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c]));
    return { ...t, clips: t.kind === 'video' ? pack(clips) : clips };
  });
  return { project: next, newClipId: right.id };
}

/** Removes everything before (`keep: 'after'`) or after (`keep: 'before'`) the playhead. */
export function trimToPlayhead(
  project: Project,
  clipId: string,
  atMs: number,
  keep: 'before' | 'after',
): Project {
  const split = splitClipAt(project, clipId, atMs);
  if (!split.newClipId) return project;
  const removeId = keep === 'after' ? clipId : split.newClipId;
  return deleteClip(split.project, removeId);
}

export function deleteClip(project: Project, clipId: string): Project {
  const found = findClip(project, clipId);
  if (!found) return project;
  return mapTrack(project, found.track.id, (t) => {
    const clips = t.clips.filter((c) => c.id !== clipId);
    return { ...t, clips: t.kind === 'video' ? pack(clips) : clips };
  });
}

export function duplicateClip(
  project: Project,
  clipId: string,
): { project: Project; newClipId: string | null } {
  const found = findClip(project, clipId);
  if (!found) return { project, newClipId: null };
  const { clip, track } = found;
  // On the main track the copy must sort right after the original (before the next clip,
  // which starts exactly at clipEndMs), hence the tiny offset; pack() then closes it up.
  const end = clipEndMs(clip);
  const copy: Clip = { ...clip, id: newId(), startMs: track.kind === 'video' ? end - 0.001 : end };
  const next = mapTrack(project, track.id, (t) => {
    const clips = [...t.clips, copy];
    return { ...t, clips: t.kind === 'video' ? pack(clips) : clips };
  });
  return { project: next, newClipId: copy.id };
}

export function setClipSpeed(project: Project, clipId: string, speed: number): Project {
  return withClipUpdate(project, clipId, (c) =>
    c.kind === 'image' || c.kind === 'gif' ? c : { ...c, speed: clamp(speed, MIN_SPEED, MAX_SPEED) },
  );
}

export function toggleReverse(project: Project, clipId: string): Project {
  return withClipUpdate(project, clipId, (c) =>
    c.kind === 'image' || c.kind === 'gif' ? c : { ...c, reversed: !c.reversed },
  );
}

export function setClipVolume(project: Project, clipId: string, volume: number): Project {
  return withClipUpdate(project, clipId, (c) => ({ ...c, volume: clamp(volume, 0, 2) }));
}

export function setClipTransform(
  project: Project,
  clipId: string,
  patch: Partial<Pick<Clip, 'x' | 'y' | 'scale'>>,
): Project {
  return withClipUpdate(project, clipId, (c) => ({
    ...c,
    x: clamp(patch.x ?? c.x, 0, 1),
    y: clamp(patch.y ?? c.y, 0, 1),
    scale: clamp(patch.scale ?? c.scale, 0.1, 1),
  }));
}

/** Sets (part of) the color grading of a clip; a fully neutral result removes the field. */
export function setClipAdjust(project: Project, clipId: string, patch: Partial<ClipAdjust>): Project {
  return withClipUpdate(project, clipId, (c) => {
    if (c.kind === 'audio') return c;
    const next = clampAdjust({ ...NEUTRAL_ADJUST, ...c.adjust, ...patch });
    if (isNeutral(next)) {
      const rest = { ...c };
      delete rest.adjust;
      return rest;
    }
    return { ...c, adjust: next };
  });
}

/**
 * Moves a clip. On the main track the clips are re-ordered (drop position decides the new
 * order, the track stays gap-free); on other tracks the clip is placed freely.
 */
export function moveClip(project: Project, clipId: string, newStartMs: number): Project {
  const found = findClip(project, clipId);
  if (!found) return project;
  const { track } = found;
  if (track.kind !== 'video') {
    return withClipUpdate(project, clipId, (c) => ({ ...c, startMs: Math.max(0, Math.round(newStartMs)) }));
  }
  return mapTrack(project, track.id, (t) => {
    const moved = t.clips.map((c) => (c.id === clipId ? { ...c, startMs: newStartMs } : c));
    return { ...t, clips: pack(moved, (c) => c.startMs + clipDurationMs(c) / 2) };
  });
}

// ---------------------------------------------------------------- texts / stickers

export function makeText(
  project: Project,
  patch: Partial<TextOverlay> & { text: string },
  atMs: number,
): { project: Project; textId: string | null } {
  const kind: TrackKind = patch.isSticker ? 'sticker' : 'text';
  const track = trackOf(project, kind);
  if (!track) return { project, textId: null };
  const start = Math.max(0, Math.round(atMs));
  const overlay: TextOverlay = {
    id: newId(),
    trackId: track.id,
    startMs: start,
    endMs: start + DEFAULT_TEXT_MS,
    fontFamily: 'system',
    fontSize: patch.isSticker ? 200 : 72,
    bold: true,
    align: 'center',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: patch.isSticker ? 0 : 4,
    backgroundColor: 'transparent',
    shadow: false,
    rotation: 0,
    x: 0.5,
    y: patch.isSticker ? 0.4 : 0.5,
    animation: 'none',
    isCaption: false,
    isSticker: false,
    ...patch,
  };
  return { project: { ...project, texts: [...project.texts, overlay] }, textId: overlay.id };
}

export function updateText(project: Project, textId: string, patch: Partial<TextOverlay>): Project {
  return {
    ...project,
    texts: project.texts.map((x) => {
      if (x.id !== textId) return x;
      const merged = { ...x, ...patch, id: x.id, trackId: x.trackId };
      merged.x = clamp(merged.x, 0, 1);
      merged.y = clamp(merged.y, 0, 1);
      if (merged.endMs - merged.startMs < MIN_CLIP_MS) merged.endMs = merged.startMs + MIN_CLIP_MS;
      return merged;
    }),
  };
}

export function deleteText(project: Project, textId: string): Project {
  return { ...project, texts: project.texts.filter((x) => x.id !== textId) };
}

export function duplicateText(project: Project, textId: string): { project: Project; newTextId: string | null } {
  const src = findText(project, textId);
  if (!src) return { project, newTextId: null };
  const copy: TextOverlay = { ...src, id: newId(), startMs: src.endMs, endMs: src.endMs + (src.endMs - src.startMs) };
  return { project: { ...project, texts: [...project.texts, copy] }, newTextId: copy.id };
}

export function moveText(project: Project, textId: string, newStartMs: number): Project {
  const t = findText(project, textId);
  if (!t) return project;
  const start = Math.max(0, Math.round(newStartMs));
  return updateText(project, textId, { startMs: start, endMs: start + (t.endMs - t.startMs) });
}

export function removeCaptions(project: Project): Project {
  return { ...project, texts: project.texts.filter((x) => !x.isCaption) };
}

// ---------------------------------------------------------------- layout helpers

/** Greedy lane assignment so overlapping items are drawn on separate rows. */
export function assignLanes<T extends { id: string }>(
  items: T[],
  range: (item: T) => { start: number; end: number },
): { lanes: Map<string, number>; laneCount: number } {
  const sorted = [...items].sort((a, b) => range(a).start - range(b).start);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const item of sorted) {
    const { start, end } = range(item);
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    lanes.set(item.id, lane);
  }
  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}

// ---------------------------------------------------------------- Premiere-style editing

/** Splits every clip and text under the playhead (like Premiere's "razor all tracks"). */
export function splitAllAt(project: Project, atMs: number): { project: Project; count: number } {
  let p = project;
  let count = 0;
  const ids = project.tracks.flatMap((t) => t.clips.map((c) => c.id));
  for (const id of ids) {
    const r = splitClipAt(p, id, atMs);
    if (r.newClipId) {
      p = r.project;
      count++;
    }
  }
  for (const x of project.texts) {
    const r = splitTextAt(p, x.id, atMs);
    if (r.newTextId) {
      p = r.project;
      count++;
    }
  }
  return { project: p, count };
}

export function splitTextAt(project: Project, textId: string, atMs: number): { project: Project; newTextId: string | null } {
  const src = findText(project, textId);
  if (!src || atMs <= src.startMs + MIN_CLIP_MS || atMs >= src.endMs - MIN_CLIP_MS) return { project, newTextId: null };
  const left: TextOverlay = { ...src, endMs: atMs };
  const right: TextOverlay = { ...src, id: newId(), startMs: atMs };
  return {
    project: { ...project, texts: project.texts.flatMap((x) => (x.id === textId ? [left, right] : [x])) },
    newTextId: right.id,
  };
}

/**
 * Drags one edge of a clip (ripple trim on the main track, plain trim elsewhere).
 * `toMs` is the wanted timeline position of the edge. Limits: source bounds and MIN_CLIP_MS.
 */
export function trimClipEdge(project: Project, clipId: string, edge: 'start' | 'end', toMs: number): Project {
  const found = findClip(project, clipId);
  if (!found) return project;
  const c = found.clip;
  const still = c.kind === 'image' || c.kind === 'gif';
  const start = c.startMs;
  const end = clipEndMs(c);
  const minLen = MIN_CLIP_MS;

  // wanted new length of the clip, in timeline ms
  let newLen: number;
  if (edge === 'start') newLen = end - Math.min(toMs, end - minLen);
  else newLen = Math.max(toMs, start + minLen) - start;
  newLen = Math.max(minLen, newLen);

  // the source range is anchored on the opposite edge (taking reverse into account)
  const srcLen = newLen * c.speed;
  const anchoredAtSourceStart = (edge === 'end') !== c.reversed; // keep inMs, change outMs
  let inMs = c.inMs;
  let outMs = c.outMs;
  if (still) {
    inMs = 0;
    outMs = clamp(srcLen, minLen, IMAGE_MAX_MS);
  } else if (anchoredAtSourceStart) {
    outMs = clamp(inMs + srcLen, inMs + minLen * c.speed, c.sourceDurationMs);
  } else {
    inMs = clamp(outMs - srcLen, 0, outMs - minLen * c.speed);
  }
  const trimmed: Clip = { ...c, inMs, outMs };
  const finalLen = clipDurationMs(trimmed);
  const startMs = edge === 'start' ? end - finalLen : c.startMs;
  return withClipUpdate(project, clipId, () => ({ ...trimmed, startMs: Math.max(0, startMs) }));
}

export function trimTextEdge(project: Project, textId: string, edge: 'start' | 'end', toMs: number): Project {
  const x = findText(project, textId);
  if (!x) return project;
  if (edge === 'start') return updateText(project, textId, { startMs: Math.max(0, Math.min(Math.round(toMs), x.endMs - MIN_CLIP_MS)) });
  return updateText(project, textId, { endMs: Math.max(Math.round(toMs), x.startMs + MIN_CLIP_MS) });
}

export type ClipboardItem = { type: 'clip'; clip: Clip } | { type: 'text'; text: TextOverlay };

export function copyItem(project: Project, sel: { type: 'clip' | 'text'; id: string } | null): ClipboardItem | null {
  if (!sel) return null;
  if (sel.type === 'clip') {
    const f = findClip(project, sel.id);
    return f ? { type: 'clip', clip: f.clip } : null;
  }
  const x = findText(project, sel.id);
  return x ? { type: 'text', text: x } : null;
}

/**
 * Pastes at the playhead. Main track: inserts between clips (splitting the clip under the playhead
 * and rippling the rest). Other tracks: placed at the playhead on the same kind of track.
 */
export function pasteItem(
  project: Project,
  item: ClipboardItem,
  atMs: number,
): { project: Project; id: string | null; type: 'clip' | 'text' } {
  const at = Math.max(0, atMs);
  if (item.type === 'text') {
    const track = project.tracks.find((t) => t.id === item.text.trackId) ?? trackOf(project, item.text.isSticker ? 'sticker' : 'text');
    const len = item.text.endMs - item.text.startMs;
    const copy: TextOverlay = { ...item.text, id: newId(), trackId: track?.id ?? item.text.trackId, startMs: at, endMs: at + len };
    return { project: { ...project, texts: [...project.texts, copy] }, id: copy.id, type: 'text' };
  }
  const kindTrack = project.tracks.find((t) => t.kind === (project.tracks.find((tr) => tr.id === item.clip.trackId)?.kind ?? 'video'));
  const track = kindTrack ?? trackOf(project, 'video');
  if (!track) return { project, id: null, type: 'clip' };
  const copy: Clip = { ...item.clip, id: newId(), trackId: track.id, startMs: at };
  if (track.kind !== 'video') {
    return { project: mapTrack(project, track.id, (t) => ({ ...t, clips: [...t.clips, copy] })), id: copy.id, type: 'clip' };
  }
  // main track: insert at a cut point
  let p = project;
  let boundary = at;
  const under = track.clips.find((c) => at > c.startMs && at < clipEndMs(c));
  if (under) {
    const r = splitClipAt(p, under.id, at);
    if (r.newClipId) p = r.project;
    else boundary = at - under.startMs < clipEndMs(under) - at ? under.startMs : clipEndMs(under); // too close to an edge: snap to it
  }
  const key = (c: Clip) => (c.id === copy.id ? boundary - 0.5 : c.startMs);
  p = mapTrack(p, track.id, (t) => ({ ...t, clips: pack([...t.clips, { ...copy, startMs: boundary }], key) }));
  return { project: p, id: copy.id, type: 'clip' };
}

/** Snaps `ms` to the nearest target within `thresholdMs` (or returns it unchanged). */
export function snapMs(ms: number, targets: number[], thresholdMs: number): number {
  let best = ms;
  let bestD = thresholdMs;
  for (const t of targets) {
    const d = Math.abs(t - ms);
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}
