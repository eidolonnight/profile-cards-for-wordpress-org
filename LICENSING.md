# Licensing and third-party resources

## Project license

SPDX-License-Identifier: GPL-2.0-or-later

Except for the separately identified third-party resources below, the project-authored
source code, documentation, tests, build tools and original vector artwork in this
project are licensed under the GNU General Public License, version 2 or later.
Copyright remains with the respective copyright holders; this notice does not assign
ownership or replace any existing attribution.

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. See [LICENSE](LICENSE) for the complete, unmodified text.

This is the same licensing choice as [WordPress itself](https://wordpress.org/about/license/).
It is a standalone JavaScript application, not a WordPress plugin or theme; license
compatibility does not imply WordPress.org directory review or official endorsement.
The license text comes from the [Free Software Foundation](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt).

## JavaScript dependencies

`package-lock.json` pins all production dependencies, including nested versions.
The current dependency licenses are MIT, ISC and BSD-2-Clause. Their copyright
holders and complete license texts are retained in
[public/THIRD-PARTY-NOTICES.txt](public/THIRD-PARTY-NOTICES.txt).
Repeated identical notices may cover multiple versions; distinct copyright notices
must not be lost when a package appears more than once in the dependency tree.

| Package | Locked version(s) | License |
| --- | --- | --- |
| `boolbase` | `2.0.0` | `ISC` |
| `css-select` | `7.0.0` | `BSD-2-Clause` |
| `css-what` | `8.0.0` | `BSD-2-Clause` |
| `cssom` | `0.5.0` | `MIT` |
| `dom-serializer` | `2.0.0`, `3.1.1` | `MIT` |
| `domelementtype` | `2.3.0`, `3.0.0` | `BSD-2-Clause` |
| `domhandler` | `5.0.3`, `6.0.1` | `BSD-2-Clause` |
| `domutils` | `3.2.2`, `4.0.2` | `BSD-2-Clause` |
| `entities` | `4.5.0`, `7.0.1`, `8.1.0` | `BSD-2-Clause` |
| `html-escaper` | `3.0.3` | `MIT` |
| `htmlparser2` | `10.1.0` | `MIT` |
| `linkedom` | `0.18.13` | `ISC` |
| `nth-check` | `3.0.1` | `BSD-2-Clause` |
| `uhyphen` | `0.2.0` | `ISC` |

## Fonts

The font software remains under the SIL Open Font License 1.1 (`OFL-1.1`),
not the project's GPL. Original font licenses and copyright notices are in
`assets/fonts/` and reproduced in [public/FONT-LICENSES.txt](public/FONT-LICENSES.txt).
The OFL permits bundling fonts alongside other open-source software; retain its
terms, copyright notices and any reserved-font-name restrictions. See the
[OFL FAQ](https://openfontlicense.org/ofl-faq/), especially its bundling and embedding guidance.

| Font family | Original copyright/license file | Binary provenance |
| --- | --- | --- |
| EB Garamond | [EBGaramond-OFL.txt](assets/fonts/EBGaramond-OFL.txt) | [Profile fonts](assets/fonts/provenance.json) |
| Inter | [Inter-OFL.txt](assets/fonts/Inter-OFL.txt) | [Profile fonts](assets/fonts/provenance.json) and [event fonts](assets/fonts/event-provenance.json) |
| Faculty Glyphic | [facultyglyphic-OFL.txt](assets/fonts/facultyglyphic-OFL.txt) | [Event fonts](assets/fonts/event-provenance.json) |
| Kumbh Sans | [kumbhsans-OFL.txt](assets/fonts/kumbhsans-OFL.txt) | [Event fonts](assets/fonts/event-provenance.json) |
| Cardo | [cardo-OFL.txt](assets/fonts/cardo-OFL.txt) | [Event fonts](assets/fonts/event-provenance.json) |
| Open Sans | [OpenSans-OFL.txt](assets/fonts/OpenSans-OFL.txt) | [Event fonts](assets/fonts/event-provenance.json), including original TTFs and WOFF2 conversion details |

Font binaries embedded as data URLs in `shared/fonts.js` and `shared/event-fonts.js`
retain the OFL. The surrounding project-authored JavaScript is GPL-2.0-or-later.
Do not relabel the embedded fonts as GPL or remove their notices when distributing
compiled assets. Follow [the event-theme guide](docs/event-themes.md) when changing
fonts, their metrics or their provenance.

## External content, identity and attribution

Public WordPress.org profile text, avatars, linked social profiles, and visitor-supplied
background images are not relicensed by this project. Their owners retain their rights.
Generating or downloading a card does not grant ownership of those inputs. SVGs may
contain embedded font software; its original license and metadata still apply.

The software license does not grant trademark rights to WordPress, WordCamp, event
identities or social-platform names. Event treatments are adaptations, not official
event assets; participation roles are self-reported, not proof of registration.
Preserve the application's independence, privacy and participation notices.

The application was independently implemented, inspired by
[CardPress by Rodrigo Donini](https://github.com/donini/wp-profiles-card).
The inspected upstream reference was commit `e214f522b5c8d6bafe7060aa64a643ef1dc64b5f`;
its source/branding was not copied. That acknowledgement is not a license grant
for future copying: check and retain the relevant upstream license before importing code.

## Sharing and future changes

Share this complete project directory with its source, generators, pinned fonts,
provenance, package lockfile, `LICENSE`, this file and the two public notice files.
A staged hosting directory is not the complete source distribution. When distributing
compiled/minified code, provide the complete corresponding source as required by the GPL;
a dependency lockfile alone is not a substitute for the source of bundled dependencies.

Do not include credentials, browser state, private access receipts, installed
`node_modules`, local evidence or other projects from an enclosing workspace in a
public source handoff. Review all added dependencies and assets for GPL compatibility,
record their origins, and retain their license/copyright notices. Do not change the
project license or assign copyright ownership without the maintainers' authorization.

`node --test tests/licensing.test.mjs` checks the project declaration, official GPL text,
notices for every installed locked dependency and every bundled font-family license.
Run `npm ci --ignore-scripts` first. This check is a regression guard, not a legal opinion
or an automatic approval of a newly introduced license.
