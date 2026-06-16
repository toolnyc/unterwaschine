import sharp from "sharp";

export const HOUSE_STYLE = {
  canvasWidth: 1560,
  canvasHeight: 2240,
  matColor: "#F5E4B2",
  cornerRadius: 90,
  // Cream margin between the canvas edge and the photo card.
  // Tuned visually against optimized-gif.gif.
  matInset: 60,
  frameHoldMs: 700,
  loop: 0,
} as const;

function roundedMask(width: number, height: number, radius: number): Buffer {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></svg>`;
  return Buffer.from(svg);
}

async function renderFrame(photo: Buffer): Promise<Buffer> {
  const { canvasWidth, canvasHeight, matColor, cornerRadius, matInset } = HOUSE_STYLE;
  const cardWidth = canvasWidth - matInset * 2;
  const cardHeight = canvasHeight - matInset * 2;

  const card = await sharp(photo)
    .resize(cardWidth, cardHeight, { fit: "cover", position: "centre" })
    .composite([{ input: roundedMask(cardWidth, cardHeight, cornerRadius), blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: matColor,
    },
  })
    .composite([{ input: card, top: matInset, left: matInset }])
    .png()
    .toBuffer();
}

export async function renderGif(photos: Buffer[]): Promise<Buffer> {
  if (photos.length === 0) {
    throw new Error("At least one photo is required.");
  }

  const frames = await Promise.all(photos.map(renderFrame));
  const { frameHoldMs, loop } = HOUSE_STYLE;

  return sharp(frames, { join: { animated: true } })
    .gif({ delay: frames.map(() => frameHoldMs), loop })
    .toBuffer();
}
