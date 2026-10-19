import { mapLinesToTimeline, normalizeWhisperTimes, splitIntoCaptionLines } from '../src/captions/segments';
import { createEmptyProject } from '../src/models/project';
import { addMedia, findClip, setClipSpeed, toggleReverse } from '../src/editor/timeline';

describe('normalizeWhisperTimes', () => {
  it('treats values as 10ms units for normal ranges', () => {
    const r = normalizeWhisperTimes([{ text: 'a', t0: 0, t1: 250 }], 3000);
    expect(r[0]!.endMs).toBe(2500);
  });
  it('does not scale if the runtime already returns milliseconds', () => {
    const r = normalizeWhisperTimes([{ text: 'a', t0: 0, t1: 25000 }], 26000);
    expect(r[0]!.endMs).toBe(25000);
  });
});

describe('splitIntoCaptionLines', () => {
  it('splits long segments in balanced lines that cover the whole duration', () => {
    const lines = splitIntoCaptionLines([{ text: 'one two three four five six seven eight', startMs: 1000, endMs: 5000 }], 4);
    expect(lines.map((l) => l.text)).toEqual(['one two three four', 'five six seven eight']);
    expect(lines[0]!.startMs).toBe(1000);
    expect(lines[1]!.endMs).toBe(5000);
    expect(lines[0]!.endMs).toBe(lines[1]!.startMs);
  });
  it('keeps arabic text and ignores empty segments', () => {
    const lines = splitIntoCaptionLines([
      { text: '  ', startMs: 0, endMs: 1000 },
      { text: 'مرحبا بكم في التطبيق', startMs: 0, endMs: 2000 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe('مرحبا بكم في التطبيق');
  });
});

describe('mapLinesToTimeline', () => {
  it('maps source time to timeline time using clip start, trim and speed', () => {
    let p = createEmptyProject('t');
    const r = addMedia(p, { kind: 'video', uri: 'file:///a.mp4', name: 'a', durationMs: 10000 }, 'main');
    p = setClipSpeed(r.project, r.clipId!, 2);
    const clip = findClip(p, r.clipId!)!.clip;
    const mapped = mapLinesToTimeline([{ text: 'x', startMs: 2000, endMs: 4000 }], clip);
    expect(mapped).toEqual([{ text: 'x', startMs: 1000, endMs: 2000 }]);
  });
  it('drops lines outside the trimmed range and reversed clips', () => {
    let p = createEmptyProject('t');
    const r = addMedia(p, { kind: 'video', uri: 'file:///a.mp4', name: 'a', durationMs: 4000 }, 'main');
    const clip = findClip(r.project, r.clipId!)!.clip;
    expect(mapLinesToTimeline([{ text: 'x', startMs: 5000, endMs: 6000 }], clip)).toEqual([]);
    const rev = findClip(toggleReverse(r.project, r.clipId!), r.clipId!)!.clip;
    expect(mapLinesToTimeline([{ text: 'x', startMs: 0, endMs: 1000 }], rev)).toEqual([]);
  });
});
