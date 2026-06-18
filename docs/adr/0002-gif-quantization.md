# ADR 0002: GIF quantization via image-q + gifenc

## Status

Accepted (supersedes the encoding decision in ADR 0001)

## Context

GIF cards of product photos (skin, lime garments shot in green parkland) showed
persistent "wrong colored pixels" — green palette entries bleeding into skin,
plus speckle. A harness proved the full-colour card was clean and the artifact
appeared only after quantization: it was the encoder, specifically sharp's
libvips/libimagequant path (median-cut-style palette + error diffusion), not a
white-balance cast or palette starvation.

## Decision

- **Quantize each frame with `image-q`'s `wuquant` palette** (a clustering
  palette) + Floyd-Steinberg dither. Side-by-side renders showed wuquant keeps
  skin clean where the libvips path bled green into it.
- **Write the animation with `gifenc`** (pure-JS), one frame at a time with
  per-frame local color tables. This replaces both `sharp.gif()` and the
  hand-rolled GIF muxer, and drops the `gifBitdepth` libvips workaround.
- **Deliver at email size by default** (Output size 50% ≈ 780px). Downscaling
  averages out any residual dither, and it keeps file size safe (see below).
- **Bake dither on, denoise off; remove both from the UI.** With wuquant these
  sliders are visually indistinguishable on/off, so the user-facing compression
  controls are just Output size + Colors. `lib/gif.ts` still honors `dither`
  and `smoothing` as options for flexibility.

## File-size data (real 3-frame slideshow)

| Encoder | 1560px | 800px |
|---|---|---|
| sharp d0.5 (old) | 7.18 MB | 2.00 MB |
| image-q wu+floyd | 7.98 MB | 2.17 MB |
| image-q wu+riemersma | 8.46 MB (over cap) | 2.27 MB |

Full-res 1560px is at/over the ~8MB target; email-size keeps a multi-frame
slideshow well under it. This is why email size is the default and a full-res
download path is deferred (and, if added, must be floyd-only + frame-guarded).

## Alternatives considered

- **gifski (wasm):** highest-quality for *video* via temporal dithering across
  similar frames, but its single-frame quantizer is the same libimagequant
  sharp uses. No win for hard-cut slideshows; revisit only for the video-GIF
  reference (`undi-gif-3`).
- **gifenc's built-in quantizer:** fast but no dithering, tuned for flat vector
  art, not photographs. We use gifenc only as the container writer.
- **GIFnets (CVPR 2020):** validates the direction (better palette + smarter
  dither beats blind Floyd-Steinberg) but is three CNNs — impractical on Vercel
  serverless and no production library. Its cheap classical analog
  (variance-masked dithering) is a deferred follow-up only if needed.

## Consequences

- `image-q` and `gifenc` are production dependencies; both are pure-JS and run
  on the existing Node.js runtime with no system binaries.
- Encode time grows with resolution: ~5s for 3 frames at 800px, ~17–27s at
  1560px. Email-size default keeps us comfortably inside the function timeout.
- `gifenc` ships no types (see `lib/gifenc.d.ts`) and exports `GIFEncoder` both
  as a named export and as `default` (the factory itself); resolution must pick
  the first callable across export shapes or the bundle 500s.
- Deferred: full-res 1560px download (floyd + frame guard + lossless
  `gifsicle-wasm -O3`); riemersma as an email-size-only option.
