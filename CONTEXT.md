# ARQ GIF Maker — Domain Context

## What this app does

A browser-based tool for non-technical users at ARQ (a lingerie/apparel brand) to produce branded GIFs from product photos. The primary delivery channel is email campaigns, so output file size is a first-class constraint.

## Core concepts

**GIF card** — the output artifact. A portrait-oriented, rounded-corner image card rendered as an animated GIF. The card has a colored background border (the "mat") surrounding the photo content.

**Mat** — the visible background color surrounding the photo inside the GIF card. Default is warm cream (`#F5E4B2`). User-adjustable.

**Frame** — one photo in the sequence. Each frame holds for a configurable duration before cutting to the next. No transition animations; hard cuts only.

**Frame hold** — the duration (in milliseconds) each frame is displayed before advancing. Default ~700ms.

**Sequence** — the ordered list of frames the user has arranged for a single GIF. Users can drag to reorder.

**Corner radius** — the rounded-corner clipping applied to the GIF card. Large by default (~80–100px on a 1560x2240 canvas). User-adjustable within a constrained range.

**Compression** — settings that trade visual quality for smaller file size. Each frame is quantized to its own local palette with a perceptual clustering quantizer (image-q wuquant), which avoids the color casts a naive palette puts on skin. User-facing controls are **Output size** (the biggest lever) and **Colors** (2–256). Dithering and denoise are baked in (not exposed), since the quantizer makes them visually moot. See `docs/adr/0002-gif-quantization.md`.

## Output spec (house style)

- Canvas: 1560 × 2240px
- Format: GIF (looping)
- Corner radius: 80–100px (default 90px)
- Mat color: ~`#F5E4B2` (warm cream / butter yellow)
- Frame transitions: hard cut
- Default frame hold: 700ms
- Loop: infinite

## What users can change

- Mat (background) color
- Images (upload, remove, reorder)
- Frame hold duration
- Corner radius (within a bounded range, e.g. 40–150px)
- Colors (palette size, 2–256)
- Output size (e.g. full size vs. email size for a smaller file)

## What users cannot change (baked-in style)

- Canvas aspect ratio (always portrait 1560 × 2240 or a scaled version)
- Transition type (always hard cut)
- Frame layout (photo always fills the rounded card, centered/cover-fit)

## Glossary — avoid these synonyms

- Say "mat" not "border" or "background padding"
- Say "frame" not "slide" or "image"
- Say "sequence" not "playlist" or "timeline"
- Say "corner radius" not "border radius" (the UI label; internally either is fine)
- Say "GIF card" not "animation" or "banner"

## Reference files

- `/Users/pete/Dropbox/_Clients/Prospective/ARQ/Exports/optimized-gif.gif` — 3-frame slideshow, canonical style reference
- `/Users/pete/Dropbox/_Clients/Prospective/ARQ/Exports/undi-gif-3-260601.gif` — 128-frame video GIF, same card style
- `/Users/pete/Dropbox/_Clients/Prospective/ARQ/Assets/bra-1.jpeg` — sample source photo
