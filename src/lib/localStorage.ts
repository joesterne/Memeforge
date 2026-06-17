export interface RecentMeme {
  id: string;
  thumbnailUrl: string;
  title: string;
  createdAt: string;
}

const STORAGE_KEY = "memeforge_recent_creations";
const MAX_RECENT_MEMES = 20;

export const saveRecentCreation = (meme: RecentMeme) => {
  try {
    const existing = getRecentCreations();
    // remove any existing with same id to move it to the front
    const updated = [meme, ...existing.filter((m) => m.id !== meme.id)].slice(
      0,
      MAX_RECENT_MEMES
    );
    // ensure we don't exceed local storage roughly if thumbnails are big
    // usually a small thumbnail is < 50kb. 20 of them is 1MB.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to save recent creation to localStorage", err);
    // fallback: clear old half if quota exceeded
    try {
      const existing = getRecentCreations();
      const updated = [meme, ...existing.filter((m) => m.id !== meme.id)].slice(
        0,
        MAX_RECENT_MEMES / 2
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Still exceeding quota", e);
    }
  }
};

export const getRecentCreations = (): RecentMeme[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    return [];
  }
};

export const deleteRecentCreation = (id: string) => {
  try {
    const existing = getRecentCreations();
    const updated = existing.filter((m) => m.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to delete recent creation", err);
  }
};
