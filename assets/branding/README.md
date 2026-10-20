# Wapuu branding

`wapuu-source.png` is the unmodified, user-supplied 1254 × 1254 RGBA artwork.
Its SHA-256 is `d6aad31f0b96548268e9bd8b943a2a0f40b709f6ed2c06845f0a84f75314e25a`.
It has real alpha transparency; fully transparent pixels may contain magenta RGB.
Do not flatten those pixels or remove the background again.

Original embedded attribution:

> Wapuu designed by Kazuko Kaneuchi; derivative under GPL-2.0-or-later. WordPress trademarks remain subject to their applicable rights.

The full mascot is used for both the header and favicon, without redrawing or
cropping any visible artwork. Transparent outer margins are trimmed to the alpha
bounds, then the mascot is proportionally fitted and centered on a transparent
square. Header rendering is 56 CSS pixels on desktop and 48 on narrow screens.

- `public/site-logo.png`: 192 × 192, RGBA.
- `public/favicon.png`: 96 × 96, RGBA.
- `public/favicon.ico`: 16 × 16, 32 × 32 and 48 × 48 RGBA frames.

The source stays in Git, outside the runtime staging allowlist. Only the three
small derivatives are published. `tools/stage.mjs` adds the same content-derived
cache revision used for the other browser assets to their HTML references.

## Export recipe

Optional authoring dependency: Python with Pillow. It is not required during
normal installs, builds or deployment. Run from the repository root:

```python
from pathlib import Path
from PIL import Image, PngImagePlugin

root = Path('.')
source = Image.open(root / 'assets/branding/wapuu-source.png')
figure = source.crop(source.getchannel('A').getbbox())
metadata = PngImagePlugin.PngInfo()
for key, value in source.info.items():
    if isinstance(value, str):
        metadata.add_text(key, value)

def derivative(size):
    margin = max(1, round(size / 32))
    art = figure.copy()
    art.thumbnail((size - 2 * margin, size - 2 * margin), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas

for name, size in [('site-logo.png', 192), ('favicon.png', 96)]:
    derivative(size).save(root / 'public' / name, optimize=True, pnginfo=metadata)
derivative(48).save(root / 'public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
```

PNG compression can vary between Pillow versions; preserve decoded dimensions,
RGBA transparency, artwork and attribution. Review exports on both opaque light
and dark backgrounds at actual display sizes. An image viewer that drops alpha
can misleadingly expose the source's hidden magenta pixels.
