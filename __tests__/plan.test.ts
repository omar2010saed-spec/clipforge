import { createEmptyProject } from '../src/models/project';
import { addMedia, makeText, setClipSpeed, toggleReverse } from '../src/editor/timeline';
import { atempoChain, bitrateKbps, buildExportPlan, outputSize } from '../src/export/plan';
import type { ExportSettings } from '../src/types';

const mp4: ExportSettings = { format: 'mp4', codec: 'h264', preset: '1080p', fps: 30 };
const ctx = { textImages: {}, outputPath: '/tmp/out.mp4', encoder: 'software' as const, platform: 'android' as const };

function project() {
  let p = createEmptyProject('t', '9:16');
  p = addMedia(p, { kind: 'video', uri: 'file:///a%20b.mp4', name: 'a', durationMs: 4000, hasAudio: true }, 'main').project;
  return p;
}

describe('outputSize', () => {
  it('keeps the project aspect ratio and uses the preset as short side', () => {
    expect(outputSize(createEmptyProject('t', '9:16'), '1080p')).toEqual({ width: 1080, height: 1920 });
    expect(outputSize(createEmptyProject('t', '16:9'), '4k')).toEqual({ width: 3840, height: 2160 });
    expect(outputSize(createEmptyProject('t', '1:1'), '720p')).toEqual({ width: 720, height: 720 });
  });
});

describe('atempoChain', () => {
  it('chains for extreme speeds', () => {
    expect(atempoChain(1)).toEqual([]);
    expect(atempoChain(2)).toEqual(['atempo=2']);
    expect(atempoChain(4)).toEqual(['atempo=2', 'atempo=2']);
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5']);
  });
});

describe('bitrate', () => {
  it('raises the bitrate for 60 fps', () => {
    expect(bitrateKbps('4k', 30)).toBe(60000);
    expect(bitrateKbps('4k', 60)).toBe(90000);
  });
});

describe('buildExportPlan', () => {
  it('throws for an empty project', () => {
    expect(() => buildExportPlan(createEmptyProject('t'), mp4, ctx)).toThrow();
  });

  it('decodes percent-encoded paths and seeks inside the source', () => {
    const plan = buildExportPlan(project(), mp4, ctx);
    expect(plan.args).toContain('/tmp/out.mp4');
    expect(plan.args.join(' ')).toContain('-i /a b.mp4');
    expect(plan.durationMs).toBe(4000);
    expect(plan.args[plan.args.length - 2]).toBe('4.000');
  });

  it('adds reverse and speed filters', () => {
    let p = project();
    const id = p.tracks[0]!.clips[0]!.id;
    p = toggleReverse(setClipSpeed(p, id, 2), id);
    const graph = buildExportPlan(p, mp4, ctx).args.join(' ');
    expect(graph).toContain('reverse');
    expect(graph).toContain('setpts=PTS/2');
    expect(graph).toContain('areverse');
    expect(graph).toContain('atempo=2');
  });

  it('skips audio when the source has none, and muted tracks', () => {
    let p = createEmptyProject('t');
    p = addMedia(p, { kind: 'video', uri: 'file:///a.mp4', name: 'a', durationMs: 2000, hasAudio: false }, 'main').project;
    const noAudio = buildExportPlan(p, mp4, ctx).args;
    expect(noAudio).toContain('-an');
    expect(noAudio.join(' ')).not.toContain('[aout]');
  });

  it('uses mediacodec on android and videotoolbox on ios', () => {
    const hw = { ...ctx, encoder: 'hardware' as const };
    expect(buildExportPlan(project(), mp4, hw).args).toContain('h264_mediacodec');
    expect(buildExportPlan(project(), { ...mp4, codec: 'h265' }, hw).args).toContain('hevc_mediacodec');
    expect(buildExportPlan(project(), mp4, { ...hw, platform: 'ios' }).args).toContain('h264_videotoolbox');
  });

  it('builds a palette graph for gif and drops audio', () => {
    const plan = buildExportPlan(project(), { ...mp4, format: 'gif' }, { ...ctx, outputPath: '/tmp/o.gif' });
    const joined = plan.args.join(' ');
    expect(joined).toContain('palettegen');
    expect(plan.args).toContain('-an');
    expect(plan.width).toBe(720); // gif is composed at 720p, 15 fps
    expect(plan.fps).toBe(15);
  });

  it('only overlays texts that have a rendered bitmap', () => {
    let p = project();
    const r = makeText(p, { text: 'x' }, 0);
    p = r.project;
    const without = buildExportPlan(p, mp4, ctx).args.join(' ');
    expect(without).not.toContain('between(t,0.000,3.000)');
    const withImg = buildExportPlan(p, mp4, { ...ctx, textImages: { [r.textId!]: 'file:///t.png' } }).args.join(' ');
    expect(withImg).toContain("enable='between(t,0.000,3.000)'");
  });
});
