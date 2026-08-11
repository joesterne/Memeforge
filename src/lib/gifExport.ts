import { measureClientOperation } from "./performance";

interface GifExportOptions {
  sourceUrl: string;
  overlayDataUrl: string;
  width: number;
  height: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

const MAX_GIF_BYTES = 20 * 1024 * 1024;

export function encodeGifInWorker(options: GifExportOptions): Promise<Blob> {
  return measureClientOperation("gif_export", () => runGifExport(options));
}

async function runGifExport(options: GifExportOptions): Promise<Blob> {
  const [sourceResponse, overlayResponse] = await Promise.all([
    fetch(options.sourceUrl, { signal: options.signal }),
    fetch(options.overlayDataUrl, { signal: options.signal }),
  ]);
  if (!sourceResponse.ok) throw new Error("Could not download the source GIF.");
  if (!overlayResponse.ok) throw new Error("Could not prepare the text overlay.");
  const declaredBytes = Number(sourceResponse.headers.get("content-length") || 0);
  if (declaredBytes > MAX_GIF_BYTES) throw new Error("The source GIF is larger than the 20 MB export limit.");

  const [source, overlay] = await Promise.all([sourceResponse.arrayBuffer(), overlayResponse.blob()]);
  if (source.byteLength > MAX_GIF_BYTES) throw new Error("The source GIF is larger than the 20 MB export limit.");
  const worker = new Worker(new URL("../workers/gifEncoder.worker.ts", import.meta.url), { type: "module" });
  const id = crypto.randomUUID();

  return new Promise<Blob>((resolve, reject) => {
    const abort = () => {
      worker.terminate();
      reject(new DOMException("GIF export cancelled", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    worker.onmessage = (event) => {
      if (event.data?.id !== id) return;
      if (event.data.type === "progress") {
        options.onProgress?.(event.data.progress);
        return;
      }
      worker.terminate();
      options.signal?.removeEventListener("abort", abort);
      if (event.data.type === "complete") {
        options.onProgress?.(100);
        resolve(new Blob([event.data.result], { type: "image/gif" }));
      } else {
        reject(new Error(event.data.message || "GIF export failed."));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      options.signal?.removeEventListener("abort", abort);
      reject(new Error(event.message || "GIF export worker failed."));
    };
    worker.postMessage({
      id,
      source,
      overlay,
      width: options.width,
      height: options.height,
    }, [source]);
  });
}
