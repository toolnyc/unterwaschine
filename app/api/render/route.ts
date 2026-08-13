import { NextResponse } from "next/server";
import { renderGif, type CropRect, type OutputFormat, type RenderOptions } from "@/lib/gif";
import { renderMp4 } from "@/lib/mp4";

export const runtime = "nodejs";

function parseNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("photos").filter((v): v is File => v instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Upload at least one photo." }, { status: 400 });
  }

  const formatParam = formData.get("format") as string | null;
  const format: OutputFormat =
    formatParam === "story" || formatParam === "card45" ? formatParam : "card";

  // File format is an explicit choice, independent of aspect: any aspect can
  // export as GIF or MP4.
  const fileFormat = formData.get("fileFormat") === "mp4" ? "mp4" : "gif";

  // Mat defaults to the aspect's house style (cards matted, story full-bleed)
  // when the client doesn't say; the client always sends it explicitly.
  const matParam = formData.get("mat") as string | null;
  const mat = matParam === "true" ? true : matParam === "false" ? false : format !== "story";

  const crops: (CropRect | null)[] = formData.getAll("crops").map((v) => {
    if (typeof v !== "string") return null;
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed as CropRect;
    } catch {
      // ignore malformed crop entries
    }
    return null;
  });

  const options: RenderOptions = {
    format,
    mat,
    matColor: (formData.get("matColor") as string | null) ?? undefined,
    logoOverlay: formData.get("logoOverlay") === "true",
    frameHoldMs: parseNumber(formData.get("frameHoldMs")),
    dither: parseNumber(formData.get("dither")),
    colors: parseNumber(formData.get("colors")),
    scale: parseNumber(formData.get("scale")),
    smoothing: parseNumber(formData.get("smoothing")),
    quality: parseNumber(formData.get("quality")),
    crops: crops.length === files.length ? crops : undefined,
  };

  const photos = await Promise.all(
    files.map(async (file) => Buffer.from(await file.arrayBuffer())),
  );

  try {
    if (fileFormat === "mp4") {
      const mp4 = await renderMp4(photos, options);
      return new NextResponse(new Uint8Array(mp4), {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": 'inline; filename="arq.mp4"',
        },
      });
    }

    const gif = await renderGif(photos, options);
    return new NextResponse(new Uint8Array(gif), {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Content-Disposition": 'inline; filename="arq.gif"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to render output.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
