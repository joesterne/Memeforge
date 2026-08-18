import { encode } from "modern-gif";

self.onmessage = async (e: MessageEvent) => {
  const { targetWidth, targetHeight, frames, overlayDataUrl } = e.data;

  try {
    const overlayImage = await createImageBitmap(await (await fetch(overlayDataUrl)).blob());

    const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = offscreen.getContext("2d")!;

    const newFrames = [];
    for (const frame of frames) {
      const frameData = new ImageData(
        new Uint8ClampedArray(frame.data),
        frame.width,
        frame.height
      );
      
      const frameBitmap = await createImageBitmap(frameData);

      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(frameBitmap, 0, 0, targetWidth, targetHeight);
      ctx.drawImage(overlayImage, 0, 0, targetWidth, targetHeight);

      newFrames.push({
        data: ctx.getImageData(0, 0, targetWidth, targetHeight).data,
        delay: frame.delay,
      });
      
      frameBitmap.close();
    }
    
    overlayImage.close();

    const output = await encode({
      width: targetWidth,
      height: targetHeight,
      frames: newFrames,
    });

    const blob = new Blob([output], { type: "image/gif" });
    self.postMessage({ success: true, blob });
  } catch (err: any) {
    self.postMessage({ success: false, error: err.message || "Failed to encode GIF" });
  }
};
