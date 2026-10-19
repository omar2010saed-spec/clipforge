import { createEmptyProject, duplicateProject, projectClipCount, projectDurationMs } from '../src/models/project';
import { addMedia, makeText } from '../src/editor/timeline';

describe('createEmptyProject', () => {
  it('creates the five tracks and the right canvas size', () => {
    const p = createEmptyProject('  Demo  ', '16:9', 1000);
    expect(p.name).toBe('Demo');
    expect(p.width).toBe(1920);
    expect(p.height).toBe(1080);
    expect(p.tracks.map((t) => t.kind)).toEqual(['video', 'overlay', 'audio', 'text', 'sticker']);
    expect(p.createdAt).toBe(1000);
  });
});

describe('durations', () => {
  it('accounts for clip speed and texts', () => {
    let p = createEmptyProject('x');
    p = addMedia(p, { kind: 'video', uri: 'file:///a.mp4', name: 'a', durationMs: 4000 }, 'main').project;
    expect(projectDurationMs(p)).toBe(4000);
    expect(projectClipCount(p)).toBe(1);
    p = makeText(p, { text: 'hi', startMs: 3000, endMs: 9000 }, 3000).project;
    expect(projectDurationMs(p)).toBe(9000);
  });

  it('is zero for an empty project', () => {
    expect(projectDurationMs(createEmptyProject('x'))).toBe(0);
  });
});

describe('duplicateProject', () => {
  it('assigns new ids and keeps text tracks linked', () => {
    let base = createEmptyProject('Orig');
    base = addMedia(base, { kind: 'video', uri: 'file:///a.mp4', name: 'a', durationMs: 4000 }, 'main').project;
    base = makeText(base, { text: 'hi' }, 0).project;
    const textTrack = base.tracks.find((t) => t.kind === 'text')!;
    const copy = duplicateProject(base, '(copy)');
    expect(copy.id).not.toBe(base.id);
    expect(copy.name).toBe('Orig (copy)');
    const newTextTrack = copy.tracks.find((t) => t.kind === 'text')!;
    expect(newTextTrack.id).not.toBe(textTrack.id);
    expect(copy.texts[0]!.trackId).toBe(newTextTrack.id);
    const newVideo = copy.tracks.find((t) => t.kind === 'video')!;
    expect(newVideo.clips[0]!.trackId).toBe(newVideo.id);
  });
});
