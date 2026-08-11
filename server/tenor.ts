import { AppError, CircuitBreaker, fetchWithPolicy, readJson, Semaphore } from "./http";

interface TenorMedia {
  url?: string;
  dims?: number[];
  size?: number;
}

interface TenorResult {
  id?: string;
  content_description?: string;
  media_formats?: {
    gif?: TenorMedia;
    tinygif?: TenorMedia;
  };
}

interface TenorResponse {
  next?: string;
  results?: TenorResult[];
}

export interface GifResult {
  id: string;
  name: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  box_count: 1;
  dateAdded: string;
  is_video: true;
}

const tenorRequests = new Semaphore(
  Math.max(1, Number(process.env.TENOR_MAX_CONCURRENCY || 6)),
  Math.max(0, Number(process.env.TENOR_MAX_QUEUE || 12)),
);
const tenorBreaker = new CircuitBreaker(5, 30_000);

export async function searchTenor(
  query: string,
  options: { pos?: string; random?: boolean; signal?: AbortSignal } = {},
): Promise<{ gifs: GifResult[]; next: string }> {
  const key = process.env.TENOR_API_KEY;
  if (!key) throw new AppError(503, "TENOR_NOT_CONFIGURED", "GIF search is not configured.");

  const params = new URLSearchParams({
    key,
    client_key: "memeforge",
    q: query,
    country: process.env.TENOR_COUNTRY || "US",
    locale: process.env.TENOR_LOCALE || "en_US",
    contentfilter: "high",
    media_filter: "gif,tinygif",
    ar_range: "all",
    limit: "20",
  });
  if (options.pos) params.set("pos", options.pos);
  if (options.random) params.set("random", "true");

  return tenorRequests.run(async () => {
    const response = await fetchWithPolicy(
      `https://tenor.googleapis.com/v2/search?${params}`,
      { headers: { Accept: "application/json" } },
      { timeoutMs: 6_000, retries: 1, signal: options.signal, breaker: tenorBreaker },
    );
    const data = await readJson<TenorResponse>(response, "Tenor", 2_000_000);
    const gifs = (data.results || []).flatMap((item): GifResult[] => {
      const full = item.media_formats?.gif;
      const preview = item.media_formats?.tinygif || full;
      if (!item.id || !full?.url || !preview?.url) return [];
      const [width = 400, height = 400] = full.dims || [];
      return [{
        id: `gif_${item.id}`,
        name: item.content_description || "Animated GIF",
        url: full.url,
        previewUrl: preview.url,
        width,
        height,
        box_count: 1,
        dateAdded: new Date().toISOString(),
        is_video: true,
      }];
    });
    return { gifs, next: data.next || "" };
  });
}
