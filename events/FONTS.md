# Event typography assets

Sources were checked against the rendered 2027 sites on 2026-10-03. These are adaptations, not official event card assets. Each `wordcamp-*/fonts/manifest.json` pins that event's binaries, source URLs and edition face selections. `assets/fonts/provenance.json` retains the pre-existing profile-card fonts unchanged. All paths in this document are relative to the repository root unless linked.

- Asia: exact Faculty Glyphic 400 and Kumbh Sans 400/500 WOFF2 served by https://asia.wordcamp.org/2027/.
- Europe: exact Cardo 400 WOFF2 from the current Europe theme. Inter 400/600 reuses the smaller, existing WordPress.org Inter Latin variable font (same observed family and weights, explicitly not byte-identical to the theme's larger binary).
- India: Cardo 700 from the same theme family/weight used by its current announcement; existing Inter as above. No invented regional illustration system.
- US: Open Sans normal 300/400/600, downloaded from the URLs in the captured stylesheet https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&display=swap . The TTF originals are pinned alongside losslessly compressed WOFF2 copies. The generic coming-soon template is not an announced event-specific identity.

Inputs and original notices live in each event's `fonts/` folder. Europe and India include identical copies of the original Inter input and notice so their organizer folders are self-contained; the base copy remains unchanged in `assets/fonts/`. All supplied font binaries are SIL OFL 1.1. Retain `facultyglyphic-OFL.txt`, `kumbhsans-OFL.txt`, `cardo-OFL.txt`, `OpenSans-OFL.txt`, and the existing `Inter-OFL.txt`. Family licenses were retrieved from their Google Fonts `ofl/<family>/OFL.txt` directories. Public notices are appended in `public/FONT-LICENSES.txt`; original license files are unchanged. Font internal names and outlines are not renamed or subsetted. `Event ...` is only a CSS family alias.

## Rebuild offline

Run `python3 tools/build-event-fonts.py` with fontTools 4.57.0 and Brotli support. No runtime dependency or network is required. The generator validates hashes, reproduces the Open Sans WOFF2 conversion from the original TTFs, instantiates variable Inter weight-specific metrics, extracts advance widths and actual outline vertical bounds, emits event-only embedded CSS, and hashes each exact stylesheet for `/card` CSP. `events/fonts.js` is generated and `shared/event-fonts.js` is a compatibility re-export; base `shared/fonts.js`, `shared/svg.js`, and `tools/build-fonts.py` remain untouched.

SVG advance fitting disables kerning/ligatures and synthetic styles to match the recorded metrics. Unsupported Unicode uses conservative width fallback rather than pretending a shaping engine exists. Frame arc baselines use the actual fitted label's ink midpoint, including cap overshoot and punctuation, rather than reusing an Inter cap ratio.
