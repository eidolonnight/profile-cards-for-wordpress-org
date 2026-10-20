# Contributor and agent instructions

These instructions apply to this project, whether checked out alone or inside a larger repository. Read [README.md](README.md) for the public interface and [docs/event-themes.md](docs/event-themes.md) before changing WordCamp facts, colors, typography, or editions.

## Purpose and boundaries

- This is an independent public WordPress.org profile-card builder, **not an official WordPress service**, plugin, authentication service, or attendance registry.
- WordCamp participation is self-reported. Never imply that a role proves registration, selection, sponsorship, or endorsement.
- Project-owned code is GPL-2.0-or-later. Preserve the project license and attribution; third-party fonts and dependencies retain their own licenses. Font binaries are SIL OFL 1.1; do not relabel them GPL. Retain [font licenses](public/FONT-LICENSES.txt), [third-party notices](public/THIRD-PARTY-NOTICES.txt), and original notices in `assets/fonts/`.
- Keep changes scoped to the request. Do not silently refresh event facts/styles during unrelated maintenance. Do not copy official logos or artwork merely because they are publicly accessible.
- Local edits/tests are not approval to publish. Obtain explicit approval before push, remote changes, publication, promotion, access/permission or ownership changes, domains/DNS, or paid resources. Never create a replacement hosting target by default.
- Do not commit credentials, browser storage state, private release receipts, downloaded personal-data evidence, installed dependencies, or build/release directories. Keep evidence outside the repository and publish root.

## Architecture: edit the source, not its copies

| Source | Responsibility |
| --- | --- |
| `public/index.html`, `styles.css`, `app.js` | Builder UI, validated catalog loading, option state, preview lifecycle and downloads |
| `public/theme.js` | Site appearance preference; separate from card colors |
| `public/background.js` | Browser-only image validation, crop/tint and SVG compositing |
| `shared/options.js` | Canonical query validation, compatible defaults and `ProfileError` |
| `shared/svg.js` | Classic, Landscape (`profile`) and Vertical (`square`) SVG rendering |
| `shared/social.js` | WordCamp avatar/announcement rendering and geometry |
| `shared/events.js`, `event-themes.js` | Curated edition/role catalog and lightweight color/style tokens |
| `shared/preview.js` | Pure browser-safe renderer entry using the same options/renderers as `/card` |
| `shared/fonts.js`, `event-fonts.js` | Generated embedded font CSS, hashes and metrics |
| `functions/_profile.js` | Bounded public-profile/avatar fetching, parsing, safe URLs and transient caches |
| `functions/{json,card,events,preview-data}.js` | Production `GET` handlers |
| `tools/serve.mjs`, `stage.mjs` | Loopback adapter and immutable allowlist staging |
| `sf.jsonc` | Hosting configuration; no application database |

`functions/_svg.js`, `_fonts.js`, `_events.js`, and `_social.js` re-export canonical `shared/` code; `_profile.js` also re-exports shared options. Do not introduce a second renderer or validation implementation. Production handlers must remain compatible with the Functions runtime, not depend on native Node APIs used by development tools.

Data flow: the builder reads `/json`, then `/preview-data?username=<slug>&size=0|320|1024` for a validated profile/photo snapshot. Warm option changes render locally from `shared/preview.js`; `/card` renders the same inputs on the server. `/events` returns curated metadata, not a live event-site scrape. Browser-only backgrounds are intentionally absent from server output.

Local development serves canonical shared modules at `/preview/*.js`. Staging creates separate backend `shared/` and public `preview/` copies because Functions compilation consumes backend imports. It derives a deterministic asset revision and rewrites staged browser URL specifiers only. Do not edit staged copies, `?v=` revisions, manifests, or generated font modules manually.

## Local setup and checks

Use a shell in the project root. Set `PROJECT` to that root and `EVIDENCE` to an absolute, writable directory **outside** the checkout and any hosted directory.

```sh
cd "$PROJECT"
mkdir -p "$EVIDENCE/tmp"
export TMPDIR="$EVIDENCE/tmp"
npm ci --ignore-scripts
npm test
# Equivalent low-resource run; run this instead of npm test if needed:
node --test --test-concurrency=1 tests/*.test.mjs
npm run dev
```

The adapter binds `127.0.0.1:4197`; `PORT=4216 npm run dev` selects another port. It invokes the real handler exports but is not a hosted-runtime emulator. Use Node.js **20.19.0 or newer**, as required by the package metadata and locked dependencies. Staging tests use `os.tmpdir()`; explicitly setting `TMPDIR` is optional. The example above selects an existing external temporary directory to keep test artifacts with the evidence.

`npm test` covers `*.test.mjs`, **not browser acceptance scripts**. Playwright, a Chromium executable, and (where used) axe-core must be supplied separately; they are not application dependencies. Set `PLAYWRIGHT_MODULE`, `CHROMIUM`, `AXE_PATH`, and per-run `EVIDENCE_DIR` as described in the event guide. Run browser suites sequentially on constrained hosts.

