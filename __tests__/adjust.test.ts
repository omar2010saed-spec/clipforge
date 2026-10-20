import { createEmptyProject } from '../src/models/project';
import { addMedia, findClip, setClipAdjust, splitClipAt } from '../src/editor/timeline';
import { adjustFilter, clampAdjust, isNeutral, matchingPreset, previewTints, PRESETS } from '../src/editor/adjust';
import { buildExportPlan } from '../src/export/plan';

const ctx = { textImages: {}, outputPath: '/tmp/o.mp4', encoder: 'software' as const, platform: 'android' as const };
const settings = { format: 'mp4' as const, codec: 'h264' as const, preset: '720p' as const, fps: 30 as const };

function one() {
  const r = addMedia(createEmptyProject('t', '9:16'), { kind: 'video', uri: 'file:///a.mp4', name: 'a', durationMs: 4000 }, 'main');
  return { p: r.project, id: r.clipId! };
}

describe('color adjust', () => {
  it('neutral produces no filter and no field', () => {
    expect(adjustFilter(undefined)).toBeNull();
    const { p, id } = one();
    expect(findClip(setClipAdjust(p, id, {}), id)!.clip.adjust).toBe(undefined);
  });

  it('clamps values and builds eq / colorbalance filters', () => {
    expect(clampAdjust({ brightness: 5, contrast: 0, saturation: 9, warmth: -3 })).toEqual({ brightness: 1, contrast: 0.3, saturation: 2, warmth: -1 });
    expect(adjustFilter({ brightness: 0.5, contrast: 1.2, saturation: 0, warmth: 0 })).toBe('eq=brightness=0.2:contrast=1.2:saturation=0');
    expect(adjustFilter({ brightness: 0, contrast: 1, saturation: 1, warmth: 1 })).toBe('colorbalance=rs=0.25:rm=0.25:rh=0.25:bs=-0.25:bm=-0.25:bh=-0.25');
  });

  it('setting back to neutral removes the adjustment; presets round-trip', () => {
    const { p, id } = one();
    let q = setClipAdjust(p, id, { saturation: 0 });
    expect(matchingPreset(findClip(q, id)!.clip.adjust)).toBeNull(); // brightness etc. neutral but contrast 1,sat 0 != bw preset
    q = setClipAdjust(q, id, PRESETS.bw!);
    expect(matchingPreset(findClip(q, id)!.clip.adjust)).toBe('bw');
    q = setClipAdjust(q, id, PRESETS.none!);
    expect(findClip(q, id)!.clip.adjust).toBe(undefined);
    expect(isNeutral(findClip(q, id)!.clip.adjust)).toBe(true);
  });

  it('survives splitting and reaches the export graph', () => {
    const { p, id } = one();
    const g = setClipAdjust(p, id, { brightness: 0.2, saturation: 1.4 });
    const r = splitClipAt(g, id, 2000);
    expect(findClip(r.project, r.newClipId!)!.clip.adjust!.saturation).toBe(1.4);
    const plan = buildExportPlan(r.project, settings, ctx);
    const graph = plan.args[plan.args.indexOf('-filter_complex') + 1]!;
    expect(graph.split('eq=brightness=0.08:contrast=1:saturation=1.4').length - 1).toBe(2);
  });

  it('preview tints are empty for neutral and scale with the values', () => {
    expect(previewTints(undefined)).toEqual([]);
    const t = previewTints({ brightness: 0.5, contrast: 1, saturation: 1, warmth: -1 });
    expect(t.map((x) => x.color)).toEqual(['rgb(60,140,255)', 'rgb(255,255,255)']);
  });
});
