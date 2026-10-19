import { createEmptyProject, clipDurationMs, projectDurationMs } from '../src/models/project';
import type { Project } from '../src/types';
import {
  addMedia,
  assignLanes,
  deleteClip,
  duplicateClip,
  findClip,
  moveClip,
  setClipSpeed,
  sourceTimeMs,
  splitClipAt,
  toggleReverse,
  trackOf,
  trimToPlayhead,
  makeText,
  updateText,
  moveText,
  removeCaptions,
} from '../src/editor/timeline';

const vid = (name: string, durationMs: number) => ({ kind: 'video' as const, uri: `file:///${name}.mp4`, name, durationMs });

function withThree(): { p: Project; ids: string[] } {
  let p = createEmptyProject('t');
  const ids: string[] = [];
  for (const [n, d] of [['a', 4000], ['b', 2000], ['c', 6000]] as const) {
    const r = addMedia(p, vid(n, d), 'main');
    p = r.project;
    ids.push(r.clipId!);
  }
  return { p, ids };
}
const main = (p: Project) => trackOf(p, 'video')!.clips.slice().sort((a, b) => a.startMs - b.startMs);

describe('addMedia', () => {
  it('appends to the main track end-to-end', () => {
    const { p } = withThree();
    expect(main(p).map((c) => c.startMs)).toEqual([0, 4000, 6000]);
    expect(projectDurationMs(p)).toBe(12000);
  });

  it('images get a default duration and can stretch', () => {
    const r = addMedia(createEmptyProject('t'), { kind: 'image', uri: 'file:///i.png', name: 'i', durationMs: 0 }, 'main');
    const c = findClip(r.project, r.clipId!)!.clip;
    expect(clipDurationMs(c)).toBe(3000);
    expect(c.sourceDurationMs).toBeGreaterThan(60_000);
  });

  it('overlay and audio clips use the requested start', () => {
    const r = addMedia(createEmptyProject('t'), vid('o', 2000), 'overlay', 1500);
    expect(findClip(r.project, r.clipId!)!.clip.startMs).toBe(1500);
    expect(findClip(r.project, r.clipId!)!.clip.scale).toBe(0.5);
  });
});

describe('splitClipAt', () => {
  it('splits a normal clip into two contiguous halves', () => {
    const { p, ids } = withThree();
    const r = splitClipAt(p, ids[0]!, 1000);
    expect(r.newClipId).not.toBeNull();
    const [l, rt] = main(r.project);
    expect(l!.inMs).toBe(0);
    expect(l!.outMs).toBe(1000);
    expect(rt!.inMs).toBe(1000);
    expect(rt!.outMs).toBe(4000);
    expect(rt!.startMs).toBe(1000);
    expect(projectDurationMs(r.project)).toBe(12000);
  });

  it('respects speed when splitting', () => {
    const { p, ids } = withThree();
    const fast = setClipSpeed(p, ids[0]!, 2); // 4000ms source -> 2000ms on timeline
    const r = splitClipAt(fast, ids[0]!, 500);
    const [l, rt] = main(r.project);
    expect(l!.outMs).toBe(1000); // 500ms timeline * 2
    expect(rt!.inMs).toBe(1000);
    expect(clipDurationMs(l!)).toBe(500);
  });

  it('splits reversed clips so the first half on the timeline is the end of the source', () => {
    const { p, ids } = withThree();
    const rev = toggleReverse(p, ids[0]!);
    const r = splitClipAt(rev, ids[0]!, 1000);
    const [l, rt] = main(r.project);
    expect(l!.inMs).toBe(3000);
    expect(l!.outMs).toBe(4000);
    expect(rt!.inMs).toBe(0);
    expect(rt!.outMs).toBe(3000);
    // continuity: the frame at the cut is the same source time for both halves
    expect(sourceTimeMs(l!, 1000)).toBe(3000);
    expect(sourceTimeMs(rt!, 1000)).toBe(3000);
  });

  it('refuses to split at the edges', () => {
    const { p, ids } = withThree();
    expect(splitClipAt(p, ids[0]!, 0).newClipId).toBeNull();
    expect(splitClipAt(p, ids[0]!, 4000).newClipId).toBeNull();
    expect(splitClipAt(p, ids[0]!, 50).newClipId).toBeNull();
  });
});

describe('trimToPlayhead', () => {
  it('keeps only the part after the playhead and closes the gap', () => {
    const { p, ids } = withThree();
    const r = trimToPlayhead(p, ids[0]!, 1000, 'after');
    expect(main(r).map((c) => [c.startMs, clipDurationMs(c)])).toEqual([[0, 3000], [3000, 2000], [5000, 6000]]);
  });

  it('keeps only the part before the playhead', () => {
    const { p, ids } = withThree();
    const r = trimToPlayhead(p, ids[0]!, 1000, 'before');
    expect(main(r).map((c) => clipDurationMs(c))).toEqual([1000, 2000, 6000]);
  });
});

