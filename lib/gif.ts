import sharp from "sharp";
import * as gifencNamespace from "gifenc";
import { buildPalette, applyPalette, utils, type ImageQuantization } from "image-q";

// gifenc ships a CJS build whose exports land under `default` via Node's interop
// but as named exports under bundlers; normalize so this works in both.
const gifenc = ((gifencNamespace as { default?: typeof gifencNamespace }).default ??
  gifencNamespace) as typeof gifencNamespace;
const { GIFEncoder } = gifenc;

export type OutputFormat = "card" | "story";

export const FORMATS = {
  // ARQ house-style portrait card with cream mat and rounded corners.
  card: {
    canvasWidth: 1560,
    canvasHeight: 2240,
    cornerRadius: 90,
    matInset: 60,
  },
  // Instagram story: full-bleed 9:16, no mat, no rounded corners.
  story: {
    canvasWidth: 1080,
    canvasHeight: 1920,
    cornerRadius: 0,
    matInset: 0,
  },
} as const;

export const HOUSE_STYLE = {
  matColor: "#F5E4B2",
  frameHoldMs: 700,
  // Dither toggle: >0 applies error diffusion, 0 disables it (flatter, can band).
  // The quantizer is image-q's wuquant palette, which (unlike libvips here)
  // does not bleed green palette entries into skin.
  dither: 0.5,
  colors: 256,
  loop: 0,
  // Gaussian blur sigma applied to the photo just before quantization. Removes
  // the fine sensor noise that dithering would otherwise amplify into visible
  // speckle on skin and flat garments. 0 (or <0.3) disables it.
  smoothing: 0.6,
} as const;

export type CropRect = { left: number; top: number; width: number; height: number };

export type RenderOptions = {
  format?: OutputFormat;
  matColor?: string;
  frameHoldMs?: number;
  dither?: number;
  colors?: number;
  scale?: number;
  smoothing?: number;
  crops?: (CropRect | null)[];
};

