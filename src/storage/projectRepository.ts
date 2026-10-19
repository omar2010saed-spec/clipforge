import type { Project } from '@/types';
import { getDb } from './db';

interface Row {
  id: string;
  data: string;
}

function parse(row: Row): Project | null {
  try {
    return JSON.parse(row.data) as Project;
  } catch {
    // A corrupted row must never break the whole list.
    return null;
  }
}

export const projectRepository = {
  async list(): Promise<Project[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>('SELECT id, data FROM projects ORDER BY updated_at DESC');
    return rows.map(parse).filter((p): p is Project => p !== null);
  },

  async get(id: string): Promise<Project | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<Row>('SELECT id, data FROM projects WHERE id = ?', [id]);
    return row ? parse(row) : null;
  },

  async save(project: Project): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO projects (id, name, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         updated_at = excluded.updated_at,
         data = excluded.data`,
      [project.id, project.name, project.createdAt, project.updatedAt, JSON.stringify(project)],
    );
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM projects WHERE id = ?', [id]);
  },
};
