# Maintaining WordCamp event themes

Read [AGENTS.md](../AGENTS.md) first. This guide covers **local source maintenance and verification**, not permission to publish. The artwork is an independent adaptation of public event sites; participation roles are self-reported, not official verification.

## Source map and contract

| File | Edit or verify |
| --- | --- |
| `shared/events.js` | `EVENTS` edition records and `ROLES`; merges lightweight theme tokens into each frozen event |
| `shared/event-themes.js` | `EVENT_THEMES[id]`: frozen `colors` and explanatory `styleNote` |
| `shared/social.js` | `renderSocial`, `fit`, `frameBaseline`, heading/decorations, text-role assignments and SVG geometry |
| `shared/options.js` | `queryOptions`: known editions/roles, social-only options, color/default validation |
| `public/app.js` | `validCatalog`, `syncAutomaticColors`, catalog loading/restoration and preset behavior |
| `functions/events.js` | `/events` response; accepts no query parameters |
| `functions/card.js` | `/card` rendering and exact event stylesheet CSP authorization |
| `shared/preview.js` | Browser renderer uses the same options and `renderSocial` implementation |
| `assets/fonts/event-provenance.json` | Event binary sources, hashes, weights and conversion provenance |
| `assets/fonts/provenance.json` | Separate base-profile font provenance; includes shared Inter binary |
| `assets/fonts/EVENT-FONTS.md` | Human-readable observations, reuse/substitution caveats, licenses and rebuild notes |
| `tools/build-event-fonts.py` | Event face selections, metrics, CSS and hash generator |
| `tools/build-fonts.py` | Base profile fonts only; not the event generator |
| `shared/event-fonts.js`, `shared/fonts.js` | Generated outputs: never hand-edit |
| `public/FONT-LICENSES.txt`, `assets/fonts/*OFL.txt` | Public bundled notices and original family licenses |
| `tools/stage.mjs`, `tools/serve.mjs` | Canonical-to-public module aliases and delivery |

An edition record currently has `id`, `name`, `year`, `label`, `dateLabel`, `location`, `url`, `note`, and `checkedAt`; `colors` and `styleNote` come from `EVENT_THEMES`. Keep the catalog lightweight: no embedded fonts, metrics or images. `year` belongs to edition metadata, not the visible title.

The browser's `validCatalog` is an explicit validator, not a JSON Schema file. It requires unique event IDs matching `^[a-z]+-20\d{2}$`, at most 30 events and 10 roles, bounded text (normally 250 characters), and a `checkedAt` string matching `20YY-MM-DD`. Use a real calendar date even though the validator checks only shape. Roles have lowercase IDs of 1–24 letters, labels up to 80 and statements up to 100 characters.

Official URLs must use HTTPS without credentials, explicit port, query or fragment; current hosts are exactly `asia.wordcamp.org`, `europe.wordcamp.org`, `us.wordcamp.org`, and `india.wordcamp.org`, with a `/20YY/` path. Do not silently broaden this allowlist. A new region/URL shape needs a separately reviewed validator change and negative tests. The current validator does not cross-check `year`, ID and URL year; contributors must maintain their agreement.

`colors` has exactly these five six-digit hex values, without `#`: `foreground`, `headerColor`, `nameColor`, `subHeaderColor`, `badgeLabelColor`. Store uppercase values consistently. The browser accepts absent `colors`/`styleNote` for compatibility, but every curated theme must supply both. Do not add `linkColor` to this catalog shape merely because it is a supported general card option.

## Evidence before edits

1. Open the **current official edition site**, not a previous-year theme or search-result snippet. Record final URL, actual check date, confirmed announcement text, and whether this is a placeholder, announcement page or developed event identity. Keep raw screenshots/styles/network captures outside source in `$EVIDENCE`; add a concise, non-private evidence summary to the font/style documentation when relevant.
2. Inspect the rendered page's computed styles on representative event headings, body, navigation and emphasized text at relevant widths. Record actual font family, weight/style, colors/backgrounds and layout/decorative observations. Inspect the winning rules and `@font-face` sources, including variable axes and browser-loaded font requests. A CSS declaration alone can describe an unavailable font; distinguish declared from actually loaded/painted typography.
3. Verify dates and location against official announcement prose. Record confirmed precision only: an announced broad period can remain broad, and unknown values stay `''`. Never convert a placeholder January 1, guessed host city, calendar metadata artifact or search snippet into a confirmed date. If sources conflict, leave the uncertain field unconfirmed and explain it in `note`.
4. Keep factual `checkedAt` in `shared/events.js` distinct from the style/font check date in `shared/event-themes.js` and `EVENT-FONTS.md`. Do not update a check date simply because code was edited. Record provisional status in `note`/`styleNote`, including announcement-template or coming-soon limitations. Do not call a template a final campaign identity.
5. If a source or font cannot be retrieved or inspected, say exactly what is unverified. Keep a known pinned face only with an explicit reuse/substitution caveat; do not label a missing face verified. No fake event facts, invented regional motifs, or copied official logos. Existing accents are original vector adaptations.

