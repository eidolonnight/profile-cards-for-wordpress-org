# Maintaining event themes

Read [AGENTS.md](../AGENTS.md) first. This guide is for agents and contributors working on local source; it does not authorize publication. The artwork is independently adapted from public event sites, and participation roles are self-reported.

## One folder per event

- [WordCamp Asia](wordcamp-asia/)
- [WordCamp Europe](wordcamp-europe/)
- [WordCamp India](wordcamp-india/)
- [WordCamp US](wordcamp-us/)

Keep every edition of an event in its existing folder, not a new year directory.

| Event-local file | What to change |
| --- | --- |
| `event.js` | Edition records: immutable IDs, years, official links, dates, locations, notes and factual check dates |
| `theme.js` | Default colors, style/source explanation and layout preferences |
| `artwork.js` | Original SVG decorations and event-specific heading composition |
| `fonts/manifest.json` | Pinned binary provenance and the display/body/emphasis selections for each edition |
| `fonts/` | Font binaries, original source TTFs where applicable, and original OFL licenses |

Artwork is currently generated SVG, not a collection of separate PNG/JPG files. Put any future approved event images in that event's folder. Adding a file does not automatically embed or serve it: integrate it through the renderer and explicit runtime allowlist, and preserve export portability and image licensing. Visitor-selected background images remain browser-only and never become repository assets.

Shared event machinery lives at this directory's root: `catalog.js`, `themes.js`, `artwork.js`, `social.js` and generated `fonts.js`. The `shared/` event modules are compatibility re-exports, not editing locations. `shared/options.js` still validates requests; `public/app.js` validates the lightweight catalog and manages automatic colors. `functions/events.js` and `functions/card.js` remain the production handlers.

## Updating a theme with an agent

Give the agent the event folder, official edition website, approved brand guidelines/assets and a clear description of the desired change. Ask for a focused PR with before-and-after avatar-frame and social-card previews. Keep unrelated events unchanged. Do not treat publicly accessible logos or artwork as permission to copy them.

For an existing edition:

1. Verify the sources below before changing facts or style. A file reorganization is not a reason to refresh facts or check dates.
2. Edit the event's `theme.js` for colors/layout choices, `artwork.js` for decoration and headings, or the relevant record in `event.js` for confirmed details. Keep `name` and `label` year-free. Do not retarget an existing edition ID to a different year.
3. If fonts change, update that event's `fonts/manifest.json`, licensed inputs and notes, then regenerate the shared font output. Do not hand-edit generated CSS, metrics or CSP hashes.
4. Verify both layouts, all roles, photo/initials/hidden-photo states, long labels, manual colors and optional details. Check other events for regressions, especially when changing shared code.
5. Include the diff, source links, previews and actual verification results in the handoff. Opening a PR, pushing or deploying requires the appropriate approval.

## Evidence and edition facts

Use the current official edition site, not a prior-year design or search snippet. Record the final URL, actual check date and whether it is a placeholder, announcement page or developed identity. Inspect rendered headings, body text and emphasized text for actual font family/weight, colors and decoration; distinguish declared CSS from loaded/painted fonts. Keep raw captures outside the checkout.

Confirm dates and locations from announcement prose. Unknown fields stay `''`; preserve the precision actually announced. Never promote a placeholder January 1, guessed city or calendar artifact into a confirmed date. Explain conflicting or provisional information in `note`/`styleNote`. Factual `checkedAt` and font/style check dates are separate and must not imply unrelated records were rechecked.

The existing factual checks are historical (2026-10-01); style/font observations are dated 2026-10-03. US details remain empty and its coming-soon styling is provisional. Europe and India adapt announcement pages, not final campaign identities. See [font observations](FONTS.md) and the event-local notes. Revisit official sites only when a refresh is in scope.

The catalog preserves `id`, `name`, `year`, `label`, `dateLabel`, `location`, `url`, `note`, `checkedAt`, `colors` and `styleNote`. Do not add embedded fonts, metrics, images or rendering functions to the public catalog. Its colors are exactly `foreground`, `headerColor`, `nameColor`, `subHeaderColor`, and `badgeLabelColor`, each uppercase six-digit hex without `#`.

