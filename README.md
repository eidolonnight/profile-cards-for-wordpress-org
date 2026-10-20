# Profile Cards for WordPress.org

An independent profile-card and WordCamp-graphics builder inspired by [CardPress by Rodrigo Donini](https://github.com/donini/wp-profiles-card). It uses live public WordPress.org profile data, is not an official WordPress.org service, and does not authenticate to WordPress.org.

## License and contributor entry points

Project-authored code and documentation are licensed **GPL-2.0-or-later**, matching
WordPress's licensing choice. See [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md)
for the grant, scope, third-party notices and font exceptions.

- [AGENTS.md](AGENTS.md): architecture, invariants and safe agent workflow.
- [Event-theme maintenance](docs/event-themes.md): verify official sources, refresh
  existing themes, add editions, rebuild fonts and run the required checks.

This directory is a standalone source project. Run the following commands from its
root, not from an enclosing multi-project repository. Use Node.js 20.19.0 or newer
(the locked dependency tree requires it); Node.js 22 LTS is a suitable baseline.
Python is only needed to regenerate embedded fonts, not to run the app.

## Run and test

```sh
npm ci --ignore-scripts
npm test
npm run dev
```

The development adapter binds only `127.0.0.1:4197` and invokes production route exports unchanged. Spacefast Functions is the production runtime; this adapter is not a hosted-runtime emulator. For a low-resource host, run unit tests serially with `node --test --test-concurrency=1 tests/*.test.mjs`.

The current editor/content-parity campaign is `tests/modern-builder-browser.mjs`: both modern formats and themes, field omissions, badge/social options, actual exports, canonical server parity, mobile/axe and no-script/storage-failure behavior. Browser acceptance scripts also include `tests/cleanup-browser.mjs` (demo and download-only UI), `tests/header-browser.mjs` (Landscape), `tests/browser.mjs` (classic, or `CARD_LAYOUT=square`), `tests/social-browser.mjs`, `tests/background-browser.mjs` (local image privacy, crop/tint, races and exports), and `tests/control-layout-browser.mjs` (Step 1 hierarchy, keyboard order, all formats, expanded responsive controls and accessibility). Set `PLAYWRIGHT_MODULE`, `CHROMIUM`, `AXE_PATH`, and an `EVIDENCE_DIR` outside hosting; optionally set `TEST_ORIGIN` and protected `BROWSER_STATE` for authorized hosted checks. Browser tests fetch the live public example profile and exercise real downloads, omissions, compatible API/builder URLs, failures, mobile geometry and accessibility. Synthetic fixtures stay in tests.

`tests/hosted.mjs` reads the exact release's Space, Version, runtime and served-catalog receipts from `RELEASE_DIR`. Set `EXPECTED_TEAM_SLUG` and `EXPECTED_TEAM_ID` to the independently confirmed owner of the approved deployment; both are required, with no account-specific defaults. It defaults to strict private access. For an explicitly approved public-live/private-immutable policy, set `HOSTED_ACCESS_POLICY=public-live/private-immutable`; that mode uses fresh credential-free contexts, requires live routes to return 200 and immutable-Version routes to return 403, and never loads author handoffs or browser storage state. Run public browser suites with `BROWSER_STATE` unset. Neither mode changes access grants. The hosted checker requires `Cache-Control: no-store` on preview inputs; handler tests separately require the source response `private, no-store`. Both prohibit storage by shared and private caches. The social suite records input statuses/retry headers and visible application state on readiness timeout without logging credentials or response bodies.

## Routes and formats

- `/` and `/create`: controls-left/preview-right on desktop, stacked on mobile. Offers **Landscape banner**, **Vertical card**, **WordCamp avatar frame**, and **WordCamp social card**. These are labels only: the underlying `profile`, `square`, `avatar`, and `announcement` values and image dimensions are unchanged. Fresh sessions display a live `matt` demo in Landscape banner while leaving the username field empty. Shared builder settings still require Create card. Step 1 starts with username, followed by format, any WordCamp options and included details. Profile content is a fieldset heading, not a master switch. Landscape and Vertical expose the same twelve content options, all enabled by default in six balanced two-column rows. Explicit deselections and valid shared-URL false values remain respected. The initially collapsed **Colors & background** disclosure contains card presets, color pickers and browser-only image controls. Background crop/zoom controls are grouped separately from tint color/strength. The accessible sun/moon **Site appearance** button follows the system by default and toggles the effective palette; choosing the OS palette restores system-following. Saved valid overrides remain honored, with OS-theme CSS fallback without JavaScript. Only the enum theme preference is stored locally; profile and image data remain ephemeral. Independence and participation notices are grouped with the public-data/privacy explanation; footer credits/licenses and official event links remain. The real localized fetch timestamp follows the ready-to-download message inline.
- `/json?username=eidolonnight`: compatible `userName`, `name`, `avatar`, `memberSince`, `badges`, plus public profile/header/enrichment fields and `fetchedAt`. JSON may contain fields deliberately excluded from the rendered cards.
- `/card?username=eidolonnight&layout=profile`: **Landscape banner** with embedded EB Garamond and Inter. The avatar diameter matches the selected name/job/metadata/social/team line boxes, excluding badges. The shortened `profiles.wp.org/username/` link sits beside `@username` below name/job; social icons immediately follow identity/location metadata, before teams and badges. These choices default on but remain independently optional. Avatar-only output uses a safe fallback. Original vector badge icons use verified WordPress badge-class colors; optional names supplement the icons, wrapping large sets without omission.
- `/card?username=eidolonnight&layout=square`: **Vertical card** (the compatible `square` layout), a native stacked composition with embedded Inter, a 720×720 SVG and 1440×1440 browser PNG. Social icons immediately follow identity/location metadata, with every row centered. Badges use three evenly spaced columns, complete wrapped names and tallest-cell row spacing. All badges are retained; exceptionally long content scales down to fit.
- `/card?username=eidolonnight&layout=avatar&event=asia-2027&role=attendee`: 1080×1080 circular artwork, with transparent corners. Event and role remain visible; `avatar=false` produces a transparent-center frame overlay.
- `/card?username=eidolonnight&layout=announcement&event=asia-2027&role=attendee`: native 1080×1350 (4:5) graphic with independently optional photo, name, handle and event details.
- `/events`: canonical curated event and role catalog, including official source URLs and checked dates. Event facts are not refreshed live on each request. Unknown IDs/roles fail closed. Roles are self-reported, not proof of registration or official selection.
- Missing `layout`, or explicit `layout=classic`, preserves the original compact card. Legacy builder URLs without layout restore classic; its menu option is hidden for new cards.

Only lowercase public profile slugs are accepted, not full URLs. Unsupported/repeated parameters, invalid booleans/colors and upstream failures return explicit JSON errors. No invented profile is substituted.

## Options and compatibility

- Booleans are exactly `true` or `false`: `avatar`, `header`, `badges`, `badgeNames`, `link`, `refresh`, `name`, `jobTitle`, `organization`, `handle`, `location`, `joined`, `teams`, `social`; WordCamp layouts additionally accept `eventDetails`.
- Modern detail flags control available public fields. The builder enables every applicable content choice by default; it no longer sends or depends on `header`, and ignores a valid legacy builder `header=false` while preserving individual omissions. Direct `/card` requests retain the legacy `header` master option, while both modern layouts now default every content flag on, including badges, badge names, profile link and social icons. Explicit false values remain respected; Classic/WordCamp API defaults and `refresh=false` are unchanged. Modern profile links use only a validated `https://profiles.wp.org/<username>/` target, with the scheme omitted in visible text. Both modern layouts honor the same detail controls and independent link choice.
- Legacy `userId`, `website`, `github` and `slack` flags remain accepted but do not add separate text fields in modern cards. `social=true` enables available website, GitHub and public social-account icons. HTTP(S) destinations are validated, credentials/control characters rejected, labels escaped, and destinations never fetched. `omitSocial` filters exact account keys; `omitTeams` filters exact team names in both modern formats. Standalone SVG links are clickable; PNG icons are visual-only.
- Individual team omissions survive refreshes and builder URLs; changing username clears them. Visibility choices are retained separately per layout. Hiding all available card content clears the preview and disables stale exports.
- `event`, `role`, and `eventDetails` are accepted only for social formats. The round frame uses only photo/event/role; announcement uses photo/name/handle/details. The builder omits irrelevant social parameters and blocks unknown restored event settings until reviewed.
- Six-digit hex colors without `#`: `headerColor`, `nameColor`, `subHeaderColor`, `badgeLabelColor`, `foreground`, and `linkColor`. Both modern layouts' links default to the secondary-text color so presets remain readable; an explicit API `linkColor` overrides it. Card light/dark palettes sit inside the initially collapsed, keyboard-accessible **Colors & background** disclosure. Site appearance is a separate preference and never recolors exports.
- Refresh is API-only for compatibility; the builder uses the normal cache and explains its 15-minute lifetime. The builder has no refresh control and does not request refreshes.
- Export buttons are **Download PNG**, then **Download SVG** in one button group. Download PNG is the primary action. Copy Card URL, Copy Markdown, all clipboard handling and the manual-copy fallback are removed. There is no export-dimensions/help block, profile-JSON download or builder-URL copy control. Existing API and legacy builder routes remain compatible.
- Event titles and selector labels omit years/dates. Edition IDs, official URLs and separately optional announcement date/location details remain intact.

## Event-specific graphics

Both WordCamp formats adapt the current official 2027 sites, checked on 2026-10-03: Asia uses Faculty Glyphic/Kumbh Sans, cream/navy/blue and original botanical vector accents; Europe uses Cardo/Inter with neutral editorial rules; India uses bold Cardo/Inter on a dark ground with orange/green type; US uses the actual Open Sans 300/400/600 and generic blue/white coming-soon styling. Europe and India are current announcement-page adaptations, not final campaign identities. US branding is explicitly provisional; its uncorroborated January 1 placeholder date is never used.

The lightweight `/events` catalog includes frozen `colors` and `styleNote` fields. Automatic colors follow the selected event; individual input/URL overrides and Light/Dark remain selected until **Event colors** resets them. Ordinary profile formats retain their neutral automatic defaults. All fonts are pinned and embedded offline, with per-event exact stylesheet CSP hashes. `assets/fonts/event-provenance.json` and `EVENT-FONTS.md` document sources/licenses; `tools/build-event-fonts.py` reproducibly generates the event font module and weight-specific advance/ink metrics. Base profile font/rendering modules remain unchanged.

Frame labels are centered using actual fitted glyph ink, not a shared baseline or one font's cap height. `tests/frame-centering-browser.mjs` measures the full event/role matrix; `tests/event-themes-browser.mjs` verifies fixture compositions and font loading; `tests/event-colors-browser.mjs` exercises real-profile builder palettes, URL overrides, exact server/export parity, downloads, CSP and accessibility. Fixtures are test data, not official event assets. The former developer disclosure is removed; APIs, attribution, privacy and license links remain supported.

## Preview rendering

The large `#page-title` heading is removed at the user's request; the document title, header branding, introduction copy and stylesheet remain unchanged. The introduction is a plain container, with no dangling heading reference. Option-only redraws use the exact server renderer and fonts from the canonical browser-safe `shared/` modules. Server helper paths re-export those modules, so `/card`, SVG downloads and browser-generated PNGs retain identical rendering for equal inputs. No extra build tool or dependency is needed. Spacefast strips modules consumed by Functions compilation from the static catalog, so staging emits browser copies at `preview/*.js` from the same `shared/` sources. Staging derives one SHA-256 revision from canonical source inputs and versions HTML asset references, dynamic imports, the fallback HEAD probe and all transitive browser imports. Only these URL specifiers differ from canonical code; backend sources remain byte-identical. `asset-revision.json` records the input mapping outside the publish root. Verify all eight browser modules, their versioned relative imports and exact staged hashes in the compiled dry-run catalog; source-stage presence alone is not sufficient.

The builder first looks up `/json`, as before. `/preview-data?username=<slug>&size=320` then supplies a server-validated profile/photo snapshot. `size=1024` is loaded only when a social photo is needed; `size=0` skips the photo. Username and size are the only accepted parameters. Profile objects and arbitrary image URLs are never accepted from clients. Once the required inputs are loaded, option changes make no `/card` or upstream requests. Discrete controls render immediately; color-picker input has a 60 ms coalescing delay.

Only the current username's snapshot and two bounded photo variants live in page memory. Remaining profile freshness comes from the server, expires within the existing 15-minute cache window, and is checked with a monotonic browser clock. New lookups/usernames clear it; mismatched snapshots never share photos. Pending requests are coalesced, obsolete completions cannot enable exports, and exports stay disabled until the current SVG image decodes. A confirmed missing optional renderer entry (HTTP 404/410) or unavailable input route retains the original server `/card` path as fallback. Import failures are not automatically treated as unavailability: a bounded same-origin HEAD probe distinguishes a missing entry from authorization/rate-limit errors, wrong MIME, malformed JavaScript/interfaces, and missing dependencies. Those failures stay explicit with exports disabled; reloading retries the module graph. Malformed input responses likewise fail closed. Initial profile loading and the first request for a different photo size still need the network.

Run `tests/preview-browser.mjs` for real-profile byte parity, lazy photo loading, zero-request warm changes, races, controlled expiry, malformed-input rejection and delivery fallback. `tests/preview-performance.mjs` measures 16 actual warm option changes across four visible formats; use `EXPECT_LOCAL_RENDER=1` to require zero requests. An optional `PREVIEW_SOURCE_DIR` substitutes only test-browser HTML/JS and records their hashes, allowing before/after runs on the same backend without publication. Run memory-heavy browser suites sequentially.

## Data, images and limits

### Browser-only custom backgrounds

Visitors can choose JPEG, PNG or static WebP files. File signatures and container dimensions are checked before native decoding; SVG, APNG, animated WebP, malformed containers and oversized inputs are rejected. Limits are 10 MiB, 8192 pixels per side and 32 million source pixels. Decoded images normalize to at most 2048 pixels per side and 4 million pixels. A fresh cropped PNG, limited to 4096 pixels per side and 4 million pixels, is embedded in the exported SVG; the original file, original metadata and off-crop pixels are not embedded. Rounded corners and the avatar frame's transparent center/outer corners retain their shapes.

The image, filename and crop/tint settings never enter application requests, URLs, telemetry or persistent browser storage. Only current-page memory is used. Remove restores the exact canonical SVG; reload or leaving the page clears the image. Download PNG and Download SVG both include the displayed background. Canonical server routes do not receive or reproduce it.

The controls provide horizontal/vertical position, zoom and tint. Selection resets to a centered crop, 1× zoom and 35% tint using the current background color. Only one image decoder and the latest queued selection are allowed; stale/replaced canvases and temporary object URLs are released. A timed-out native decoder cannot be forcibly cancelled, so its slot remains occupied until it actually settles. Another selection fails closed rather than starting a concurrent decoder; remove or reload remains available. Loading/error states disable stale exports, and an in-flight PNG is rejected if the card changes.

### Public profile inputs

Profile fetches go only to `profiles.wordpress.org`. Avatar requests go only to validated HTTPS Gravatar paths. Redirects are rejected. HTTP bodies and elapsed requests are bounded; text and attributes are XML-escaped. Profile data is cached best-effort for 15 minutes in the worker isolate, with a one-minute minimum reuse for refreshes, 128 cached profiles and eight pending lookups. No database or persistent profile store is used.

Card photos use a 320px Gravatar source within 256 KiB. Social photos use a fixed-origin 1024px source within 2 MiB, with a six-second timeout. Raster signatures are checked; avatar requests are coalesced and bounded to eight pending, 32 cached entries and 8 MiB encoded cache data. Missing photos degrade to initials; `X-Profile-Avatar` reports embedded/initials/hidden. Very large Landscape text can produce a larger displayed avatar than its source photo and may appear soft.

Optional JSON-only social enrichment uses `https://en.gravatar.com/<validated-public-hash>.json`, a four-second timeout and 256 KiB limit. Only verified accounts with safe display URLs are retained; their URLs are never fetched. Failure sets `socialUnavailable` without breaking the profile lookup. Modern cards expose these safe links only when Social links is enabled.

New-format SVGs embed pinned OFL fonts and authorize the precise font stylesheet hash through CSP. No external font request is needed. `assets/fonts/provenance.json` records sources/hashes; `python3 tools/build-fonts.py` regenerates the module. `FONT-LICENSES.txt` and `THIRD-PARTY-NOTICES.txt` preserve original notices. Legacy classic output retains its original system fonts and neutral-check badge labels. Both modern formats use original graphical badge icons with optional names and verified source hues, plus contrast-safe glyph ink and label text.

`/card` returns SVG. PNG is generated in the browser from that SVG, not a server PNG endpoint. Cards normally export at 2×; social images use native dimensions. Export scale is bounded by 8192px per edge and 16 million pixels. Images are generated on demand, not stored permanently. No uploads, accounts, email, database-backed app state, analytics or visitor directory are included. Upstream profile HTML changes may require parser updates.

## Complete WordCamp typography verification

Every WordCamp artwork text role uses its event's embedded typography: event headings, curved role labels, announcement role text, display names, handles, available date/location metadata, and fallback initials. Display/body pairings are intentional: Faculty Glyphic/Kumbh Sans for Asia, Cardo/Inter for Europe and India, and Open Sans for the provisional US design. Generic stack entries serve only unsupported glyphs, not ordinary event text.

`tests/event-themes-browser.mjs` checks all 40 event/layout/role combinations through the real `/card` handler with a labeled fixture. It verifies 185 actual painted text fonts against pinned-binary PostScript identities, confirms each text node affects PNG rasterization differently from generic fallback, and proves the font guard rejects deliberate substitution. It also preserves CSP, canonical browser/server equality, background compositing and transparency checks. `tests/event-themes.test.mjs` covers exact family and weight for every text role with and without fallback initials. These are bounded verification checks, not a full WCAG-conformance claim. Re-run the tests for the current candidate rather than treating historical counts as a release gate.

## Deployment boundary

Deployment is a separate, explicitly authorized operation. Neither running tests,
editing themes nor preparing source for sharing authorizes a public release, Git
push, new Space, domain/DNS change, access-grant change or paid operation.
Confirm the intended owner, existing Space/team and access policy before a release;
never reuse another maintainer's deployment identity or private access links.

Stage into a new, dedicated directory outside the source tree:

```sh
# Example disposable staging root; choose an owned persistent path for a release.
export PROFILE_CARDS_RELEASES_DIR="$(mktemp -d)"
node tools/stage.mjs "$PROFILE_CARDS_RELEASES_DIR/release-example/site"
```

`PROFILE_CARDS_RELEASES_DIR` must be absolute, not the source tree, a source ancestor,
filesystem root or home directory. Symlinked roots and existing release directories
are refused. If the variable is omitted, the original maintainer's default remains
for backward compatibility; portable automation should always set it explicitly.

The stage is an explicit frontend/config/Functions/license allowlist. Dependency
metadata and manifests live in the release parent, outside the upload root; tests,
agent instructions, development tools, local evidence and secrets are excluded.
Install dependencies in that parent, compile with the supported Spacefast prebuilt
dry-run workflow, and compare the complete file plan and worker/runtime contract
before any publication. Never publish the source checkout or the release parent.
Preview first, verify the exact candidate, then promote only its verified Version ID
after approval. Read back the live pointer, runtime, served bytes and access policy.
Keep receipts, credentials, browser state and hosted evidence outside source.

`tests/hosted.mjs` is maintainer verification, not an automatic deployment command;
it needs provider-generated receipts and an explicitly chosen access policy.
Supply `EXPECTED_TEAM_SLUG` and `EXPECTED_TEAM_ID` from the approved deployment
record, independently of the readback being checked; do not commit those values.
No specific account, Space, domain or grant set is required to develop locally.
The host may report a database capability despite `runtime.database: false`; the
application does not use a database. Verify actual hosted capabilities rather than
inferring them from source settings. Hosted traversal-shaped queries may be rejected
before application validation.

## Sharing the source

Share this project directory, including its dotfiles, `LICENSE`, `LICENSING.md`,
agent instructions, theme guide, `assets/`, `functions/`, `public/`, `shared/`,
`tests/`, `tools/` and both package manifests. It does not require the enclosing
Spacefast repository or private project records. Do not share the enclosing
multi-project repository, Git history, deployment receipts, browser state, secrets,
installed dependencies or local evidence by accident. `.gitignore` is a convenience,
not a substitute for inspecting the archive or Git diff before publishing it.

A hosting stage is intentionally incomplete as a source handoff: it omits the source
font binaries, generators, tests and contributor docs. Share the source project,
not `site/`. `"private": true` in `package.json` prevents accidental npm publication;
it does not restrict sharing the source under the GPL.

## Provenance

Upstream inspected: `donini/wp-profiles-card` at `e214f522b5c8d6bafe7060aa64a643ef1dc64b5f`. Implemented independently rather than copying upstream source/branding. Upstream package metadata declares ISC without a standalone LICENSE file. `linkedom@0.18.13` is ISC licensed; dependency notices are retained. Production handlers do not use native Node APIs.