function roundedMask(width: number, height: number, radius: number): Buffer {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></svg>`;
  return Buffer.from(svg);
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

async function applyCrop(photo: Buffer, crop: CropRect | null): Promise<sharp.Sharp> {
  const img = sharp(photo, { failOn: "none" }).rotate();
  if (!crop) return img;

  const meta = await img.metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;
  if (!imgW || !imgH) return img;

  const left = clamp(Math.round(crop.left), 0, imgW - 1);
  const top = clamp(Math.round(crop.top), 0, imgH - 1);
  const width = clamp(Math.round(crop.width), 1, imgW - left);
  const height = clamp(Math.round(crop.height), 1, imgH - top);
  return img.extract({ left, top, width, height });
}

async function renderFrame(
  photo: Buffer,
  format: OutputFormat,
  matColor: string,
  crop: CropRect | null,
  scale: number,
  smoothing: number,
): Promise<Buffer> {
  const base = FORMATS[format];
  const canvasWidth = Math.round(base.canvasWidth * scale);
  const canvasHeight = Math.round(base.canvasHeight * scale);
  const cornerRadius = Math.round(base.cornerRadius * scale);
  const matInset = Math.round(base.matInset * scale);
  const cardWidth = canvasWidth - matInset * 2;
  const cardHeight = canvasHeight - matInset * 2;

  let cardBuffer = await (await applyCrop(photo, crop))
    .resize(cardWidth, cardHeight, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  // Denoise before quantization so dithering doesn't amplify sensor noise into
  // speckle. Applied to the photo only, before the rounded mask, so the mat
  // edge and corners stay crisp. (sharp's blur needs sigma >= 0.3.)
  if (smoothing >= 0.3) {
    cardBuffer = await sharp(cardBuffer).blur(smoothing).png().toBuffer();
  }

  if (cornerRadius > 0) {
    cardBuffer = await sharp(cardBuffer)
      .composite([{ input: roundedMask(cardWidth, cardHeight, cornerRadius), blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: matColor,
    },
  })
    .composite([{ input: cardBuffer, top: matInset, left: matInset }])
    .png()
    .toBuffer();
}

// Quantize one full-colour frame to a 256-entry palette with image-q's wuquant
// (a proper clustering palette that, unlike the libvips path, does not assign
// green palette entries to skin), optionally dithered, then return the indexed
// bitmap + palette ready for gifenc to write as one animation frame.
async function quantizeFrame(
  rgba: Uint8Array,
  width: number,
  height: number,
  colors: number,
  ditherMode: ImageQuantization,
): Promise<{ index: Uint8Array; palette: number[][] }> {
  const inPoints = utils.PointContainer.fromUint8Array(rgba, width, height);
  const builtPalette = await buildPalette([inPoints], {
    colorDistanceFormula: "euclidean-bt709",
    paletteQuantization: "wuquant",
    colors,
  });
  const outPoints = await applyPalette(inPoints, builtPalette, {
    colorDistanceFormula: "euclidean-bt709",
    imageQuantization: ditherMode,
  });
  const dithered = outPoints.toUint8Array();

  const paletteBytes = builtPalette.getPointContainer().toUint8Array();
  const palette: number[][] = [];
  const lookup = new Map<number, number>();
  for (let i = 0; i < paletteBytes.length; i += 4) {
    const r = paletteBytes[i];
    const g = paletteBytes[i + 1];
    const b = paletteBytes[i + 2];
    lookup.set((r << 16) | (g << 8) | b, palette.length);
    palette.push([r, g, b]);
  }

  // Dithered pixels already equal palette colours, so the lookup is exact; the
  // linear scan is only a defensive fallback for any unexpected miss.
  const pixels = width * height;
  const index = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const r = dithered[i * 4];
    const g = dithered[i * 4 + 1];
    const b = dithered[i * 4 + 2];
    let idx = lookup.get((r << 16) | (g << 8) | b);
    if (idx === undefined) {
      let best = 0;
      let bestDist = Infinity;
      for (let p = 0; p < palette.length; p++) {
        const dr = palette[p][0] - r;
        const dg = palette[p][1] - g;
        const db = palette[p][2] - b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
      idx = best;
    }
    index[i] = idx;
  }

  return { index, palette };
}

export async function renderGif(photos: Buffer[], options?: RenderOptions): Promise<Buffer> {
  if (photos.length === 0) {
    throw new Error("At least one photo is required.");
  }

  const format = options?.format ?? "card";
  const matColor = options?.matColor ?? HOUSE_STYLE.matColor;
  const frameHoldMs = options?.frameHoldMs ?? HOUSE_STYLE.frameHoldMs;
  const dither = options?.dither ?? HOUSE_STYLE.dither;
  const colors = options?.colors ?? HOUSE_STYLE.colors;
  const scale = clamp(options?.scale ?? 1, 0.1, 1);
  const smoothing = clamp(options?.smoothing ?? HOUSE_STYLE.smoothing, 0, 3);
  const crops = options?.crops ?? [];

  const frames = await Promise.all(
    photos.map((p, i) => renderFrame(p, format, matColor, crops[i] ?? null, scale, smoothing)),
  );

  // image-q quantizes + dithers each frame to its own optimal palette, gifenc
  // writes them as one looping animation with per-frame local color tables.
  const paletteColors = clamp(Math.round(colors), 2, 256);
  const ditherMode: ImageQuantization = dither > 0 ? "floyd-steinberg" : "nearest";
  const delay = Math.max(10, Math.round(frameHoldMs));

  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const { data, info } = await sharp(frames[i])
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const { index, palette } = await quantizeFrame(
      rgba,
      info.width,
      info.height,
      paletteColors,
      ditherMode,
    );
    gif.writeFrame(index, info.width, info.height, {
      palette,
      delay,
      repeat: i === 0 ? HOUSE_STYLE.loop : undefined,
    });
  }
  gif.finish();

  return Buffer.from(gif.bytes());
}
