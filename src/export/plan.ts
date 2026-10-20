/**
 * Pure builder for the FFmpeg command that renders a Project.
 * Input: project + export settings + already-rendered text bitmaps.
 * Output: the argument list (no shell involved), total duration and output size.
 */
import type { Clip, ExportPresetKey, ExportSettings, Project, TextOverlay } from '../types';
import { EXPORT_PRESETS } from '../types';
import { clipDurationMs, clipEndMs, projectDurationMs } from '../models/project';
import { trackOf } from '../editor/timeline';
import { adjustFilter } from '../editor/adjust';
import { uriToPath } from '../utils/path';

export type EncoderMode = 'hardware' | 'software';
export type Platform = 'android' | 'ios';

export interface PlanContext {
  /** Local path of a transparent PNG for every text / sticker overlay, keyed by overlay id. */
  textImages: Record<string, string>;
  outputPath: string;
  encoder: EncoderMode;
  platform: Platform;
}

export interface ExportPlan {
  args: string[];
  durationMs: number;
  width: number;
  height: number;
  fps: number;
}

export const GIF_FPS = 15;
export const GIF_SHORT_SIDE = 480;
const FADE_S = 0.3;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const sec = (ms: number) => (ms / 1000).toFixed(3);
const num = (n: number) => String(Number(n.toFixed(4)));

export function effectivePreset(settings: ExportSettings): ExportPresetKey {
  return settings.format === 'gif' ? '720p' : settings.preset;
}

export function effectiveFps(settings: ExportSettings): number {
  return settings.format === 'gif' ? GIF_FPS : settings.fps;
}

/** Canvas size for a preset: the preset names the short side, the project's aspect is kept. */
export function outputSize(project: Project, preset: ExportPresetKey): { width: number; height: number } {
  const short = EXPORT_PRESETS[preset].shortSide;
  if (project.width <= project.height) {
    return { width: even(short), height: even((short * project.height) / project.width) };
  }
  return { width: even((short * project.width) / project.height), height: even(short) };
}

export function exportSize(project: Project, settings: ExportSettings) {
  return outputSize(project, effectivePreset(settings));
}

export function bitrateKbps(preset: ExportPresetKey, fps: number): number {
  const base = EXPORT_PRESETS[preset].bitrateKbps;
  return Math.round(fps > 30 ? base * 1.5 : base);
}

/** atempo only accepts 0.5..2 per instance, so chain several for extreme speeds. */
export function atempoChain(speed: number): string[] {
  if (speed === 1) return [];
  const parts: string[] = [];
  let s = speed;
  while (s < 0.5) {
    parts.push('atempo=0.5');
    s /= 0.5;
  }
  while (s > 2) {
    parts.push('atempo=2');
    s /= 2;
  }
  parts.push(`atempo=${num(s)}`);
  return parts;
}

interface AudioSpec {
  label: string;
  clip: Clip;
  inputIndex: number;
}

