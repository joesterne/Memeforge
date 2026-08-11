/// <reference lib="webworker" />

import { decodeFrames, encode } from "modern-gif";

interface EncodeRequest {
  id: string;
  source: ArrayBuffer;
  overlay: Blob;
  width: number;
  height: number;
}

const MAX_FRAMES = 120;
const MAX_DIMENSION = 1_000;
const MAX_TOTAL_PIXELS = 60_000_000;

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  const { id, source, overlay, width, height } = event.data;
  try {
    if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new Error(`Animated export is limited to ${MAX_DIMENSION}px per side.`);
    }
    const frames = await decodeFrames(source);
    if (frames.length > MAX_FRAMES) throw new Error(`Animated export is limited to ${MAX_FRAMES} frames.`);
    if (frames.length * width * height > MAX_TOTAL_PIXELS) {
      throw new Error("This GIF is too large to export safely. Reduce its resolution or duration.");
    }

    const overlayBitmap = await createImageBitmap(overlay);
    const outputCanvas = new OffscreenCanvas(width, height);
    const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
    if (!outputContext) throw new Error("Canvas encoding is not supported in this browser.");
    const frameCanvas = new OffscreenCanvas(width, height);
    const frameContext = frameCanvas.getContext("2d", { willReadFrequently: true });
    if (!frameContext) throw new Error("Canvas decoding is not supported in this browser.");

    const outputFrames: Array<{ data: Uint8ClampedArray; delay: number }> = [];
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      const sourceCanvas = new OffscreenCanvas(frame.width, frame.height);
      const sourceContext = sourceCanvas.getContext("2d");
      if (!sourceContext) throw new Error("Could not decode a GIF frame.");
      sourceContext.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);

      frameContext.clearRect(0, 0, width, height);
      frameContext.drawImage(sourceCanvas, 0, 0, width, height);
      outputContext.clearRect(0, 0, width, height);
      outputContext.drawImage(frameCanvas, 0, 0);
      outputContext.drawImage(overlayBitmap, 0, 0, width, height);
      outputFrames.push({
        data: outputContext.getImageData(0, 0, width, height).data,
        delay: frame.delay,
      });
      self.postMessage({ id, type: "progress", progress: Math.round(((index + 1) / frames.length) * 70) });
    }

    const encoded = await encode({ width, height, frames: outputFrames });
    self.postMessage({ id, type: "complete", result: encoded }, { transfer: [encoded] });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};

export {};
