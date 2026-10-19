import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import type { ExportSettings, Project } from '@/types';
import { getEngine, type Engine } from '@/engine/ffmpeg';
import { uriToPath } from '@/utils/path';
import { buildExportPlan, type EncoderMode, type ExportPlan } from './plan';

export type ExportPhase = 'prepare' | 'encode' | 'retry';

export interface ExportHooks {
  renderTexts: () => Promise<Record<string, string>>;
  onProgress: (fraction: number, phase: ExportPhase) => void;
  isCancelled: () => boolean;
}

export type ExportOutcome =
  | { ok: true; uri: string; plan: ExportPlan }
  | { ok: false; reason: 'engine-missing' | 'empty' | 'cancelled' | 'failed'; log?: string };

/** Fills in `hasAudio` for clips imported without a reliable probe, so ffmpeg never maps a missing stream. */
async function resolveAudio(engine: Engine, project: Project): Promise<Project> {
  let changed = false;
  const tracks = await Promise.all(
    project.tracks.map(async (track) => {
      const clips = await Promise.all(
        track.clips.map(async (clip) => {
          if (clip.hasAudio !== undefined || (clip.kind !== 'video' && clip.kind !== 'audio')) return clip;
          try {
            const info = await engine.probe(uriToPath(clip.sourceUri));
            changed = true;
            return { ...clip, hasAudio: info.hasAudio };
          } catch {
            return clip;
          }
        }),
      );
      return { ...track, clips };
    }),
  );
  return changed ? { ...project, tracks } : project;
}

export async function runExport(project: Project, settings: ExportSettings, hooks: ExportHooks): Promise<ExportOutcome> {
  const engine = getEngine();
  if (!engine) return { ok: false, reason: 'engine-missing' };

  hooks.onProgress(0, 'prepare');
  const resolved = await resolveAudio(engine, project);
  if (hooks.isCancelled()) return { ok: false, reason: 'cancelled' };

  let textImages: Record<string, string> = {};
  try {
    textImages = await hooks.renderTexts();
  } catch (e) {
    console.warn('[export] text rendering failed', e);
    return { ok: false, reason: 'failed', log: `text-render: ${String(e)}` };
  }
  if (hooks.isCancelled()) return { ok: false, reason: 'cancelled' };

  const ext = settings.format === 'gif' ? 'gif' : 'mp4';
  const outputUri = `${FileSystem.cacheDirectory}clipforge-${Date.now()}.${ext}`;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const modes: EncoderMode[] = settings.format === 'gif' ? ['software'] : ['hardware', 'software'];

  let lastLog = '';
  for (let i = 0; i < modes.length; i++) {
    const encoder = modes[i] as EncoderMode;
    let plan: ExportPlan;
    try {
      plan = buildExportPlan(resolved, settings, { textImages, outputPath: uriToPath(outputUri), encoder, platform });
    } catch (e) {
      return { ok: false, reason: e instanceof Error && e.message === 'empty-project' ? 'empty' : 'failed', log: String(e) };
    }
    const phase: ExportPhase = i === 0 ? 'encode' : 'retry';
    hooks.onProgress(0, phase);
    const res = await engine.run(plan.args, (ms) => hooks.onProgress(Math.min(1, ms / plan.durationMs), phase));
    lastLog = res.log;
    if (res.ok) return { ok: true, uri: outputUri, plan };
    if (res.cancelled || hooks.isCancelled()) {
      await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => undefined);
      return { ok: false, reason: 'cancelled' };
    }
    await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => undefined);
  }
  return { ok: false, reason: 'failed', log: lastLog };
}