export function buildExportPlan(project: Project, settings: ExportSettings, ctx: PlanContext): ExportPlan {
  const total = projectDurationMs(project);
  if (total <= 0) throw new Error('empty-project');

  const { width: W, height: H } = exportSize(project, settings);
  const fps = effectiveFps(settings);
  const isGif = settings.format === 'gif';

  const inputs: string[] = [];
  let inputCount = 0;
  const addInput = (args: string[]): number => {
    inputs.push(...args);
    return inputCount++;
  };

  const filters: string[] = [];
  const audioSpecs: AudioSpec[] = [];

  // 0: black canvas
  addInput(['-f', 'lavfi', '-t', sec(total), '-i', `color=c=black:s=${W}x${H}:r=${fps}`]);

  /** Adds the input for a clip and returns its index. */
  const addClipInput = (clip: Clip): number => {
    const path = uriToPath(clip.sourceUri);
    const dur = sec(clipDurationMs(clip));
    if (clip.kind === 'image') return addInput(['-loop', '1', '-framerate', String(fps), '-t', dur, '-i', path]);
    if (clip.kind === 'gif') return addInput(['-stream_loop', '-1', '-t', dur, '-i', path]);
    const span = sec(clip.outMs - clip.inMs);
    return addInput(['-ss', sec(clip.inMs), '-t', span, '-i', path]);
  };

  const timeChain = (clip: Clip): string => {
    if (clip.kind === 'image' || clip.kind === 'gif') return `fps=${fps}`;
    const parts = ['setpts=PTS-STARTPTS'];
    if (clip.reversed) parts.push('reverse');
    if (clip.speed !== 1) parts.push(`setpts=PTS/${num(clip.speed)}`);
    parts.push(`fps=${fps}`);
    return parts.join(',');
  };

  /** ",eq=...,colorbalance=..." (leading comma) or "" when the clip has no color grading. */
  const gradeChain = (clip: Clip): string => {
    const f = adjustFilter(clip.adjust);
    return f ? `,${f}` : '';
  };

  const registerAudio = (clip: Clip, inputIndex: number, muted: boolean) => {
    if (muted || clip.volume <= 0 || clip.hasAudio === false) return;
    if (clip.kind === 'image' || clip.kind === 'gif') return;
    audioSpecs.push({ label: `a${audioSpecs.length}`, clip, inputIndex });
  };

  // ---- main track: scaled, padded, concatenated
  const mainTrack = trackOf(project, 'video');
  const mainClips = [...(mainTrack?.clips ?? [])].sort((a, b) => a.startMs - b.startMs);
  const mainLabels: string[] = [];
  mainClips.forEach((clip, i) => {
    const idx = addClipInput(clip);
    const label = `m${i}`;
    filters.push(
      `[${idx}:v]${timeChain(clip)},scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1${gradeChain(clip)},format=yuv420p[${label}]`,
    );
    mainLabels.push(label);
    registerAudio(clip, idx, mainTrack?.muted ?? false);
  });

  let current = 'base0';
  if (mainLabels.length === 0) {
    filters.push(`[0:v]null[${current}]`);
  } else {
    let mainOut: string;
    if (mainLabels.length === 1) {
      mainOut = mainLabels[0] as string;
    } else {
      mainOut = 'mainv';
      filters.push(`${mainLabels.map((l) => `[${l}]`).join('')}concat=n=${mainLabels.length}:v=1:a=0[${mainOut}]`);
    }
    filters.push(`[0:v][${mainOut}]overlay=x=0:y=0:eof_action=pass[${current}]`);
  }

  let step = 0;
  const nextLabel = () => `b${++step}`;

  // ---- overlay clips (picture-in-picture)
  const overlayTrack = trackOf(project, 'overlay');
  const overlayClips = [...(overlayTrack?.clips ?? [])].sort((a, b) => a.startMs - b.startMs);
  overlayClips.forEach((clip, i) => {
    const idx = addClipInput(clip);
    const ow = even(W * clip.scale);
    const s = sec(clip.startMs);
    const e = sec(clipEndMs(clip));
    const label = `o${i}`;
    // fitted into an ow x ow square, exactly like the preview
    filters.push(
      `[${idx}:v]${timeChain(clip)},scale=${ow}:${ow}:force_original_aspect_ratio=decrease:force_divisible_by=2${gradeChain(clip)},setpts=PTS+${s}/TB[${label}]`,
    );
    const out = nextLabel();
    filters.push(
      `[${current}][${label}]overlay=x=${Math.round(clip.x * W)}-w/2:y=${Math.round(clip.y * H)}-h/2:` +
        `eof_action=pass:enable='between(t,${s},${e})'[${out}]`,
    );
    current = out;
    registerAudio(clip, idx, overlayTrack?.muted ?? false);
  });

  // ---- text + stickers (pre-rendered transparent PNGs)
  const texts: TextOverlay[] = [...project.texts]
    .filter((t) => ctx.textImages[t.id] !== undefined)
    .sort((a, b) => a.startMs - b.startMs);
  texts.forEach((t, i) => {
    const png = ctx.textImages[t.id] as string;
    const idx = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(t.endMs - t.startMs), '-i', uriToPath(png)]);
    const s = sec(t.startMs);
    const e = sec(t.endMs);
    const chain: string[] = ['format=rgba'];
    if (t.rotation % 360 !== 0) {
      const rad = num((t.rotation * Math.PI) / 180);
      chain.push(`rotate=${rad}:ow=rotw(${rad}):oh=roth(${rad}):c=none`);
    }
    chain.push(`setpts=PTS-STARTPTS+${s}/TB`);
    if (t.animation === 'fade') {
      const d = Math.min(FADE_S, (t.endMs - t.startMs) / 2000);
      chain.push(`fade=t=in:st=${s}:d=${num(d)}:alpha=1`);
      chain.push(`fade=t=out:st=${num(t.endMs / 1000 - d)}:d=${num(d)}:alpha=1`);
    }
    const label = `t${i}`;
    filters.push(`[${idx}:v]${chain.join(',')}[${label}]`);
    const out = nextLabel();
    const cy = Math.round(t.y * H);
    const yExpr =
      t.animation === 'slideUp'
        ? `y='${cy}-h/2+${Math.round(H * 0.03)}*max(0,1-(t-${s})/${FADE_S})'`
        : `y=${cy}-h/2`;
    filters.push(
      `[${current}][${label}]overlay=x=${Math.round(t.x * W)}-w/2:${yExpr}:eof_action=pass:enable='between(t,${s},${e})'[${out}]`,
    );
    current = out;
  });

  // ---- audio clips on the audio track
  const audioTrack = trackOf(project, 'audio');
  for (const clip of [...(audioTrack?.clips ?? [])].sort((a, b) => a.startMs - b.startMs)) {
    if (audioTrack?.muted || clip.volume <= 0) continue;
    const idx = addClipInput(clip);
    registerAudio(clip, idx, false);
  }

  // ---- final video label
  if (isGif) {
    const gw = W <= H ? GIF_SHORT_SIDE : even((GIF_SHORT_SIDE * W) / H);
    const gh = W <= H ? even((GIF_SHORT_SIDE * H) / W) : GIF_SHORT_SIDE;
    filters.push(
      `[${current}]fps=${GIF_FPS},scale=${gw}:${gh}:flags=lanczos,split[g1][g2];` +
        `[g1]palettegen=stats_mode=diff[pal];[g2][pal]paletteuse=dither=bayer:bayer_scale=5[vout]`,
    );
  } else {
    filters.push(`[${current}]format=yuv420p[vout]`);
  }

  // ---- audio graph (mp4 only)
  let hasAudio = false;
  if (!isGif && audioSpecs.length > 0) {
    hasAudio = true;
    for (const a of audioSpecs) {
      const c = a.clip;
      const parts = ['asetpts=PTS-STARTPTS'];
      if (c.reversed) parts.push('areverse');
      parts.push(...atempoChain(c.speed));
      parts.push(`volume=${num(c.volume)}`);
      parts.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');
      const delay = Math.round(c.startMs);
      if (delay > 0) parts.push(`adelay=${delay}|${delay}`);
      filters.push(`[${a.inputIndex}:a]${parts.join(',')}[${a.label}]`);
    }
    if (audioSpecs.length === 1) {
      filters.push(`[${(audioSpecs[0] as AudioSpec).label}]anull[aout]`);
    } else {
      filters.push(
        `${audioSpecs.map((a) => `[${a.label}]`).join('')}amix=inputs=${audioSpecs.length}:duration=longest:dropout_transition=0[aout]`,
      );
    }
  }

  // ---- output
  const out: string[] = ['-map', '[vout]'];
  if (isGif) {
    out.push('-an', '-loop', '0', '-f', 'gif');
  } else {
    if (hasAudio) out.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
    else out.push('-an');
    out.push(...videoEncoderArgs(settings, ctx, bitrateKbps(effectivePreset(settings), fps)));
    out.push('-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart');
  }
  out.push('-t', sec(total), ctx.outputPath);

  return {
    args: ['-hide_banner', '-y', ...inputs, '-filter_complex', filters.join(';'), ...out],
    durationMs: total,
    width: W,
    height: H,
    fps,
  };
}

export function videoEncoderArgs(settings: ExportSettings, ctx: PlanContext, kbps: number): string[] {
  const rate = ['-b:v', `${kbps}k`];
  const h265 = settings.codec === 'h265';
  if (ctx.encoder === 'software') {
    return h265
      ? ['-c:v', 'libx265', '-preset', 'veryfast', ...rate, '-tag:v', 'hvc1', '-x265-params', 'log-level=error']
      : ['-c:v', 'libx264', '-preset', 'veryfast', ...rate, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`];
  }
  if (ctx.platform === 'ios') {
    return h265
      ? ['-c:v', 'hevc_videotoolbox', ...rate, '-tag:v', 'hvc1', '-allow_sw', '1']
      : ['-c:v', 'h264_videotoolbox', ...rate, '-allow_sw', '1'];
  }
  return h265
    ? ['-c:v', 'hevc_mediacodec', ...rate, '-tag:v', 'hvc1']
    : ['-c:v', 'h264_mediacodec', ...rate];
}
