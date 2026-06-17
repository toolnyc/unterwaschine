import sharp from "sharp";

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
  dither: 1,
  colors: 256,
  loop: 0,
} as const;

export type CropRect = { left: number; top: number; width: number; height: number };

export type RenderOptions = {
  format?: OutputFormat;
  matColor?: string;
  frameHoldMs?: number;
  dither?: number;
  colors?: number;
  scale?: number;
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
): Promise<Buffer> {
  const base = FORMATS[format];
  const canvasWidth = Math.round(base.canvasWidth * scale);
  const canvasHeight = Math.round(base.canvasHeight * scale);
  const cornerRadius = Math.round(base.cornerRadius * scale);
  const matInset = Math.round(base.matInset * scale);
  const cardWidth = canvasWidth - matInset * 2;
  const cardHeight = canvasHeight - matInset * 2;

  let card = (await applyCrop(photo, crop)).resize(cardWidth, cardHeight, {
    fit: "cover",
    position: "centre",
  });

  if (cornerRadius > 0) {
    card = card.composite([
      { input: roundedMask(cardWidth, cardHeight, cornerRadius), blend: "dest-in" },
    ]);
  }

  const cardBuffer = await card.png().toBuffer();

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
  const crops = options?.crops ?? [];

  const frames = await Promise.all(
    photos.map((p, i) => renderFrame(p, format, matColor, crops[i] ?? null, scale)),
  );

  return sharp(frames, { join: { animated: true } })
    .gif({ delay: frames.map(() => frameHoldMs), loop: HOUSE_STYLE.loop, dither, colours: colors })
    .toBuffer();
}
