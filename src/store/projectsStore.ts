import { create } from 'zustand';
import type { Project } from '@/types';
import { projectRepository } from '@/storage/projectRepository';
import { createEmptyProject, duplicateProject, type AspectKey } from '@/models/project';
import { t } from '@/i18n';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface ProjectsState {
  projects: Project[];
  status: Status;
  error: string | null;
  load: () => Promise<void>;
  create: (name: string, aspect: AspectKey) => Promise<Project | null>;
  rename: (id: string, name: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const sortByUpdated = (list: Project[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt);

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  status: 'idle',
  error: null,

  async load() {
    set({ status: 'loading', error: null });
    try {
      const projects = await projectRepository.list();
      set({ projects, status: 'ready' });
    } catch (e) {
      console.warn('[projects] load failed', e);
      set({ status: 'error', error: t('loadFailed') });
    }
  },

  async create(name, aspect) {
    try {
      const project = createEmptyProject(name, aspect);
      await projectRepository.save(project);
      set({ projects: sortByUpdated([project, ...get().projects]), error: null });
      return project;
    } catch (e) {
      console.warn('[projects] create failed', e);
      set({ error: t('saveFailed') });
      return null;
    }
  },

  async rename(id, name) {
    const current = get().projects.find((p) => p.id === id);
    if (!current) return;
    try {
      const updated: Project = { ...current, name: name.trim(), updatedAt: Date.now() };
      await projectRepository.save(updated);
      set({
        projects: sortByUpdated(get().projects.map((p) => (p.id === id ? updated : p))),
        error: null,
      });
    } catch (e) {
      console.warn('[projects] rename failed', e);
      set({ error: t('saveFailed') });
    }
  },

  async duplicate(id) {
    const current = get().projects.find((p) => p.id === id);
    if (!current) return;
    try {
      const copy = duplicateProject(current, t('copySuffix'));
      await projectRepository.save(copy);
      set({ projects: sortByUpdated([copy, ...get().projects]), error: null });
    } catch (e) {
      console.warn('[projects] duplicate failed', e);
      set({ error: t('saveFailed') });
    }
  },

  async remove(id) {
    try {
      await projectRepository.remove(id);
      set({ projects: get().projects.filter((p) => p.id !== id), error: null });
    } catch (e) {
      console.warn('[projects] remove failed', e);
      set({ error: t('saveFailed') });
    }
  },
}));