The browser validator allows at most 30 unique events and 10 roles. Event IDs match `^[a-z]+-20\d{2}$`; the year, ID and official URL must agree. Use real calendar dates for `checkedAt` even though the validator checks shape. Official URLs are HTTPS on exactly `asia.wordcamp.org`, `europe.wordcamp.org`, `india.wordcamp.org` or `us.wordcamp.org`, with a `/20YY/` path and no credentials, explicit port, query or fragment. A different region/URL shape needs a separately reviewed validator change, not a silent allowlist expansion.

## Adding an edition

Add the new record to the event's `event.js` and its face selections to `fonts/manifest.json`; keep older IDs working. Keep the same event folder. Register its ID explicitly in `themes.js` (`EVENT_THEMES` and `EVENT_LAYOUTS`) and `artwork.js` (`EVENT_ARTWORK`). These registries do not infer new IDs. Reusing the event-local theme/artwork makes those editions share a design; preserving an older edition's treatment requires deliberate edition-specific configuration rather than silently restyling it.

Check catalog order and defaults in `shared/options.js` and `events/social.js`. Adding an edition does not authorize a new default. The selector displays year-free labels, so coexisting editions with duplicate labels need an explicit UX decision. Keep unknown IDs/roles failing closed. Search tests for fixed IDs/counts, extend both offline browser matrices and independent font identity expectations, and regenerate fonts. A genuinely new event needs a new year-free directory, registry entries and explicit browser/staging allowlist entries.

## Fonts and original licenses

Every event's `fonts/manifest.json` has `assets` (the original source URL, hash, byte size, family, weights and any conversion/reuse notes) and `editions` (edition IDs mapped to display/body/emphasis face keys). `path` and `sourcePath` are relative to that event's `fonts/` folder. Preserve complete original notices and update `public/FONT-LICENSES.txt` when a new family is introduced; the generator does not generate public notices. Font software remains OFL-1.1, not the project's GPL.

Europe and India each carry a byte-identical copy of the existing WordPress.org Inter Latin input, so their organizer folders are self-contained. It matches the observed family/weights but is not the larger event-theme binary. Base profile fonts remain in `assets/fonts/`; modifying an event copy does not authorize changing base typography. Shared identical font definitions are deduplicated by the generator; conflicting definitions must not overwrite one another silently.

Open Sans retains pinned original TTFs and losslessly compressed WOFF2 copies. Preserve `sourcePath`, `sourceSha256` and `conversion`. Internal names/outlines are not renamed or subsetted; `Event ...` is only a CSS alias. The generator validates input hashes and conversion bytes rather than fetching missing inputs.

Use an existing compatible Python environment with fontTools 4.57.0 and Brotli support. If needed, create one outside the checkout:

```sh
python3 -m venv "$EVIDENCE/font-tools"
"$EVIDENCE/font-tools/bin/python" -m pip install 'fonttools==4.57.0' Brotli
"$EVIDENCE/font-tools/bin/python" tools/build-event-fonts.py
```

Run from the project root, with an external writable `EVIDENCE` directory. Installation needs package access; generation is offline. Record the actual Brotli/tool versions. Run the generator twice and compare output bytes. It emits `events/fonts.js` with `EVENT_FONT_METRICS`, `EVENT_FONTS`, `EVENT_FONT_CSS`, `EVENT_FONT_STYLE_HASH`, `measureEventText` and `eventInkCenter`. `shared/event-fonts.js` re-exports that API. Base `tools/build-fonts.py` and `shared/fonts.js` are separate.

| Edition | Display | Body | Emphasis |
| --- | --- | --- | --- |
| `asia-2027` | Faculty Glyphic 400 | Kumbh Sans 400 | Kumbh Sans 500 |
| `europe-2027` | Cardo 400 | Inter 400 | Inter 600 |
| `india-2027` | Cardo 700 | Inter 400 | Inter 600 |
| `us-2027` | Open Sans 300 | Open Sans 400 | Open Sans 600 |

Display faces cover headings, curved event labels, names and permitted fallback initials; body faces cover handles and available metadata; emphasis faces cover role statements. Asia's curved role uses its display face. Verify every text role's actual painted family and weight, not only its declaration or `data-face` attribute.

