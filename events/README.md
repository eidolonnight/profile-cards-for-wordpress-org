# Maintaining event themes

Read [AGENTS.md](../AGENTS.md) first. This guide is for agents and contributors working on local source; it does not authorize publication. Drawn artwork is independently adapted from public event sites. [Avatar frames](#avatar-frames) are PNG artwork: supplied by an event's designers, or drawn by this project as a stand-in until they are. Participation roles are self-reported either way.

## One folder per event

- [WordCamp Asia](wordcamp-asia/)
- [WordCamp Europe](wordcamp-europe/)
- [WordCamp India](wordcamp-india/)

Keep every edition of an event in its existing folder, not a new year directory.

| Event-local file | What to change |
| --- | --- |
| `event.js` | Edition records: immutable IDs, years, official links, dates, locations, notes and factual check dates |
| `theme.js` | Default colors and style/source explanation |
| `artwork.js` | Original SVG decorations and event-specific heading composition, for a social card drawn here and for interim frames. An event whose social card is made from its frames has none |
| `fonts/manifest.json` | Pinned binary provenance and the display/body/emphasis selections for each edition |
| `fonts/` | Font binaries and original OFL licenses |
| `frames/manifest.json`, `frames/*.png` | Avatar-frame PNGs, one per role, with their source, rights and photo window: the event designers' artwork, or the project's interim frames until that arrives. Also each frame's band, where the [social card is made from the frames](#social-cards-from-frames) |

Social cards are generated SVG. Avatar frames are the profile photo under PNG artwork. Adding an image file does not embed or serve it: frames enter the renderer only through their manifest, the frame generator and the explicit runtime allowlist. Preserve export portability and image licensing. Visitor-selected background images remain browser-only and never become repository assets.

Shared event machinery lives at this directory's root: `catalog.js`, `themes.js`, `artwork.js`, `social.js`, generated `fonts.js`, the generated frame registry `frames.js`, and the browser-only `frame-loader.js`. The `shared/` event modules are compatibility re-exports, not editing locations. `shared/options.js` still validates requests; `public/app.js` validates the lightweight catalog and manages automatic colors. `functions/events.js` and `functions/card.js` remain the production handlers.

## Updating a theme with an agent

Give the agent the event folder, official edition website, approved brand guidelines/assets and a clear description of the desired change. Ask for a focused PR with before-and-after avatar-frame and social-card previews. Keep unrelated events unchanged. Do not treat publicly accessible logos or artwork as permission to copy them.

For an existing edition:

1. Verify the sources below before changing facts or style. A file reorganization is not a reason to refresh facts or check dates.
2. Edit the event's `theme.js` for colors, `artwork.js` for decoration and headings, or the relevant record in `event.js` for confirmed details. Keep `name` and `label` year-free. Do not retarget an existing edition ID to a different year.
3. If fonts change, update that event's `fonts/manifest.json`, licensed inputs and notes, then regenerate the shared font output. Do not hand-edit generated CSS, metrics or CSP hashes.
4. Verify both layouts, all roles, both avatar-frame shapes, photo and initials states, long labels, manual colors and optional details. Redraw [interim frames](#interim-frames) when a label, font or frame decoration changes. Check other events for regressions, especially when changing shared code.
5. Include the diff, source links, previews and actual verification results in the handoff. Opening a PR, pushing or deploying requires the appropriate approval.

## Evidence and edition facts

Use the current official edition site, not a prior-year design or search snippet. Record the final URL, actual check date and whether it is a placeholder, announcement page or developed identity. Inspect rendered headings, body text and emphasized text for actual font family/weight, colors and decoration; distinguish declared CSS from loaded/painted fonts. Keep raw captures outside the checkout.

Confirm dates and locations from announcement prose. Unknown fields stay `''`; preserve the precision actually announced. Never promote a placeholder January 1, guessed city or calendar artifact into a confirmed date. Explain conflicting or provisional information in `note`/`styleNote`. Factual `checkedAt` and font/style check dates are separate and must not imply unrelated records were rechecked.

The existing factual checks are historical (2026-10-01); style/font observations are dated 2026-10-03. Europe and India adapt announcement pages, not final campaign identities. See [font observations](FONTS.md) and the event-local notes. Revisit official sites only when a refresh is in scope.

The catalog preserves `id`, `name`, `year`, `label`, `dateLabel`, `location`, `url`, `note`, `checkedAt`, `colors` and `styleNote`. An edition with avatar frames also lists `frameRoles`, the role IDs its artwork covers, and `frameCard: true` when those frames have bands, so its social card is made from them. Do not add embedded fonts, metrics, images or rendering functions to the public catalog. Its colors are exactly `foreground`, `headerColor`, `nameColor`, `subHeaderColor`, and `badgeLabelColor`, each uppercase six-digit hex without `#`.

The browser validator allows at most 30 unique events and 10 roles. Event IDs match `^[a-z]+-20\d{2}$`; the year, ID and official URL must agree. Use real calendar dates for `checkedAt` even though the validator checks shape. Official URLs are HTTPS on exactly `asia.wordcamp.org`, `europe.wordcamp.org`, `india.wordcamp.org` or `us.wordcamp.org`, with a `/20YY/` path and no credentials, explicit port, query or fragment. A different region/URL shape needs a separately reviewed validator change, not a silent allowlist expansion.

## Adding an edition

Add the new record to the event's `event.js` and its face selections to `fonts/manifest.json`; keep older IDs working. Avatar frames are per edition: a new edition has none, and no avatar-frame format, until its own files are listed in `frames/manifest.json`. Draw [interim frames](#interim-frames) if the organizers have not supplied theirs. Keep the same event folder. Register its ID explicitly in `themes.js` (`EVENT_THEMES`) and, when its social card or interim frames are drawn here, in `artwork.js` (`EVENT_ARTWORK`). These registries do not infer new IDs. Reusing the event-local theme/artwork makes those editions share a design; preserving an older edition's treatment requires deliberate edition-specific configuration rather than silently restyling it.

Check catalog order and defaults in `shared/options.js` and `events/social.js`. Adding an edition does not authorize a new default. The selector displays year-free labels, so coexisting editions with duplicate labels need an explicit UX decision. Keep unknown IDs/roles failing closed. Search tests for fixed IDs/counts, extend both offline browser matrices and independent font identity expectations, and regenerate fonts. A genuinely new event needs a new year-free directory, registry entries and explicit browser/staging allowlist entries.

## Avatar frames

Every WordCamp avatar frame is PNG artwork: one square file per edition and role, in the event's `frames/` folder. Organizers and their designers supply it. Until they do, an edition uses interim frames that this project draws in the same format. The WordCamp Asia 2027 frames in [wordcamp-asia/frames/](wordcamp-asia/frames/) are the reference set of organizer artwork; Europe and India 2027 currently use interim frames.

### What to ask designers for

One PNG per role, in these sizes. `tools/build-event-frames.mjs` rejects anything outside the required column.

| | Required | Recommended |
| --- | --- | --- |
| Canvas | Square, from 1080 × 1080 px to 2048 × 2048 px | 1080 × 1080 px |
| Across roles | The same size for every role of an edition | |
| File size | At most 1 MiB (1,048,576 bytes) per PNG, after lossless optimization | |
| Photo window | One circle, fully inside the canvas, with the same center and radius on every role | |

People download a 1080 × 1080 px PNG, so that is the size to design for. A larger canvas is scaled down and does not make the download sharper. For reference, WordCamp Asia 2027 sent 1500 × 1500 px with a 1000 px wide window, and the interim frames are 1080 × 1080 px with an 800 px wide window.

Also:

- 8-bit RGBA, not interlaced, not animated.
- The photo window left transparent. A gradient, logo or decoration may overlap the window; it is drawn over the photo.
- Everything outside the window fully opaque, right to the canvas edge.
- Everything that matters inside the circle that touches all four edges. People download the frame as a circle by default (the square cropped to that circle, with transparent corners) or as the full square.
- Role, event name, dates and decoration baked into the artwork. The tool adds no lettering to a frame.
- The same window position and size for every role of an edition.
- Written permission to redistribute the artwork in this public repository and on the hosted site, with the credit line to use.

### Adding or replacing frames

1. Name each file `<edition>-<role>.png`, for example `asia-2027-speaker.png`, and put it in the event's `frames/` folder. Role IDs come from `ROLES` in `catalog.js`. A role the catalog lacks needs a new `ROLES` entry; every social card then offers it, and each edition's avatar frame offers it once that edition has artwork for it.
2. Losslessly optimize large exports, for example `oxipng -o 6 --strip safe --nc --nb --np --ng`. Keep RGBA. Never resize or quantize supplied artwork.
3. Measure the photo window in source pixels: `node tools/build-event-frames.mjs --measure events/wordcamp-asia/frames/asia-2027-speaker.png`.
4. Record everything in `frames/manifest.json`:
   - `editions.<id>.window`: `cx`, `cy`, `r` of the photo window in source pixels.
   - `editions.<id>.roles`: role ID to file name. Only listed roles are offered for that edition's avatar frame.
   - `source` and `rights`: who supplied the artwork and on what terms. Supplied artwork is never relabeled as project-licensed.
   - `assets[]`: `path`, `sha256`, `bytes`, `width`, `height`, `sourceName` (the file name as received), and, when the committed file differs from the supplied one, `sourceSha256`, `sourceBytes` and a `conversion` note saying exactly what changed.
5. Run `node tools/build-event-frames.mjs`. It validates every file against the manifest and the window contract, then writes the registry `frames.js`: photo geometry, size and hash per edition and role, and no image bytes. Never hand-edit it. `--check` fails when it is stale; the unit suite runs it. The PNGs themselves are published unchanged; nothing else is generated from them.
6. Fix the artwork, not the checks, when validation fails. The usual defects are a background that stops short of the canvas edge, a window that differs between roles, or an export without alpha. If a defect must be patched locally, say so in `conversion` and ask the designers for a clean export.

When organizer artwork replaces interim frames, remove the interim PNGs, and rewrite the manifest's `source`, `rights`, `window` and `assets` for the new files. Do not keep interim and organizer frames for the same edition side by side.

### Interim frames

An edition without a `frames/` folder has no avatar frame: the builder cannot make one for it. Draw interim frames so a new edition is not left without one.

1. Draw them: `node tools/draw-event-frames.mjs europe-2027 "$EVIDENCE/frames" --png`, with `PLAYWRIGHT_MODULE` and `CHROMIUM` set as for the browser checks below. It writes one SVG and one 1080 px PNG per role. The lettering is the edition's `label` and each role's `statement`, in the event's fonts and colors, with `frameDecoration` from the event's `artwork.js`. Without `--png` it writes the SVGs only and needs no browser.
2. Look at every PNG. Lettering in a fallback face means the event fonts did not load; the tool stops when it detects that.
3. Optimize the PNGs losslessly, copy them into `frames/`, and write the manifest as above with these differences:
   - `window` is `{ "cx": 540, "cy": 540, "r": 400 }`.
   - `source` starts with `Interim frames drawn by this project` and says the files were not supplied by the event's organizers or designers. `rights` says they are project artwork and not official event artwork.
   - Each asset's `sourceName` is the SVG file name, with that SVG's `sourceSha256` and `sourceBytes`, and a `conversion` note naming the browser version used.
4. Run `node tools/build-event-frames.mjs`.

`npm test` compares each interim frame's recorded SVG hash with what the tool draws now. It fails after a change to an event label, a role statement, an event font or `frameDecoration`: redraw the frames. Organizer artwork is never redrawn or regenerated.

### How avatar frames behave

- Avatar frames are made in the builder only, and download as a PNG only. `/card` has no artwork and rejects `layout=avatar`.
- The frame PNGs are published as plain static files at `/frames/<edition>-<role>.png`, served from the CDN like any other image. Staging and the local adapter publish exactly the files the registry names; a manifest or any other file in a `frames/` folder is never published.
- The builder fetches each PNG at most once per page, checks its size and SHA-256 against the registry, and embeds the selected one in the image it renders. The address carries the registry hash (`?v=<sha256>`), so a replaced frame is never served from a cache under its old address. The file is embedded, not linked, because an SVG shown or exported as an image does not load linked files.
- Selecting an edition for an avatar frame loads the selected role's PNG first, then the edition's other roles at low priority, so switching **I'm…** does not wait on the network. That downloads every role's artwork for the edition: at most 1 MiB per frame, about 1.9 MB in total for WordCamp Asia 2027. A frame that fails to load in the background shows no error and is fetched again when it is chosen.
- The builder places the profile photo, or the fallback initials, in a circle three output pixels larger than the window, then draws the PNG on top at the native 1080×1080 size.
- The profile photo is always included. The builder has no photo checkbox for this format, and a shared link with `avatar=false` is rejected.
- `shape=circle`, the default, crops photo and artwork together to the circle that touches all four edges, leaving the corners transparent. `shape=square` keeps the whole artwork. The builder offers both under **Shape**. One PNG per role serves both.
- Only roles with artwork are offered. A shared link naming any other role is rejected, and artwork that is missing or does not match the registry stops the image with a clear message. Another edition's or role's artwork is never substituted, and nothing is drawn in its place.
- Colors and local backgrounds do not apply. The builder hides those controls, sends no color parameters and skips background compositing. The same edition's social card stays drawn and keeps every role, color and background option, unless it is made from the frames (next section).
- No frame bytes are in JavaScript or in the Functions bundle. A frame costs its PNG size in the repository and the published site, nothing more.

### Social cards from frames

An edition can use its square frames for the 4:5 social card too, instead of a card the project draws. WordCamp Asia 2027 does.

- The card is 1080 × 1350. The frame, with the photo under it, fills the lower 1080 × 1080. Above it is the frame's band: 270 units of the frame's own background, continued to the top of the card. The band carries the name and, if chosen, the username.
- A band is one PNG per role, `<edition>-<role>-band.png`, derived from that role's frame. A frame's background is a flat color or a pattern that repeats on a square grid, so the frame itself says what belongs above its top edge. Nothing is drawn by hand.
- Make them with `node tools/build-event-frames.mjs --bands asia-2027 "$EVIDENCE/bands"`. Optimize the PNGs losslessly as for frames, copy them into `frames/`, list them under `editions.<id>.bands` (role ID to file name, the same roles as `roles`) and in `assets[]` with the frame's file name as `sourceName`, then run the generator. It derives each band again and fails unless the file matches pixel for pixel, so a band always follows its frame. Replace a frame and its band must be made again.
- A band needs the top 16 px of its frame to hold background only, and a background that is flat or repeats regularly. The tool says so when a frame has neither; that edition keeps a drawn social card.
- The edition's social card is made from frames exactly when every role has a band. There is no other switch. `frameCard: true` then appears on the edition in the catalog.
- A band is as wide as its frame and 8 px taller than the 270 units it shows. Those last rows repeat the frame's top rows and sit under the frame, so the two images meet without a seam at any size. The frame's ground color lies under everything, so the card stays opaque behind a photo that is not.
- The name and username are set in the edition's body face, centered, like the artwork's own lines of text. They use the edition's `nameColor` or `foreground`, whichever reads on the frame's ground: the most common color along the artwork's top edge, recorded per role as `ground` in `events/frames.js`.
- The artwork already states the role, event, dates and place, so the card draws none of them.
- Bands are published beside the frames, at `/frames/<edition>-<role>-band.png`, and loaded, checked and preloaded the same way. WordCamp Asia 2027's six come to about 160 KB.
- Everything in [How avatar frames behave](#how-avatar-frames-behave) applies except shape: builder-only, PNG download, only roles with artwork, no colors, no local background, no substitute design, and `/card` rejects the edition's `layout=announcement`.

## Fonts and original licenses

Every event's `fonts/manifest.json` has `assets` (the original source URL, hash, byte size, family, weights and any reuse notes) and `editions` (edition IDs mapped to display/body/emphasis face keys). `path` is relative to that event's `fonts/` folder. Preserve complete original notices and update `public/FONT-LICENSES.txt` when a new family is introduced; the generator does not generate public notices. Font software remains OFL-1.1, not the project's GPL.

Europe and India each carry a byte-identical copy of the existing WordPress.org Inter Latin input, so their organizer folders are self-contained. It matches the observed family/weights but is not the larger event-theme binary. Base profile fonts remain in `assets/fonts/`; modifying an event copy does not authorize changing base typography. Shared identical font definitions are deduplicated by the generator; conflicting definitions must not overwrite one another silently.

Internal names/outlines are not renamed or subsetted; `Event ...` is only a CSS alias. The generator validates input hashes rather than fetching missing inputs.

Use an existing compatible Python environment with fontTools 4.57.0 and Brotli support. If needed, create one outside the checkout:

```sh
python3 -m venv "$EVIDENCE/font-tools"
"$EVIDENCE/font-tools/bin/python" -m pip install 'fonttools==4.57.0' Brotli
"$EVIDENCE/font-tools/bin/python" tools/build-event-fonts.py
```

Run from the project root, with an external writable `EVIDENCE` directory. Installation needs package access; generation is offline. Record the actual Brotli/tool versions. Run the generator twice and compare output bytes. It emits `events/fonts.js` with `EVENT_FONT_METRICS`, `EVENT_FONTS`, `EVENT_FONT_CSS`, `EVENT_FONT_STYLE_HASH`, `measureEventText` and `eventInkCenter`. `shared/event-fonts.js` re-exports that API. Base `tools/build-fonts.py` and `shared/fonts.js` are separate.

| Edition | Display | Body | Emphasis |
| --- | --- | --- | --- |
| `asia-2027` | Faculty Glyphic 400 | Kumbh Sans 400 | Kumbh Sans 400 |
| `europe-2027` | Cardo 400 | Inter 400 | Inter 600 |
| `india-2027` | Cardo 700 | Inter 400 | Inter 600 |

Display faces cover headings, curved event labels, names and permitted fallback initials; body faces cover handles and available metadata; emphasis faces cover role statements. On a social card made from frames the name is set in the body face, like the artwork's own text. Verify every text role's actual painted family and weight, not only its declaration or `data-face` attribute.

Fitting uses pinned advances and glyph ink bounds with bounded shrinking/truncation. SVG text disables synthetic weights, kerning and ligatures to match those metrics. Unsupported scripts use conservative fallback widths, not a full shaping engine. In the interim frames that `tools/draw-event-frames.mjs` draws, ink is centered at radius 463 inside the 400–526 annulus; top/bottom baselines use the fitted label's actual ink midpoint. Preserve the 1.25 px radial-centering tolerance, unclipped ink, the transparent photo window and the opaque ground to every edge. Social cards retain their separate 1080×1350 composition.

CSP authorizes the exact generated per-event stylesheet, with `font-src data:` and no remote font dependency. Regenerate hashes; never add `unsafe-inline` to hide a mismatch.

## Delivery and local verification

`tools/browser-modules.mjs` explicitly maps browser-safe shared/event modules to `/preview/` URLs. `tools/serve.mjs` and `tools/stage.mjs` use that map; staging also creates byte-identical backend copies. Browser import and re-export specifiers are rewritten to their public aliases and exact asset revision. Do not edit generated copies or version strings. Source font binaries, manifests and documentation are excluded from hosting. Verify the complete compiled public module graph, not only source-stage presence.

Use Node.js 20.19.0 or newer. The optional browser tools are not application dependencies; supply an installed Playwright ESM entry, Chromium executable and axe script using `PLAYWRIGHT_MODULE`, `CHROMIUM` and `AXE_PATH`. Keep evidence outside the checkout and run browser suites sequentially on constrained hosts. See [AGENTS.md](../AGENTS.md) for setup and [technical reference](../docs/technical-reference.md) for compatibility/deployment details.

```sh
node --test --test-concurrency=1 tests/*.test.mjs
EVIDENCE_DIR="$EVIDENCE/event-fonts" node tests/event-themes-browser.mjs
EVIDENCE_DIR="$EVIDENCE/frame-centering" node tests/frame-centering-browser.mjs
```

`tests/event-frames.test.mjs` covers the frame generator and its contract. The centering suite measures the lettering of every interim frame, compares each committed interim PNG with the current drawing, and rasterizes every frame: opaque outside the photo window, an open window in the artwork alone, no uncovered pixel once the photo is in, and an exact circle for the round shape.

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