Existing source observations are historical evidence, **not a fresh verification**: factual checks in the catalog are dated 2026-10-01; style/font checks are dated 2026-10-03. Current US details are empty; Europe/India use provisional announcement-page identities. Revisit the official sites when asked to refresh them.

## Workflow A: refresh an existing edition

Use this for confirmed fact changes or an updated official design **for the same edition**.

1. Establish the evidence above and identify the exact immutable edition ID. Keep that ID, its year and edition URL tied to the same event; never retarget it to next year's event.
2. For fact-only changes, edit the corresponding record in `shared/events.js`: verified `dateLabel`, `location`, `note`, and factual `checkedAt`. Keep `name`/`label` date- and year-free. Update the checked-source comment if appropriate without implying unrelated records were rechecked.
3. For style changes, edit that key in `shared/event-themes.js` and update its provisional/source explanation. Review edition-specific heading and decoration branches in `shared/social.js`; colors alone do not define the design. Preserve user color overrides and the safe bounded rendering contract.
4. If fonts or weights changed, follow the font workflow below. If only facts/colors changed, do not regenerate or replace unrelated fonts. Preserve base profile typography and existing editions outside scope.
5. Update evidence-grounded expectations in the relevant unit/browser tests. For example, a genuinely confirmed US date requires changing the explicit empty-date assertions, not keeping false facts to satisfy old tests. Record why the old assumption changed.
6. Run the local checks below; inspect SVG and PNG outputs in both event layouts, every role, missing-photo and visibility variants, and palette/background cases. Hand off the diff and evidence. Publication is a separate decision.

## Workflow B: add a new edition

A new edition is an addition, **not a search-and-replace of the previous year**.

1. Verify the new official edition URL and facts/style independently. Add a new immutable ID such as `asia-2028`; keep older IDs working unless removal is explicitly approved as a compatibility change. Unknown IDs must still fail closed, not map silently to the latest edition.
2. Add a complete `EVENTS` record in `shared/events.js` and an `EVENT_THEMES` entry in `shared/event-themes.js`. Unknown date/location remains `''`. Keep visible `name`/`label` year-free even when two editions coexist; the existing selector uses `label`, so duplicate visible labels require an explicit UX decision rather than inventing a date or silently renaming old IDs.
3. Add the edition's `display`, `body`, `emphasis` face selection in `tools/build-event-fonts.py`, even if it intentionally reuses existing pinned binaries. Add provenance only for new assets, documenting reuse accurately, then regenerate the module.
4. Review **all explicit ID branches** in `shared/social.js`: frame/announcement decoration, heading treatment, editorial alignment, and the Asia curved-role face exception. A new Asia edition does not automatically inherit `asia-2027` branches. Unrecognized branches currently fall into generic styling; a build that renders is not proof that a new edition looks correct.
5. Review defaults in `shared/options.js` and `shared/social.js`, and catalog order/restoration in `public/app.js`. Adding an edition does not itself authorize changing the default. If a new default is approved, change both renderer/query defaults and their tests together. Do not weaken the browser URL allowlist to get a new region through.
6. Extend test expectations rather than removing assertions. Explicit current IDs/counts exist in `tests/social-render.test.mjs`, `tests/social-browser.mjs`, `tests/event-colors-browser.mjs`; `tests/frame-centering.test.mjs` also has a fixed variant total. `tests/event-themes.test.mjs` has edition-keyed palette/font/decoration expectations. Search all tests for old IDs/counts. The two offline browser matrices iterate the catalog automatically, but new faces still need independent PostScript expectations.
7. Run the entire unit suite and browser matrices below. Check old editions as well as the new one, with real exported files. Update source/provenance documentation and report the full exercised matrix without copying historic totals.