describe('delete / duplicate / speed / move', () => {
  it('deleting on the main track ripples', () => {
    const { p, ids } = withThree();
    const r = deleteClip(p, ids[1]!);
    expect(main(r).map((c) => c.startMs)).toEqual([0, 4000]);
  });

  it('duplicating inserts a copy right after the original', () => {
    const { p, ids } = withThree();
    const r = duplicateClip(p, ids[0]!);
    const m = main(r.project);
    expect(m).toHaveLength(4);
    expect(m.map((c) => c.startMs)).toEqual([0, 4000, 8000, 10000]);
    expect(m[1]!.id).toBe(r.newClipId);
    expect(m[1]!.sourceUri).toBe(m[0]!.sourceUri);
  });

  it('speed changes the timeline length and ripples; it is clamped', () => {
    const { p, ids } = withThree();
    const r = setClipSpeed(p, ids[0]!, 2);
    expect(main(r).map((c) => c.startMs)).toEqual([0, 2000, 4000]);
    expect(findClip(setClipSpeed(p, ids[0]!, 99), ids[0]!)!.clip.speed).toBe(4);
    expect(findClip(setClipSpeed(p, ids[0]!, 0.01), ids[0]!)!.clip.speed).toBe(0.25);
  });

  it('speed and reverse are ignored for images', () => {
    const r = addMedia(createEmptyProject('t'), { kind: 'image', uri: 'file:///i.png', name: 'i', durationMs: 0 }, 'main');
    const id = r.clipId!;
    expect(findClip(setClipSpeed(r.project, id, 2), id)!.clip.speed).toBe(1);
    expect(findClip(toggleReverse(r.project, id), id)!.clip.reversed).toBe(false);
  });

  it('moving a main-track clip re-orders by drop position', () => {
    const { p, ids } = withThree();
    const r = moveClip(p, ids[0]!, 8000); // drop "a" past the middle of "c"
    expect(main(r).map((c) => c.name)).toEqual(['b', 'c', 'a']);
    expect(main(r).map((c) => c.startMs)).toEqual([0, 2000, 8000]);
  });

  it('moving an overlay clip is free and clamped at 0', () => {
    const o = addMedia(createEmptyProject('t'), vid('o', 2000), 'overlay', 1000);
    expect(findClip(moveClip(o.project, o.clipId!, 5000), o.clipId!)!.clip.startMs).toBe(5000);
    expect(findClip(moveClip(o.project, o.clipId!, -300), o.clipId!)!.clip.startMs).toBe(0);
  });
});

describe('sourceTimeMs', () => {
  it('maps timeline time to source time with speed', () => {
    const { p, ids } = withThree();
    const fast = findClip(setClipSpeed(p, ids[1]!, 2), ids[1]!)!.clip; // b: start 4000
    expect(sourceTimeMs(fast, 4500)).toBe(1000);
  });
});

describe('texts', () => {
  it('creates, updates, moves and removes captions', () => {
    let p = createEmptyProject('t');
    const r = makeText(p, { text: 'hello', isCaption: true }, 2000);
    p = r.project;
    const t = p.texts[0]!;
    expect(t.startMs).toBe(2000);
    expect(t.endMs).toBe(5000);
    p = updateText(p, r.textId!, { color: '#ff0000', x: 4 });
    expect(p.texts[0]!.color).toBe('#ff0000');
    expect(p.texts[0]!.x).toBe(1);
    p = moveText(p, r.textId!, 6000);
    expect([p.texts[0]!.startMs, p.texts[0]!.endMs]).toEqual([6000, 9000]);
    p = removeCaptions(p);
    expect(p.texts).toHaveLength(0);
  });

  it('stickers go to the sticker track', () => {
    const r = makeText(createEmptyProject('t'), { text: '😀', isSticker: true }, 0);
    expect(r.project.texts[0]!.trackId).toBe(trackOf(r.project, 'sticker')!.id);
  });
});

describe('assignLanes', () => {
  it('puts overlapping items on different lanes', () => {
    const items = [
      { id: 'a', s: 0, e: 1000 },
      { id: 'b', s: 500, e: 1500 },
      { id: 'c', s: 1000, e: 2000 },
    ];
    const { lanes, laneCount } = assignLanes(items, (i) => ({ start: i.s, end: i.e }));
    expect(laneCount).toBe(2);
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
    expect(lanes.get('c')).toBe(0);
  });
});
