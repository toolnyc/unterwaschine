import { NextResponse } from "next/server";
import { renderGif, type CropRect, type OutputFormat, type RenderOptions } from "@/lib/gif";

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

  const format = (formData.get("format") as string | null) === "story" ? "story" : "card";

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
    format: format as OutputFormat,
    matColor: (formData.get("matColor") as string | null) ?? undefined,
    frameHoldMs: parseNumber(formData.get("frameHoldMs")),
    dither: parseNumber(formData.get("dither")),
    colors: parseNumber(formData.get("colors")),
    scale: parseNumber(formData.get("scale")),
    skinCorrect: parseNumber(formData.get("skinCorrect")),
    crops: crops.length === files.length ? crops : undefined,
  };

  const photos = await Promise.all(
    files.map(async (file) => Buffer.from(await file.arrayBuffer())),
  );

  try {
    const gif = await renderGif(photos, options);
    return new NextResponse(new Uint8Array(gif), {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Content-Disposition": 'inline; filename="arq.gif"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to render GIF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
