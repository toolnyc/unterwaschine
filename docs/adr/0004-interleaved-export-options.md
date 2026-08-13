# ADR 0004: Interleaved export options

## Status

Accepted

## Context

Export options were coupled to the aspect choice: `story` forced a full-bleed
MP4, and the card formats forced a matted GIF. Combinations users asked for —
a matted 9:16 card, a full-bleed 4:5 GIF, an MP4 of the email card — were
inexpressible.

## Decision

Decouple the four export axes in the UI and the render pipeline:

- **Aspect** (`card` 1560x2240, `card45` 1560x1950, `story` 1080x1920) now
  defines only the canvas dimensions. `FORMATS` no longer carries
  `cornerRadius`/`matInset`; those live in `CARD_STYLE`.
- **Mat** is an independent boolean. On = house card style (60px inset, 90px
  corner radius, user-chosen color); off = full-bleed with square corners.
  The crop frame's aspect derives from canvas dims + mat state.
- **File format** (GIF or MP4) is an explicit choice for every aspect, sent as
  `fileFormat` to `/api/render`, which dispatches on it instead of on aspect.
- **Size/quality**: output scale applies to both encoders. Palette size
  (`colors`) is GIF-only and hidden for MP4; MP4 gets a quality select mapped
  to the H.264 quantization parameter ([10..51], lower = better, default 20).

Clicking an aspect still applies opinionated defaults (story = full-bleed MP4,
cards = matted GIF) so existing muscle memory is preserved, but every default
stays overridable. Re-clicking the active aspect is a no-op so overrides are
not reset.

## Consequences

- Toggling the mat changes the photo-area aspect, so existing per-photo crops
  are reinterpreted under the new aspect (cover-fit keeps them valid; framing
  can drift slightly). This matches the pre-existing behavior when switching
  between card and story formats.
- GIF at story resolution is large; the output-size control is the remedy,
  and the story default remains MP4.
- The API defaults (`mat` from aspect, GIF unless `fileFormat=mp4`) preserve
  the old behavior for any client that doesn't send the new fields.
