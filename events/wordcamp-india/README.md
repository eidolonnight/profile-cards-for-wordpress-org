# WordCamp India

This folder holds every edition of WordCamp India. Keep it year-free.

- [theme.js](theme.js): default colors, style notes and layout choices.
- [artwork.js](artwork.js): original SVG decorations and event headings.
- [fonts/](fonts/): pinned fonts, original licenses and [edition face selections/source records](fonts/manifest.json).
- [frames/](frames/): avatar-frame PNGs, one per role, with their [source, rights and photo window](frames/manifest.json). The 2027 set is interim artwork drawn by this project, not supplied by the event.
- [event.js](event.js): edition IDs, official links, confirmed details and factual check dates.

## Existing treatment

Cardo 700 and Inter 400/600 on a dark ground with orange/green accents. This adapts the announcement page, not a final host-city identity.

These observations date to 2026-10-03, not a new review of the official site. Font provenance and reuse details are preserved in the manifest and [font notes](../FONTS.md).

The 2027 avatar frames are interim: this project drew them from the treatment above with `tools/draw-event-frames.mjs`, in the format organizers supply. Replace them with the designers' PNGs when those arrive.

## Request a change

To supply avatar frames, give your agent the PNGs and the [frame steps in the event guide](../README.md#avatar-frames). Each PNG is square, 1080 × 1080 px (up to 2048 × 2048 px is accepted), the same size for every role, and at most 1 MiB. For other changes, give your agent this folder, the official edition website and approved brand assets. Ask for a focused PR with before-and-after avatar-frame and social-card previews, leaving other events unchanged. The [event guide](../README.md) covers source checks, font rebuilding and verification. Existing editions share this theme/artwork; preserving an older edition's design requires an explicit edition-specific change, not overwriting its ID.