## Font assets, generation and geometry

### Pin inputs and retain licenses

- Download the exact authorized font binaries from observed official-site/font-provider URLs; do not add a runtime external-font dependency. Record URL, file size, SHA-256, family and required weights in `assets/fonts/event-provenance.json`. Its `path` is relative to `assets/fonts/`; base `provenance.json` paths are relative to the project root.
- Keep the original OFL notice for each family, including copyright/reserved-name text. Add the complete required notices to `public/FONT-LICENSES.txt`; the generator does **not** update that file. Retain third-party notices separately from the GPL-2.0-or-later project license.
- Existing event fonts keep internal names/outlines and are not subsetted. `Event ...` is a CSS alias, not a renamed binary. Current Inter is intentionally reused from WordPress.org: matching observed family/weights, **not byte-identical** to the larger event-theme binary. Do not erase that distinction.
- Current Open Sans has pinned original TTFs plus losslessly compressed WOFF2 files. Preserve `sourcePath`, `sourceSha256` and `conversion` fields. The generator validates reproducible conversion; it does not download or write missing input binaries for you.

### Rebuild offline

From `$PROJECT`, use a separate Python environment with **fontTools 4.57.0 and Brotli support**, as documented by the generator. For example, after creating an external writable `$EVIDENCE` directory:

```sh
python3 -m venv "$EVIDENCE/font-tools"
"$EVIDENCE/font-tools/bin/python" -m pip install 'fonttools==4.57.0' Brotli
"$EVIDENCE/font-tools/bin/python" tools/build-event-fonts.py
```

Dependency installation needs package access; the generator itself needs no network. Record the actual Brotli/tool versions if reproducibility matters; no Brotli version is pinned in this project. Reuse an existing compatible environment when available. Do not modify the npm lockfile to install font/browser verification tools.

The generator validates hashes and existing Open Sans conversion bytes, instantiates variable font weights, and emits only `shared/event-fonts.js`: `EVENT_FONT_METRICS`, `EVENT_FONTS`, `EVENT_FONT_CSS`, `EVENT_FONT_STYLE_HASH`, `measureEventText`, and `eventInkCenter`. It records advances, units-per-em, cap height and actual glyph vertical outline bounds, not guessed metrics. Review the diff and rerun to confirm deterministic bytes. Run `python3 tools/build-fonts.py` only for an intentional base-font change; it emits `shared/fonts.js`. Shared Inter changes affect both provenance manifests and both renderers and need expanded testing.

### Every text role has an intentional face/weight

The checked-in `display / body / emphasis` selections are:

| Edition | Display | Body | Emphasis |
| --- | --- | --- | --- |
| `asia-2027` | Faculty Glyphic 400 | Kumbh Sans 400 | Kumbh Sans 500 |
| `europe-2027` | Cardo 400 | Inter 400 | Inter 600 |
| `india-2027` | Cardo 700 | Inter 400 | Inter 600 |
| `us-2027` | Open Sans 300 | Open Sans 400 | Open Sans 600 |

`shared/social.js` assigns **display** to event headings, curved event titles, announcement display names and fallback initials; **body** to handles and available date/location metadata; **emphasis** to announcement role statements. Curved avatar role labels use emphasis except `asia-2027`, which uses display. Verify actual family **and weight** for every role, not only the event heading or `data-face` attributes. Missing photos must produce permitted initials without leaking hidden name/handle fields.

Fitting uses the exact face's advances, shrinks to bounded minimum sizes and then truncates safely. Text CSS disables font synthesis, kerning and ligatures to match these metrics. Unsupported characters use conservative fallback widths; this is not a complete shaping engine or a guarantee of full script coverage. Generic fallbacks are for unsupported glyphs, not a substitute for ordinary event text.

The avatar frame is 1080×1080, centered at `(540,540)`, with annulus radii 400–526 and ink-center target radius 463. Event/role arc baselines are computed from the **actual fitted label**, fitted size and its glyph ink midpoint: top `463 - size * inkCenter`, bottom `463 + size * inkCenter`. Do not use a common baseline or Inter cap height for every family. Preserve overshoot/punctuation handling and the long-label/minimum-size regressions. The raster regression requires radial ink center within 1.25 px of 463, no clipped ink and transparent center/corners for photo-hidden frames. Announcement output remains 1080×1350 with its separate layout, not a stretched square.

