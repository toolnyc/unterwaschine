# ADR 0003: Logo overlay and 4:5 card format

## Status

Accepted

## Context

Two export needs came up together: an optional brand mark burned into the GIF
(so frames stay branded when reposted without the surrounding email chrome),
and a 4:5 aspect for feed placements where the tall 1560x2240 card crops
awkwardly.

## Decision

- **Optional white-logo overlay.** The white ARQ logo
  (`lib/assets/arq-logo-white.png`) is composited onto every frame at 215px
  wide on a 1080px-wide canvas; that width ratio (472/1080) is held across all
  formats and output sizes, and the logo is resized by width only so it never
  distorts. Placement: horizontally centred, with the *bottom* edge of the
  logo resting on the vertical centre of the frame — the mark sits just above
  the midline regardless of format. It is off by default and toggled by a
  single "Logo overlay" checkbox; the composited layer is prepared once per
  render and reused across frames.
- **4:5 as a house-style card, not full-bleed.** The new `card45` format is
  1560x1950 with the same mat inset (60px) and corner radius (90px) as `card`.
  The card *is* the house style, so the 4:5 variant keeps it rather than
  copying the full-bleed story treatment.

## Consequences

- The logo PNG is read from disk at render time and cached per process; it is
  force-included in the serverless bundle via `outputFileTracingIncludes`.
- The overlay participates in quantization like any other frame content, so a
  flat white mark adds negligible file size.
- Crop UI aspect ratios derive from `OUTPUT_DIMS`, so per-photo cropping works
  unchanged for the 4:5 card.
