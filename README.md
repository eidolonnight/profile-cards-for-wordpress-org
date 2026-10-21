# Profile Cards for WordPress.org

Create profile cards and WordCamp graphics using your public WordPress.org profile.

[Make your card](https://profiles.wapuu.news/)

This is an independent project, not an official WordPress.org service. No sign-in is required. WordCamp roles are self-reported, not proof of registration or selection.

## Update your event's theme

Everything for each event lives in one folder under [`events/`](events/), shared across its yearly editions:

- [WordCamp Asia](events/wordcamp-asia/)
- [WordCamp Europe](events/wordcamp-europe/)
- [WordCamp India](events/wordcamp-india/)
- [WordCamp US](events/wordcamp-us/)

Each folder contains:

- `theme.js`: colors and styling choices.
- `artwork.js`: the SVG artwork and event headings.
- `fonts/`: font files, licenses and source records.
- `event.js`: edition details, including dates and official links.

Give your coding agent the event folder, official event website and any approved brand assets. Describe what should change and ask for a focused pull request with before-and-after previews. For example:

> Update the WordCamp Asia theme in `events/wordcamp-asia/` to match these brand guidelines: [link]. Read `AGENTS.md` and the event guide first. Keep other events unchanged, preserve existing edition links, and include previews of the avatar frame and social card in the PR.

Use artwork and fonts you have permission to share, and retain their credits and licenses. Keep future editions in the same event folder. The [event guide](events/README.md) has the details your agent needs.

## Other contributions

Describe the change or bug to your agent and point it to [AGENTS.md](AGENTS.md). Review the proposed changes and previews before merging its PR.

## Credits and license

Inspired by [CardPress by Rodrigo Donini](https://github.com/donini/wp-profiles-card). Project code is [GPL-2.0-or-later](LICENSE); bundled fonts and other third-party resources retain their [own licenses and credits](LICENSING.md).