### CSP and generated delivery

The generator hashes the exact per-event CSS, including embedded font bytes and text rules. `socialStyleHash` exposes it; `functions/card.js` uses it in `style-src`, with `font-src data:` and no remote fonts. A stylesheet edit changes its hash: regenerate, never add `unsafe-inline` or patch a stale hash manually.

`shared/` is canonical. The Functions helper modules are re-exports; staging generates public `/preview/` aliases, not separately maintained source. `tools/stage.mjs` hashes sorted length-framed canonical inputs (including package metadata), records `asset-revision.json` outside the upload root, and versions HTML asset URLs, dynamic imports, the fallback HEAD probe and transitive browser imports. Only browser URL specifiers change; backend source copies remain byte-identical. A font/theme change must flow through this deterministic staging, not manual copied assets/cache-busting strings. Inspect all eight preview modules in the **compiled served catalog**, because compilation can consume backend imports.

## Local verification commands

Set `PROJECT` to the checkout root and `EVIDENCE` to an absolute external directory. Supply an installed Playwright ESM entry, Chromium executable and axe script via portable environment variables. Browser tools are not installed by `npm ci`; use existing tooling or install the optional JavaScript tools outside the application as shown below. This optional install needs network access and does not pin test-tool versions; record the versions used. It must not change the application's package manifests or lockfile.

```sh
cd "$PROJECT"
mkdir -p "$EVIDENCE/tmp"
export TMPDIR="$EVIDENCE/tmp"
npm ci --ignore-scripts
node --test --test-concurrency=1 tests/*.test.mjs

# Optional: skip installation and point the variables at existing tools instead.
npm install --prefix "$EVIDENCE/browser-tools" --no-save --package-lock=false playwright axe-core
export PLAYWRIGHT_MODULE="$EVIDENCE/browser-tools/node_modules/playwright/index.mjs"
export AXE_PATH="$EVIDENCE/browser-tools/node_modules/axe-core/axe.min.js"
# Supply an actual installed Chromium executable, not this placeholder.
export CHROMIUM="/path/to/chromium"
unset BROWSER_STATE EXPECTED_VERSION

# These own their fixture servers; do not point them at a dev/hosted server.
EVIDENCE_DIR="$EVIDENCE/event-fonts" node tests/event-themes-browser.mjs
EVIDENCE_DIR="$EVIDENCE/frame-centering" node tests/frame-centering-browser.mjs
```

`PLAYWRIGHT_MODULE` falls back to the package specifier `playwright`; `CHROMIUM` has a platform-specific default in the scripts, so set it explicitly for portability. `EVIDENCE_DIR` is mandatory. Keep port **4215** free for `event-themes-browser.mjs`; `frame-centering-browser.mjs` binds a free ephemeral loopback port. Both close their servers in cleanup; neither reads `TEST_ORIGIN`, `BROWSER_STATE`, or `AXE_PATH`.

The event-font fixture uses the real `/card` handler with a labeled synthetic upstream profile, strict CSP, external-request blocking, canonical browser/server SVG equality, and actual raster exports. It checks loaded faces and CDP `CSS.getPlatformFontsForNode` against a manually maintained map of pinned-binary PostScript identities, then proves the guard rejects deliberate fallback. It compares each text node's PNG raster with a generic-fallback version. Add/update that independent map for changed faces; matching declarations alone is insufficient. This suite does not prove current live official-site facts or real-photo ingestion.

For live-builder checks, start the adapter in a **separate terminal**, then wait for it to respond:

```sh
cd "$PROJECT"
PORT=4197 npm run dev
```

In the test terminal:

```sh
curl --fail --silent --show-error http://127.0.0.1:4197/events > "$EVIDENCE/local-events.json"
export TEST_ORIGIN="http://127.0.0.1:4197"
EVIDENCE_DIR="$EVIDENCE/event-colors" node tests/event-colors-browser.mjs
EVIDENCE_DIR="$EVIDENCE/social" node tests/social-browser.mjs
EVIDENCE_DIR="$EVIDENCE/preview" node tests/preview-browser.mjs
EVIDENCE_DIR="$EVIDENCE/background" node tests/background-browser.mjs
EXPECT_LOCAL_RENDER=1 EVIDENCE_DIR="$EVIDENCE/performance" node tests/preview-performance.mjs
# Also run these if controls/shared UI or ordinary layouts were affected:
EVIDENCE_DIR="$EVIDENCE/modern" node tests/modern-builder-browser.mjs
EVIDENCE_DIR="$EVIDENCE/controls" node tests/control-layout-browser.mjs
```

