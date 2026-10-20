#!/usr/bin/env python3
"""Rebuild the self-contained card font module from pinned, licensed assets.
Requires Python fontTools and Brotli for WOFF2; neither is a runtime dependency.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/fonts'
provenance = json.loads((ASSETS / 'provenance.json').read_text())
expected = {item['path']: item['sha256'] for item in provenance}
css, metrics = [], {}
for filename, family, weights in [
    ('EBGaramond-latin.woff2', 'Card Garamond', [('serif', 500)]),
    ('Inter-latin.woff2', 'Card Inter', [('sans', 400), ('sansBold', 600)]),
]:
    path = ASSETS / filename
    data = path.read_bytes()
    assert data[:4] == b'wOF2', f'Invalid WOFF2: {filename}'
    assert hashlib.sha256(data).hexdigest() == expected[str(path.relative_to(ROOT))], f'Font hash changed: {filename}'
    for key, weight in weights:
        font = instantiateVariableFont(TTFont(io.BytesIO(data)), {'wght': weight}, inplace=False)
        metrics[key] = {
            'units': font['head'].unitsPerEm,
            'advances': {chr(code): font['hmtx'].metrics[glyph][0] for code, glyph in font.getBestCmap().items()},
        }
    css.append('@font-face{font-family:"' + family + '";font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,' + base64.b64encode(data).decode() + ') format("woff2");}')
css = ''.join(css)
style_hash = 'sha256-' + base64.b64encode(hashlib.sha256(css.encode()).digest()).decode()
module = '// Generated from licensed assets/fonts by tools/build-fonts.py; do not hand-edit.\n'
module += 'export const FONT_CSS = ' + json.dumps(css) + ';\n'
module += 'export const FONT_STYLE_HASH = ' + json.dumps(style_hash) + ';\n'
module += 'export const FONT_METRICS = ' + json.dumps(metrics, ensure_ascii=True, separators=(',', ':')) + ';\n'
(ROOT / 'shared/fonts.js').write_text(module)
print(json.dumps({'module': 'shared/fonts.js', 'bytes': len(module.encode()), 'fontStyleHash': style_hash, 'metrics': {key: len(value['advances']) for key, value in metrics.items()}}))
