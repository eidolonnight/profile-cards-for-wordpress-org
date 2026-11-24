# WordCamp Asia

This folder holds every edition of WordCamp Asia. Keep it year-free.

- [theme.js](theme.js): default colors and style notes.
- [fonts/](fonts/): pinned fonts, original licenses and [edition face selections/source records](fonts/manifest.json).
- [frames/](frames/): avatar-frame PNGs supplied by the event's designers, one per role, with their [source, rights and photo window](frames/manifest.json), and the band derived from each frame for the social card.
- [event.js](event.js): edition IDs, official links, confirmed details and factual check dates.

## Existing treatment

The 2027 avatar frames are the designers' own artwork, supplied as PNGs on 2026-11-22: attending, speaking, volunteering, organising, sponsoring and media partner.

The 2027 social card is made from those frames: the square frame under its band, which continues the frame's background to the top of the card. See [social cards from frames](../README.md#social-cards-from-frames). The name and username are set in Kumbh Sans 400, the face of the artwork's place and date lines, in the artwork's cream (`F8E7D5`) or navy (`000073`). Faculty Glyphic 400, the face of the artwork's lettering and logo, sets the initials shown when a profile has no photo. Nothing is drawn for this edition, so the folder has no `artwork.js`.

The fonts were observed on the official site on 2026-10-03. Font provenance and reuse details are preserved in the manifest and [font notes](../FONTS.md).

## Request a change

To replace or add avatar frames, give your agent the new PNGs and the [frame steps in the event guide](../README.md#avatar-frames). Each PNG is square, 1080 × 1080 px (up to 2048 × 2048 px is accepted), the same size for every role, and at most 1 MiB. The 2027 set is 1500 × 1500 px. New frames need new bands. For other changes, give your agent this folder, the official edition website and approved brand assets. Ask for a focused PR with before-and-after avatar-frame and social-card previews, leaving other events unchanged. The [event guide](../README.md) covers source checks, font rebuilding and verification. Existing editions share this theme; preserving an older edition's design requires an explicit edition-specific change, not overwriting its ID.
