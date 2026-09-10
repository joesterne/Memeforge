import Dexie, { Table } from 'dexie';

export interface SavedGif {
  id?: number;
  tenorId: string;
  url: string;
  previewUrl: string;
  title: string;
  query: string;
  importedAt: number;
}

export class AppDB extends Dexie {
  savedGifs!: Table<SavedGif, number>;

  constructor() {
    super('MemeForgeDB');
    this.version(1).stores({
      savedGifs: '++id, tenorId, query, importedAt'
    });
  }
}

export const localdb = new AppDB();