Fitting uses pinned advances and glyph ink bounds with bounded shrinking/truncation. SVG text disables synthetic weights, kerning and ligatures to match those metrics. Unsupported scripts use conservative fallback widths, not a full shaping engine. Frame ink is centered at radius 463 inside the 400–526 annulus; top/bottom baselines use the fitted label's actual ink midpoint. Preserve the 1.25 px radial-centering tolerance, unclipped ink and transparent center/corners. Social cards retain their separate 1080×1350 composition.

CSP authorizes the exact generated per-event stylesheet, with `font-src data:` and no remote font dependency. Regenerate hashes; never add `unsafe-inline` to hide a mismatch.

## Delivery and local verification

`tools/browser-modules.mjs` explicitly maps browser-safe shared/event modules to `/preview/` URLs. `tools/serve.mjs` and `tools/stage.mjs` use that map; staging also creates byte-identical backend copies. Browser import and re-export specifiers are rewritten to their public aliases and exact asset revision. Do not edit generated copies or version strings. Source font binaries, manifests and documentation are excluded from hosting. Verify the complete compiled public module graph, not only source-stage presence.

Use Node.js 20.19.0 or newer. The optional browser tools are not application dependencies; supply an installed Playwright ESM entry, Chromium executable and axe script using `PLAYWRIGHT_MODULE`, `CHROMIUM` and `AXE_PATH`. Keep evidence outside the checkout and run browser suites sequentially on constrained hosts. See [AGENTS.md](../AGENTS.md) for setup and [technical reference](../docs/technical-reference.md) for compatibility/deployment details.

```sh
node --test --test-concurrency=1 tests/*.test.mjs
EVIDENCE_DIR="$EVIDENCE/event-fonts" node tests/event-themes-browser.mjs
EVIDENCE_DIR="$EVIDENCE/frame-centering" node tests/frame-centering-browser.mjs
```

These two browser suites start their own loopback fixture servers (port 4215 and an ephemeral port respectively). They do not read `TEST_ORIGIN` or require a dev server. Fixtures are synthetic test data, not official assets or live-profile evidence. Font tests exercise the real `/card` handler, strict CSP, painted PostScript identities, deliberate fallback rejection and actual PNG rasterization.

For real-profile builder tests, start `PORT=4197 npm run dev` in another terminal and wait for `/events` to respond. Set `TEST_ORIGIN=http://127.0.0.1:4197` explicitly; script defaults differ. Leave `BROWSER_STATE`, `EXPECTED_VERSION` and `PREVIEW_SOURCE_DIR` unset for normal local checks.

```sh
EVIDENCE_DIR="$EVIDENCE/event-colors" node tests/event-colors-browser.mjs
EVIDENCE_DIR="$EVIDENCE/social" node tests/social-browser.mjs
EVIDENCE_DIR="$EVIDENCE/preview" node tests/preview-browser.mjs
EVIDENCE_DIR="$EVIDENCE/background" node tests/background-browser.mjs
EXPECT_LOCAL_RENDER=1 EVIDENCE_DIR="$EVIDENCE/performance" node tests/preview-performance.mjs
```

These suites need live upstream profile access; social acceptance also requires `AXE_PATH`. Run modern-builder/control-layout checks if shared UI or ordinary layouts change. A skipped axe check or passing bounded Chromium suite is not full WCAG conformance.

Before handoff, compare canonical server/browser/downloaded SVG bytes for equal inputs, exercise actual PNG downloads, and inspect the images. Check event palette switching, individual/URL overrides, Light/Dark persistence, Event colors reset, site-theme independence, missing photos, omissions, long text, transparency and stale-export rejection. Local backgrounds intentionally differ from server output; verify compositing and exact restoration after removal instead. Keep failed evidence and repair defects rather than weakening checks.

Local edits, generation, tests and staging do not authorize commit, push, PR creation or deployment. Follow the requested approval boundary and the release procedure in [AGENTS.md](../AGENTS.md). Never include credentials, browser state, private deployment identifiers or verification captures in the source or runtime output.
