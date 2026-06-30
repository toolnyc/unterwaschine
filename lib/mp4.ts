import sharp from "sharp";
import { createH264MP4Encoder } from "h264-mp4-encoder";
import { HOUSE_STYLE, clamp, renderFrame, type RenderOptions } from "./gif";

// H.264 quality: lower quantization = higher quality / larger file. Story
// slideshows are mostly static frames (which compress to near-nothing as
// P-frames), so we can afford a high-quality setting and still land far below
// the equivalent GIF size.
const QUANTIZATION = 20;
const FRAME_RATE = 30;

// Encode the rendered frames as an H.264 MP4. Unlike the GIF path there is no
// per-frame palette; instead each photo is held on screen by repeating its
// frame for the requested duration at a constant frame rate.
export async function renderMp4(photos: Buffer[], options?: RenderOptions): Promise<Buffer> {
  if (photos.length === 0) {
    throw new Error("At least one photo is required.");
  }

  const format = options?.format ?? "story";
  const matColor = options?.matColor ?? HOUSE_STYLE.matColor;
  const frameHoldMs = options?.frameHoldMs ?? HOUSE_STYLE.frameHoldMs;
  const scale = clamp(options?.scale ?? 1, 0.1, 1);
  const smoothing = clamp(options?.smoothing ?? HOUSE_STYLE.smoothing, 0, 3);
  const crops = options?.crops ?? [];

  const rendered = await Promise.all(
    photos.map((p, i) => renderFrame(p, format, matColor, crops[i] ?? null, scale, smoothing)),
  );

  const encoder = await createH264MP4Encoder();
  encoder.frameRate = FRAME_RATE;
  encoder.quantizationParameter = QUANTIZATION;
  const holdFrames = Math.max(1, Math.round((frameHoldMs / 1000) * FRAME_RATE));

  let initialized = false;
  for (const frame of rendered) {
    // H.264 requires even dimensions; trim a stray odd row/column if a non-even
    // scale produced one.
    let img = sharp(frame).ensureAlpha();
    const meta = await img.metadata();
    const evenW = (meta.width ?? 0) - ((meta.width ?? 0) % 2);
    const evenH = (meta.height ?? 0) - ((meta.height ?? 0) % 2);
    if (evenW !== meta.width || evenH !== meta.height) {
      img = sharp(frame).ensureAlpha().extract({ left: 0, top: 0, width: evenW, height: evenH });
    }

    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    if (!initialized) {
      encoder.width = info.width;
      encoder.height = info.height;
      encoder.initialize();
      initialized = true;
    }

    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < holdFrames; i++) {
      encoder.addFrameRgba(rgba);
    }
  }

  encoder.finalize();
  const output = encoder.FS.readFile(encoder.outputFilename);
  const buffer = Buffer.from(output);
  encoder.delete();
  return buffer;
}
