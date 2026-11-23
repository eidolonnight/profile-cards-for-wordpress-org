# WordCamp Asia

This folder holds every edition of WordCamp Asia. Keep it year-free.

- [theme.js](theme.js): default colors, style notes and layout choices.
- [artwork.js](artwork.js): original SVG decorations and event headings.
- [fonts/](fonts/): pinned fonts, original licenses and [edition face selections/source records](fonts/manifest.json).
- [frames/](frames/): avatar-frame PNGs supplied by the event's designers, one per role, with their [source, rights and photo window](frames/manifest.json).
- [event.js](event.js): edition IDs, official links, confirmed details and factual check dates.

## Existing treatment

The 2027 avatar frames are the designers' own artwork, supplied as PNGs on 2026-11-22: attending, speaking, volunteering, organising, sponsoring and media partner. `frameDecoration` in `artwork.js` is used only when `tools/draw-event-frames.mjs` draws interim frames for an edition without the designers' artwork; the 2027 edition does not use it.

The social card is still drawn: Faculty Glyphic 400 and Kumbh Sans 400/500; cream, navy and blue with original botanical SVG accents.

These observations date to 2026-10-03, not a new review of the official site. Font provenance and reuse details are preserved in the manifest and [font notes](../FONTS.md).

## Request a change

To replace or add avatar frames, give your agent the new PNGs and the [frame steps in the event guide](../README.md#avatar-frames). Each PNG is square, 1080 × 1080 px (up to 2048 × 2048 px is accepted), the same size for every role, and at most 1 MiB. The 2027 set is 1500 × 1500 px. For other changes, give your agent this folder, the official edition website and approved brand assets. Ask for a focused PR with before-and-after avatar-frame and social-card previews, leaving other events unchanged. The [event guide](../README.md) covers source checks, font rebuilding and verification. Existing editions share this theme/artwork; preserving an older edition's design requires an explicit edition-specific change, not overwriting its ID.
