import { create } from 'zustand';
import type { Project } from '@/types';
import { projectRepository } from '@/storage/projectRepository';
import { projectDurationMs } from '@/models/project';
import { findClip, findText, type ClipboardItem } from '@/editor/timeline';
import { t } from '@/i18n';

export type Selection = { type: 'clip' | 'text'; id: string } | null;

const HISTORY_LIMIT = 60;
const SAVE_DELAY_MS = 500;
const COALESCE_WINDOW_MS = 1500;
export const MIN_PX_PER_SEC = 12;
export const MAX_PX_PER_SEC = 400;

interface EditorState {
  project: Project | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  selection: Selection;
  timeMs: number;
  playing: boolean;
  pxPerSec: number;
  past: Project[];
  future: Project[];
  clipboard: ClipboardItem | null;

  setClipboard: (item: ClipboardItem | null) => void;
  load: (id: string) => Promise<void>;
  reset: () => void;
  commit: (fn: (p: Project) => Project, opts?: { coalesce?: string }) => void;
  run: <R extends { project: Project }>(fn: (p: Project) => R, opts?: { coalesce?: string }) => R | null;
  undo: () => void;
  redo: () => void;
  select: (sel: Selection) => void;
  setTime: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  zoom: (factor: number) => void;
  flush: () => Promise<void>;
  clearError: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastCoalesce: { key: string; at: number } | null = null;

export const useEditorStore = create<EditorState>()((set, get) => {
  const persist = async () => {
    const p = get().project;
    if (!p) return;
    const updated = { ...p, updatedAt: Date.now() };
    try {
      await projectRepository.save(updated);
      // keep updatedAt in sync without creating a history entry
      if (get().project === p) set({ project: updated });
    } catch (e) {
      console.warn('[editor] save failed', e);
      set({ error: t('saveFailed') });
    }
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persist();
    }, SAVE_DELAY_MS);
  };

  const validSelection = (p: Project, sel: Selection): Selection => {
    if (!sel) return null;
    if (sel.type === 'clip') return findClip(p, sel.id) ? sel : null;
    return findText(p, sel.id) ? sel : null;
  };

  return {
    project: null,
    status: 'idle',
    error: null,
    selection: null,
    timeMs: 0,
    playing: false,
    pxPerSec: 80,
    past: [],
    future: [],
    clipboard: null,

    setClipboard(item) {
      set({ clipboard: item });
    },

    async load(id) {
      set({ status: 'loading', error: null, project: null, selection: null, timeMs: 0, playing: false, past: [], future: [] });
      lastCoalesce = null;
      try {
        const project = await projectRepository.get(id);
        if (!project) {
          set({ status: 'error', error: t('projectNotFound') });
          return;
        }
        set({ project, status: 'ready' });
      } catch (e) {
        console.warn('[editor] load failed', e);
        set({ status: 'error', error: t('loadFailed') });
      }
    },

    reset() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      lastCoalesce = null;
      set({ project: null, status: 'idle', error: null, selection: null, timeMs: 0, playing: false, past: [], future: [] });
    },

    commit(fn, opts) {
      const current = get().project;
      if (!current) return;
      const next = fn(current);
      if (next === current) return;
      const now = Date.now();
      const coalesced =
        opts?.coalesce !== undefined &&
        lastCoalesce !== null &&
        lastCoalesce.key === opts.coalesce &&
        now - lastCoalesce.at < COALESCE_WINDOW_MS;
      lastCoalesce = opts?.coalesce !== undefined ? { key: opts.coalesce, at: now } : null;
      const past = coalesced ? get().past : [...get().past, current].slice(-HISTORY_LIMIT);
      set({
        project: next,
        past,
        future: [],
        selection: validSelection(next, get().selection),
      });
      scheduleSave();
    },

    run(fn, opts) {
      const current = get().project;
      if (!current) return null;
      const result = fn(current);
      get().commit(() => result.project, opts);
      return result;
    },

    undo() {
      const { past, project, future } = get();
      const prev = past[past.length - 1];
      if (!prev || !project) return;
      lastCoalesce = null;
      set({
        project: prev,
        past: past.slice(0, -1),
        future: [project, ...future].slice(0, HISTORY_LIMIT),
        selection: validSelection(prev, get().selection),
      });
      scheduleSave();
    },

    redo() {
      const { past, project, future } = get();
      const next = future[0];
      if (!next || !project) return;
      lastCoalesce = null;
      set({
        project: next,
        past: [...past, project].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        selection: validSelection(next, get().selection),
      });
      scheduleSave();
    },

    select(sel) {
      set({ selection: sel });
    },

    setTime(ms) {
      const p = get().project;
      const max = p ? projectDurationMs(p) : 0;
      set({ timeMs: Math.min(Math.max(0, ms), max) });
    },

    setPlaying(playing) {
      set({ playing });
    },

    zoom(factor) {
      set({ pxPerSec: Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, get().pxPerSec * factor)) });
    },

    async flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        await persist();
      }
    },

    clearError() {
      set({ error: null });
    },
  };
});
