import { NextResponse } from "next/server";
import { renderGif } from "@/lib/gif";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("photos").filter((v): v is File => v instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Upload at least one photo." }, { status: 400 });
  }

  const photos = await Promise.all(
    files.map(async (file) => Buffer.from(await file.arrayBuffer())),
  );

  try {
    const gif = await renderGif(photos);
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
