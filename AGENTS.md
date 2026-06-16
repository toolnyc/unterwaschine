# ARQ GIF Maker

A small web application for non-technical users to ingest product photos and output branded GIFs matching ARQ's defined visual style. GIFs are primarily for email delivery, so file size is a first-class concern.

## Project overview

- Input: one or more product photos (JPEG/PNG)
- Output: a GIF in ARQ's house style — portrait card (1560x2240), large rounded corners, warm cream/butter background border
- Users can adjust: background color, image sequence, frame hold duration, corner radius (within constraints), output compression
- Target audience: non-technical staff, so the UI must be minimal and opinionated

## Reference style (from exported GIFs)

- Canvas: 1560 x 2240px portrait
- Corner radius: ~80–100px (large, card-like)
- Background color: warm cream / butter (~`#F5E4B2`) — adjustable by user
- Pacing: ~700–750ms hold per frame for slideshow GIFs; hard cuts between images
- No transitions (hard cut is the house style)
- The photo fills the rounded-corner card; background color is visible as a border around it

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
