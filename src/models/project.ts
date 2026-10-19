import type { Clip, Project, Track, TrackKind } from '../types';
import { newId } from '../utils/id';

export type AspectKey = '9:16' | '16:9' | '1:1';

export const ASPECTS: Record<AspectKey, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

export const MAX_NAME_LENGTH = 60;

export const TRACK_ORDER: TrackKind[] = ['video', 'overlay', 'audio', 'text', 'sticker'];

export function createEmptyProject(
  name: string,
  aspect: AspectKey = '9:16',
  now: number = Date.now(),
): Project {
  const tracks: Track[] = TRACK_ORDER.map((kind) => ({
    id: newId(),
    kind,
    clips: [],
    muted: false,
    locked: false,
  }));
  const { width, height } = ASPECTS[aspect];
  return {
    id: newId(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    width,
    height,
    fps: 30,
    tracks,
    texts: [],
  };
}

/** Duration of a clip on the timeline, taking speed into account. */
export function clipDurationMs(clip: Clip): number {
  const span = Math.max(0, clip.outMs - clip.inMs);
  return clip.speed > 0 ? span / clip.speed : 0;
}

export function clipEndMs(clip: Clip): number {
  return clip.startMs + clipDurationMs(clip);
}

export function projectDurationMs(project: Project): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clipEndMs(clip));
  }
  for (const text of project.texts) end = Math.max(end, text.endMs);
  return Math.round(end);
}

export function projectClipCount(project: Project): number {
  return project.tracks.reduce((sum, t) => sum + t.clips.length, 0);
}

/** Deep copy with fresh ids everywhere, keeping text->track links intact. */
export function duplicateProject(
  project: Project,
  suffix: string,
  now: number = Date.now(),
): Project {
  const trackIds = new Map<string, string>();
  const tracks = project.tracks.map((t) => {
    const id = newId();
    trackIds.set(t.id, id);
    return { ...t, id, clips: t.clips.map((c) => ({ ...c, id: newId(), trackId: id })) };
  });
  const texts = project.texts.map((x) => ({
    ...x,
    id: newId(),
    trackId: trackIds.get(x.trackId) ?? x.trackId,
  }));
  return {
    ...project,
    id: newId(),
    name: `${project.name} ${suffix}`.trim(),
    createdAt: now,
    updatedAt: now,
    tracks,
    texts,
  };
}
