import { cleanCaptionText, mapLinesToTimeline, normalizeWhisperTimes, polishLines, splitIntoCaptionLines } from '../src/captions/segments';
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

describe('caption quality', () => {
  it('removes non-speech tags', () => {
    expect(cleanCaptionText(' [موسيقى] hello (applause) world ♪ ')).toBe('hello world');
    expect(cleanCaptionText('[BLANK_AUDIO]')).toBe('');
    expect(cleanCaptionText('...')).toBe('');
  });
  it('splits at sentence punctuation and keeps lines short', () => {
    const lines = splitIntoCaptionLines([{ text: 'Hello everyone. Welcome to my channel today, we will learn something new!', startMs: 0, endMs: 8000 }]);
    expect(lines.length >= 3).toBe(true);
    for (const l of lines) expect(l.text.length <= 40).toBe(true);
    expect(lines[0]!.startMs).toBe(0);
    expect(lines[lines.length - 1]!.endMs).toBe(8000);
  });
  it('merges one-word crumbs', () => {
    const lines = splitIntoCaptionLines([{ text: 'No. I think so', startMs: 0, endMs: 3000 }]);
    expect(lines.map((l) => l.text)).toEqual(['No. I think so']);
  });
  it('drops repeated lines, fixes overlaps and too-short flashes', () => {
    const out = polishLines([
      { text: 'a b', startMs: 0, endMs: 1500 },
      { text: 'a b', startMs: 1500, endMs: 3000 },
      { text: 'c d', startMs: 2900, endMs: 3100 },
      { text: 'e f', startMs: 5000, endMs: 5100 },
    ]);
    expect(out.map((l) => l.text)).toEqual(['a b', 'c d', 'e f']);
    expect(out[0]!.endMs).toBe(2900);
    expect(out[2]!.endMs - out[2]!.startMs).toBe(600);
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