- Event/font acceptance: `tests/event-themes-browser.mjs` starts its own fixture server on loopback port 4215; `tests/frame-centering-browser.mjs` starts one on an ephemeral loopback port. Neither uses `TEST_ORIGIN` or needs `npm run dev`.
- Real-builder acceptance: `tests/event-colors-browser.mjs` needs an already-running adapter, live upstream profile access, and explicit `TEST_ORIGIN` if not using its default port 4216.
- Broader regressions: `tests/preview-browser.mjs`, `tests/preview-performance.mjs`, `tests/background-browser.mjs`, `tests/social-browser.mjs`, `tests/modern-builder-browser.mjs`, and `tests/control-layout-browser.mjs`. Their defaults differ; read each script and set the origin explicitly. The event guide gives runnable command forms.
- Font rebuilds are optional for non-font work: `python3 tools/build-event-fonts.py` for event fonts; `python3 tools/build-fonts.py` for base profile fonts. Use pinned inputs and the documented Python dependencies, then review generated diffs.

## Non-negotiable invariants

1. **Input and URL safety:** accept only validated lowercase profile slugs, never arbitrary profile/image URLs. Reject unknown/repeated query parameters, nonliteral booleans and invalid colors. Unknown editions/roles fail closed. Preserve the official event URL allowlist and safe social-link rules.
2. **Bounded upstream access:** fetch profiles only from the fixed WordPress.org origin and images only from validated HTTPS Gravatar paths; reject redirects. Preserve timeout, byte, signature, cache and concurrency bounds. Do not fetch user-supplied social destinations.
3. **Privacy:** no accounts, database-backed profile storage, analytics, upload endpoint, or visitor directory. Keep profile/photo snapshots in bounded transient caches/page memory; API inputs retain `private, no-store`. Only the enum site-theme preference persists locally.
4. **Background privacy:** local image bytes, filenames, crop and tint never enter requests, URLs, telemetry or persistent storage. Keep image limits/validation, metadata-stripping raster normalization, race handling, and transparent frame boundaries intact.
5. **Failures and omissions:** never substitute a fictional profile on upstream failure. Hidden identity fields must not leak through fallback initials. Stale requests, malformed input, undecoded previews or empty selected content must not enable exports. Do not turn arbitrary import/auth/runtime failures into silent fallback.
6. **Compatibility/defaults:** preserve `classic`, `profile`, `square`, `avatar`, `announcement` API values despite UI labels. Missing API layout remains classic; fresh builder sessions use Landscape with a live demo and empty username. Modern content defaults are on; explicit false values survive. Direct API legacy `header` semantics remain supported.
7. **Themes:** site appearance never recolors exports. Automatic event colors follow the edition; per-field edits, URL overrides and Light/Dark persist until **Event colors** resets them. Ordinary profiles retain neutral automatic defaults. Keep dates/years out of event titles/select labels; optional details carry verified dates/location.
8. **Exports:** `/card` returns SVG, not server PNG. PNG is rasterized from the displayed SVG in the browser; both downloads include local backgrounds. Preserve native social sizes, bounded export scaling, decode readiness, and standalone SVG link safety. PNG links are not clickable.
9. **Typography/security:** embed pinned licensed fonts offline; authorize exact styles with CSP hashes. Do not loosen CSP to hide font failures. Declared CSS families or a resolved `document.fonts.ready` alone do not prove painted-font or PNG correctness.

## Completion and release handoff

- Review the diff, run relevant unit checks and actual browser/export tests for renderer/UI changes, and report exact commands/results plus skipped or blocked checks. Do not reuse historic pass counts as current evidence.
- Validate preview/server parity, every affected layout/role/visibility choice, palette overrides, transparency, font painting and real PNGs. Browser/axe coverage is bounded evidence, **not full WCAG conformance**.
- Before a release, inspect `tools/stage.mjs` and set `PROFILE_CARDS_RELEASES_DIR` to an absolute, owned directory outside the source tree, such as `$EVIDENCE/releases`. Run `node tools/stage.mjs "$PROFILE_CARDS_RELEASES_DIR/release-name/site"`. The root must not be the home directory, filesystem root, a source ancestor or a symlinked path; the release directory must be new. The original default remains for backward compatibility, but portable automation should set the override explicitly. Never change `HOME` or bypass the destination and allowlist safeguards.
- Stage into a fresh allowed destination; never publish the checkout. Review compiled dry-run assets and routing, not just source-stage presence. Keep package installation, manifests and receipts outside the upload root. Verify the exact approved target and release before any separately authorized publication/promotion.
- End with changed files, verified results, remaining gaps and any approvals needed. Do not commit or push unless requested.