These suites require an already-running server and fetch real public profiles upstream. Do not relabel them offline fixtures. In particular, `event-colors-browser.mjs` defaults to port 4216, `background-browser.mjs` and `control-layout-browser.mjs` to 4210, and `modern-builder-browser.mjs` to 4214; explicitly setting `TEST_ORIGIN` avoids mismatches. `social`, `preview` and `preview-performance` default to 4197. `social`, `modern` and `control-layout` require `AXE_PATH`; event-colors/background run axe only when supplied. Neither a skipped axe run nor a passing bounded Chromium/axe check is full WCAG conformance.

`EXPECTED_VERSION` is an optional hosted-response assertion in applicable suites, not a local requirement. Only some scripts read `BROWSER_STATE`; event-colors creates a fresh context without it. Do not assume authentication state applies to every suite. `PREVIEW_SOURCE_DIR` is an optional test-only HTML/JS substitution in the performance script; leave it unset for normal candidate verification. `EXPECT_LOCAL_RENDER=1` requires zero requests during measured warm changes. Use separate evidence directories and sequential runs to avoid overwritten reports or excess memory use.

### Review before calling a theme verified

- Exercise every supported event/role in both `avatar` and `announcement`, plus real photo, no photo/initials, avatar hidden, optional announcement fields and long labels. Synthetic fixtures must stay labeled and test-only.
- Compare canonical server SVG, browser preview and downloaded SVG byte-for-byte for equal validated inputs **without** local backgrounds. With a local background, verify expected compositing and exact canonical restoration on removal instead of demanding server parity for an intentionally browser-only feature.
- Inspect actual painted families/weights and downloaded PNGs. Check all text roles, no clipping/overlap, fitting, accents, contrast of default and manual palettes, mobile controls, keyboard/accessibility, and frame transparency. Inspect generated images visually as well as numeric checks.
- Confirm automatic colors follow edition changes, individual/URL overrides persist, Light/Dark persists, **Event colors** resets, ordinary layouts stay neutral and site appearance does not recolor exports. Confirm malformed catalog/options fail closed and recovery does not expose stale exports.
- Record commands, tool versions, reports, relevant source hashes, failures/skips and screenshots outside hosting. No historic test count, `document.fonts.ready`, successful compile, or missing screenshot is a substitute for actual evidence.

## Release handoff: separate from local work

Local checks, font generation and staging do not authorize a push or public write. Ask for explicit approval before publication/promotion, remotes, permissions/access, ownership, domains or paid changes. Confirm the intended host target rather than inventing a team, Space or account.

Use the staging tool's portable destination override with a fresh, absolute, owned release directory outside the checkout (after setting `TMPDIR` as above):

```sh
export PROFILE_CARDS_RELEASES_DIR="$(mktemp -d)"
node tools/stage.mjs "$PROFILE_CARDS_RELEASES_DIR/release-name/site"
```

Alternatively set `PROFILE_CARDS_RELEASES_DIR` to a chosen absolute owned directory. Inspect current tool validation before use: real non-symlink paths and a new destination are required; do not overwrite frozen releases or change `HOME` to bypass policy. Install the staged package dependencies in the release parent, outside `site/`. Never publish the repository root or evidence/tooling directories.

Use the hosting CLI's supported dry-run workflow and inspect its exact compiled manifest, routing, public licenses, source exclusions and versioned browser graph before any approved upload. This guide does not invent a provider CLI command or credentials. `tests/hosted.mjs` requires `RELEASE_DIR`, provider-specific release receipts, and explicit `EXPECTED_TEAM_SLUG` / `EXPECTED_TEAM_ID` values independently confirmed from the approved deployment record; it is **not** a generic localhost test. Do not commit the account-specific values or derive the expected identity from the readback under test. Its access policy must match the explicitly approved deployment, never be weakened to make checks pass. After an approved deployment, verify the exact target's served bytes/headers and browser behavior before claiming success.
