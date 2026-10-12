import { GIF_PRESETS, createDiagramPalette } from './gif-quality.js';
import { createGifEncoder } from './gif-encoder.js';
export const GIF_WIDTH = 1280;
export const GIF_HEIGHT = 720;
export const GIF_FPS = 20;
export const GIF_MAX_SECONDS = 30;
export const GIF_MAX_BYTES = 32 * 1024 * 1024;
const activeCanvases = new WeakSet();
function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('GIF export cancelled.', 'AbortError');
}
/** Render one frame at a time. No raw-frame array, audio, network or MediaRecorder. */
export async function exportGIF({ canvas, outputCanvas, duration, theme = 'light', quality = 'high', renderFrame, signal, onProgress = () => {} }) {
  if (!canvas || !outputCanvas || canvas === outputCanvas || typeof renderFrame !== 'function')
    throw new Error('GIF export needs separate render and output canvases.');
  if (!Number.isFinite(duration) || duration <= 0 || duration > GIF_MAX_SECONDS)
    throw new Error(`GIF supports stories up to ${GIF_MAX_SECONDS} seconds. Shorten the scenes or use WebM.`);
  if (activeCanvases.has(canvas)) throw new Error('This GIF export is already running.');
  const preset = GIF_PRESETS[quality];
  if (!preset) throw new Error('Choose a valid GIF quality: high or compact.');
  const { width, height, fps } = preset;
  checkAbort(signal);
  activeCanvases.add(canvas);
  try {
    outputCanvas.width = width;
    outputCanvas.height = height;
    const context = outputCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser cannot read GIF frames.');
    const encoder = createGifEncoder({ palette: createDiagramPalette(theme), width, height, delay: 1000 / fps, maxBytes: GIF_MAX_BYTES });
    const count = Math.max(1, Math.ceil(duration * fps));
    onProgress(0);
    for (let i = 0; i < count; i++) {
      checkAbort(signal);
      renderFrame(count === 1 ? 0 : duration * i / (count - 1));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(canvas, 0, 0, width, height);
      let rgba;
      try { rgba = context.getImageData(0, 0, width, height).data; }
      catch { throw new Error('GIF pixels could not be read. Use a locally rendered project.'); }
      encoder.addFrame(rgba);
      onProgress((i + 1) / count);
      // Yield between frames so the Cancel button and browser can respond.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    checkAbort(signal);
    return new Blob([encoder.finish()], { type: 'image/gif' });
  } finally {
    activeCanvases.delete(canvas);
    // Release the large backing stores, also on cancellation or errors.
    canvas.width = canvas.height = outputCanvas.width = outputCanvas.height = 1;
  }
}
