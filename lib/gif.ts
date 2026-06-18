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
  // Moderate error-diffusion: enough to keep gradients smooth, low enough that
  // it doesn't stipple skin with speckle the way full dithering does.
  dither: 0.5,
  colors: 256,
  loop: 0,
  // Max palette-search effort; quality matters more than encode time here.
  effort: 10,
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

// A single-frame GIF parsed down to the bits we need to re-emit it as one
// frame of an animation with its own local color table.
type ParsedFrame = {
  width: number;
  height: number;
  palette: Buffer;
  paletteSize: number;
  minCodeSize: number;
  data: Buffer;
};

// Walk a single-frame GIF produced by sharp and pull out the screen size,
// color table, and LZW image data. Indices in the data reference palette
// positions, so the table moves from global to local unchanged.
function parseSingleFrameGif(buf: Buffer): ParsedFrame {
  let p = 6; // skip "GIF89a"
  const width = buf.readUInt16LE(p);
  const height = buf.readUInt16LE(p + 2);
  const packed = buf[p + 4];
  p += 7;

  const gctFlag = (packed & 0x80) !== 0;
  const gctSize = gctFlag ? 2 << (packed & 0x07) : 0;
  const gct = gctFlag ? buf.subarray(p, p + gctSize * 3) : null;
  p += gctSize * 3;

  while (p < buf.length) {
    const block = buf[p];
    if (block === 0x21) {
      p += 2; // extension introducer + label
      while (buf[p] !== 0) p += buf[p] + 1; // sub-blocks
      p += 1; // terminator
    } else if (block === 0x2c) {
      const ipacked = buf[p + 9];
      let q = p + 10;
      const lctFlag = (ipacked & 0x80) !== 0;
      const lctSize = lctFlag ? 2 << (ipacked & 0x07) : 0;
      const lct = lctFlag ? buf.subarray(q, q + lctSize * 3) : null;
      q += lctSize * 3;
      const minCodeSize = buf[q];
      q += 1;
      const dataStart = q;
      while (buf[q] !== 0) q += buf[q] + 1;
      return {
        width,
        height,
        palette: (lct ?? gct) as Buffer,
        paletteSize: lctFlag ? lctSize : gctSize,
        minCodeSize,
        data: buf.subarray(dataStart, q),
      };
    } else {
      break;
    }
  }

  throw new Error("Could not parse GIF frame.");
}

// Color-table size field s.t. 2^(field+1) == number of entries.
const paletteSizeField = (entries: number) => Math.ceil(Math.log2(entries)) - 1;

// Assemble independently-quantized single-frame GIFs into one animation where
// each frame keeps its own optimal palette as a local color table. This avoids
// the green/olive cast skin tones get when many photos share one global table.
function muxAnimatedGif(singleGifs: Buffer[], frameHoldMs: number, loop: number): Buffer {
  const first = parseSingleFrameGif(singleGifs[0]);
  const out: Buffer[] = [];

  out.push(Buffer.from("GIF89a"));
  const lsd = Buffer.alloc(7);
  lsd.writeUInt16LE(first.width, 0);
  lsd.writeUInt16LE(first.height, 2);
  out.push(lsd); // no global color table

  out.push(
    Buffer.from([
      0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32,
      0x2e, 0x30, 0x03, 0x01, loop & 0xff, (loop >> 8) & 0xff, 0x00,
    ]),
  );

  const delayCs = Math.max(1, Math.round(frameHoldMs / 10));
  for (const gif of singleGifs) {
    const f = parseSingleFrameGif(gif);
    out.push(
      Buffer.from([0x21, 0xf9, 0x04, 0x04, delayCs & 0xff, (delayCs >> 8) & 0xff, 0x00, 0x00]),
    );

    const sizeField = paletteSizeField(f.paletteSize);
    const id = Buffer.alloc(10);
    id[0] = 0x2c;
    id.writeUInt16LE(f.width, 5);
    id.writeUInt16LE(f.height, 7);
    id[9] = 0x80 | (sizeField & 0x07);
    out.push(id);

    const fullTable = Buffer.alloc((2 << sizeField) * 3);
    f.palette.copy(fullTable);
    out.push(fullTable);

    out.push(Buffer.from([f.minCodeSize]));
    out.push(Buffer.from(f.data));
    out.push(Buffer.from([0x00]));
  }

  out.push(Buffer.from([0x3b]));
  return Buffer.concat(out);
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

  // sharp 0.35's `colours` option routes through a broken colours->bitdepth
  // conversion that only ever yields palettes of 2/4/16/256, so 32/64/128 all
  // collapse to 16 colors and dense photos posterize with a green/olive cast.
  // Set the libvips bitdepth directly to get the requested palette size.
  const bitdepth = clamp(Math.ceil(Math.log2(clamp(colors, 2, 256))), 1, 8);
  const singleGifs = await Promise.all(
    frames.map((f) => {
      const encoder = sharp(f).gif({ dither, effort: HOUSE_STYLE.effort });
      (encoder as unknown as { options: { gifBitdepth: number } }).options.gifBitdepth = bitdepth;
      return encoder.toBuffer();
    }),
  );

  if (singleGifs.length === 1) return singleGifs[0];

  return muxAnimatedGif(singleGifs, frameHoldMs, HOUSE_STYLE.loop);
}
