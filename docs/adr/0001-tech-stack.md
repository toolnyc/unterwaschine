# ADR 0001: Tech stack and GIF encoding approach

## Status

Accepted. The GIF *encoding/quantization* decision below (sharp's GIF encoder)
is superseded by ADR 0002 (image-q + gifenc); the Next.js/Vercel/sharp-for-
compositing stack still stands.

## Context

Unterwaschine turns product photos into branded GIF cards for email delivery.
Output file size is a first-class constraint. We need a stack that is simple to
run locally for non-technical handoff and deploys cleanly.

## Decision

- **Next.js + TypeScript** (App Router). Local dev is `npm run dev`; the API
  route handler (`app/api/render`) becomes the Vercel serverless function on
  deploy, so there is no separate backend to manage.
- **Server-side GIF encoding via `sharp`.** Each frame is composited on the
  server (cream mat, rounded-corner card via an SVG `dest-in` mask, cover-fit
  photo), then frames are joined into a single looping animated GIF with
  per-frame delay. `sharp` is a single dependency Vercel supports natively.
- **Tracer-bullet scope first:** upload multiple photos → render a multi-frame
  slideshow GIF with hardcoded house-style defaults → preview and download.

## Alternatives considered

- **Client-side canvas + gifenc/gif.js:** no backend, but larger output and
  the file-size constraint pushed us toward server-side encoding.
- **ffmpeg / gifski on the lambda:** slightly better compression, but a heavy
  binary with more lambda-size friction. Revisit only if `sharp` output sizes
  disappoint.

## Consequences

- House-style constants live in `lib/gif.ts` (canvas 1560×2240, mat `#F5E4B2`,
  90px radius, 60px mat inset, 700ms hold, infinite loop). `matInset` is tuned
  visually against `optimized-gif.gif`.
- The render route must run on the Node.js runtime (`runtime = "nodejs"`), not
  Edge, because `sharp` is a native module.
- Vercel serverless request body limit (~4.5MB) bounds batch size; flag for
  larger batches later.
- Deferred features (drag-reorder, mat-color picker, frame-hold / corner-radius
  / compression / scale controls) hang off this skeleton.
