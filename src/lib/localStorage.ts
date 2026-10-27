export interface RecentMeme {
  id: string;
  thumbnailUrl: string;
  title: string;
  createdAt: string;
  views?: number;
  likes?: number;
  shares?: number;
  downloads?: number;
}

export interface MemeMetricEvent {
  id: string;
  memeId: string;
  memeTitle: string;
  type: "view" | "like" | "share" | "download";
  timestamp: string; // ISO string
}

const STORAGE_KEY = "memeforge_recent_creations";
const METRICS_EVENTS_KEY = "memeforge_metric_events";
const MAX_RECENT_MEMES = 20;

export const saveRecentCreation = (meme: RecentMeme) => {
  try {
    const existing = getRecentCreations();
    const existingMeme = existing.find((m) => m.id === meme.id);

    // Retain or initialize stats
    const enrichedMeme: RecentMeme = {
      ...meme,
      views: meme.views ?? existingMeme?.views ?? 1,
      likes: meme.likes ?? existingMeme?.likes ?? 0,
      shares: meme.shares ?? existingMeme?.shares ?? 0,
      downloads: meme.downloads ?? existingMeme?.downloads ?? 0,
    };

    const updated = [
      enrichedMeme,
      ...existing.filter((m) => m.id !== meme.id),
    ].slice(0, MAX_RECENT_MEMES);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Record creation view event if new
    if (!existingMeme) {
      recordMetricEvent(meme.id, meme.title || "Untitled Meme", "view");
    }
  } catch (err) {
    console.warn("Failed to save recent creation to localStorage", err);
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

export const getMetricEvents = (): MemeMetricEvent[] => {
  try {
    const data = localStorage.getItem(METRICS_EVENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const recordMetricEvent = (
  memeId: string,
  memeTitle: string,
  type: "view" | "like" | "share" | "download"
) => {
  try {
    const events = getMetricEvents();
    const newEvent: MemeMetricEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      memeId,
      memeTitle,
      type,
      timestamp: new Date().toISOString(),
    };
    // Keep up to 500 recent events
    const updatedEvents = [...events, newEvent].slice(-500);
    localStorage.setItem(METRICS_EVENTS_KEY, JSON.stringify(updatedEvents));

    // Also update aggregated counters on recent creation if present
    const creations = getRecentCreations();
    const idx = creations.findIndex((m) => m.id === memeId);
    if (idx !== -1) {
      const current = creations[idx];
      if (type === "view") current.views = (current.views || 0) + 1;
      if (type === "like") current.likes = (current.likes || 0) + 1;
      if (type === "share") current.shares = (current.shares || 0) + 1;
      if (type === "download") current.downloads = (current.downloads || 0) + 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(creations));
    }
  } catch (e) {
    console.warn("Could not record metric event", e);
  }
};
