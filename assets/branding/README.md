# Wapuu branding

`wapuu-source.png` is the unmodified, user-supplied 1254 × 1254 RGBA artwork.
Its SHA-256 is `d6aad31f0b96548268e9bd8b943a2a0f40b709f6ed2c06845f0a84f75314e25a`.
It has real alpha transparency; fully transparent pixels may contain magenta RGB.
Do not flatten those pixels or remove the background again.

Original embedded attribution:

> Wapuu designed by Kazuko Kaneuchi; derivative under GPL-2.0-or-later. WordPress trademarks remain subject to their applicable rights.

The full mascot is used for the hero and the favicon, without redrawing or
cropping any visible artwork. Transparent outer margins are trimmed to the alpha
bounds. For the favicon the mascot is then proportionally fitted and centered on
a transparent square.

- `public/site-hero.webp`: 668 × 840, with alpha. The mascot mirrored to face
  left, toward the page. Rendered up to 420 CSS pixels tall.
- `public/favicon.png`: 96 × 96, RGBA.
- `public/site-favicon.ico`: 16 × 16, 32 × 32 and 48 × 48 RGBA frames.

Mirroring would reverse the WordPress mark on the board, so the hero puts it
back: the mark's own pixels are lifted from the source, turned to sit on the
mirrored board and blended into the board's flat face. Nothing is redrawn. The
turn is twice the tilt of the W's top serifs, so the mark leans with the board
as it does in the source. The WebP carries the attribution above as XMP.

The source stays in Git, outside the runtime staging allowlist. Only the three
small derivatives are published. `tools/stage.mjs` adds the same content-derived
cache revision used for the other browser assets to their HTML references.

The ICO uses an explicit nonreserved filename because the hosting edge serves
its own default at `/favicon.ico`, even with a revision query. Both declared
favicon URLs must return the exact published artwork.

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

derivative(96).save(root / 'public/favicon.png', optimize=True, pnginfo=metadata)
derivative(48).save(root / 'public/site-favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
```

The hero, with the same optional dependency (Pillow with WebP support):

```python
import math
from pathlib import Path
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw, ImageFilter, ImageOps

root = Path('.')
source = Image.open(root / 'assets/branding/wapuu-source.png')
attribution = source.info['Attribution']
source = source.convert('RGBA')
# The WordPress mark on the board, measured on the source: centre, outer radius, and
# the tilt of the W's top serifs in degrees (negative rises to the right).
CX, CY, RADIUS, TILT = 751.63, 805.14, 123.49, -6.64
width, height = source.size
mirrored_x = (width - 1) - CX
turn = math.radians(-2 * TILT)
cos, sin = math.cos(turn), math.sin(turn)
# The mark, lifted from the source and turned to sit on the mirrored board.
turned = source.transform(source.size, Image.Transform.AFFINE, (
    cos, sin, CX - (cos * mirrored_x + sin * CY),
    -sin, cos, CY - (-sin * mirrored_x + cos * CY)), resample=Image.Resampling.BICUBIC)
scale, edge = 4, (RADIUS + 11) * 4
mask = Image.new('L', (width * scale, height * scale), 0)
ImageDraw.Draw(mask).ellipse(((mirrored_x + .5) * scale - edge, (CY + .5) * scale - edge,
                              (mirrored_x + .5) * scale + edge, (CY + .5) * scale + edge), fill=255)
mask = mask.resize(source.size, Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(1.5))
hero = Image.composite(turned, ImageOps.mirror(source), mask)
hero = hero.crop(hero.getchannel('A').getbbox())
hero = hero.resize((round(hero.width * 840 / hero.height), 840), Image.Resampling.LANCZOS)
xmp = ('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
       '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">'
       'Left-facing newsboy Wapuu with WordPress sandwich board</rdf:li></rdf:Alt></dc:title><dc:rights><rdf:Alt>'
       f'<rdf:li xml:lang="x-default">{escape(attribution)}</rdf:li></rdf:Alt></dc:rights></rdf:Description></rdf:RDF></x:xmpmeta>')
hero.save(root / 'public/site-hero.webp', quality=86, method=6, xmp=xmp.encode())
```

PNG and WebP compression can vary between Pillow versions; preserve decoded
dimensions, transparency, artwork and attribution. If the source artwork is
replaced, measure its mark again before reusing the hero recipe. Review exports on both opaque light
and dark backgrounds at actual display sizes. An image viewer that drops alpha
can misleadingly expose the source's hidden magenta pixels.
