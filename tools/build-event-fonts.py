#!/usr/bin/env python3
"""Offline event fonts only; base profile fonts are deliberately untouched.
Requires fontTools 4.57.0 + Brotli. Inputs/hashes live in each event's fonts/manifest.json.
Original names and OFL notices are retained. CSS aliases do not rename binaries.
Run python3 tools/build-event-fonts.py. No downloads or runtime dependencies.
"""
import base64
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVENT_DIRECTORIES = ('wordcamp-asia', 'wordcamp-europe', 'wordcamp-india', 'wordcamp-us')
# Preserve the original public object ordering and metric asset basenames.
ASSET_ORDER = ('Faculty-Glyphic-400.woff2', 'Kumbh-Sans-400.woff2', 'Kumbh-Sans-500.woff2',
               'Cardo-400.woff2', 'Cardo-700.woff2', 'Open-Sans-300.woff2',
               'Open-Sans-400.woff2', 'Open-Sans-600.woff2', 'Inter-latin.woff2')


def face_key(item, weight):
    return item['family'].lower().replace(' ', '-') + '-' + str(weight)


def local_file(directory, name):
    """Manifest paths are local basenames, never shared/base font dependencies."""
    if not isinstance(name, str) or not name or Path(name).name != name or name in ('.', '..'):
        raise ValueError(f'Non-local font path: {name!r}')
    path = directory / name
    if path.resolve().parent != directory.resolve():
        raise ValueError(f'Non-local font path: {name!r}')
    return path


def load_sources(root=ROOT):
    """Validate every copy before deduplicating identical assets and faces."""
    assets, faces, selections = {}, {}, {}
    for event in EVENT_DIRECTORIES:
        directory = root / 'events' / event / 'fonts'
        manifest = json.loads((directory / 'manifest.json').read_text())
        if set(manifest) != {'editions', 'assets'} or not isinstance(manifest['editions'], dict) or not isinstance(manifest['assets'], list):
            raise ValueError(f'Invalid font manifest: {directory}')
        local_faces = set()
        for item in manifest['assets']:
            name = item['path']
            data = local_file(directory, name).read_bytes()
            if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
                raise ValueError(f'Font bytes/hash mismatch: {directory / name}')
            if 'sourcePath' in item:
                source = local_file(directory, item['sourcePath']).read_bytes()
                if hashlib.sha256(source).hexdigest() != item['sourceSha256']:
                    raise ValueError(f'Font source hash mismatch: {directory / item["sourcePath"]}')
            if name in assets and assets[name][1] != item:
                raise ValueError(f'Conflicting asset definition: {name}')
            assets.setdefault(name, (directory, item, data))
            for weight in item['weights']:
                key = face_key(item, weight)
                if key in faces and faces[key] != item:
                    raise ValueError(f'Conflicting face definition: {key}')
                faces[key] = item
                local_faces.add(key)
        for edition, keys in manifest['editions'].items():
            if edition in selections:
                raise ValueError(f'Duplicate edition definition: {edition}')
            if not isinstance(keys, list) or len(keys) != 3 or any(key not in local_faces for key in keys):
                raise ValueError(f'Edition must select three local faces (display/body/emphasis): {edition}')
            selections[edition] = keys
    # Unknown/new assets retain explicit manifest order after the historic assets.
    order = {name: index for index, name in enumerate(ASSET_ORDER)}
    return sorted(assets.values(), key=lambda entry: order.get(entry[1]['path'], len(order))), selections


def build():
    # Only regeneration needs fontTools; source validation uses the stdlib.
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    from fontTools.pens.boundsPen import BoundsPen

    inputs, selections = load_sources()
    faces, css = {}, {}
    for directory, item, data in inputs:
        if 'sourcePath' in item:
            source = local_file(directory, item['sourcePath']).read_bytes()
            compressed = TTFont(io.BytesIO(source), recalcTimestamp=False)
            compressed.flavor = 'woff2'
            output = io.BytesIO(); compressed.save(output)
            if output.getvalue() != data:
                raise ValueError('WOFF2 conversion drift: ' + item['path'])
        original = TTFont(io.BytesIO(data))
        alias = 'Event ' + item['family']
        weights = '100 900' if 'fvar' in original else str(item['weights'][0])
        css[item['path']] = '@font-face{font-family:"' + alias + '";font-style:normal;font-weight:' + weights + ';src:url(data:font/woff2;base64,' + base64.b64encode(data).decode() + ') format("woff2");}'
        for weight in item['weights']:
            font = instantiateVariableFont(original, {'wght': weight}, inplace=False) if 'fvar' in original else original
            glyphs = font.getGlyphSet(); advances, ink = {}, {}
            for code, glyph in font.getBestCmap().items():
                char = chr(code); advances[char] = font['hmtx'].metrics[glyph][0]
                pen = BoundsPen(glyphs); glyphs[glyph].draw(pen)
                if pen.bounds: ink[char] = [round(pen.bounds[1], 4), round(pen.bounds[3], 4)]
            key = face_key(item, weight)
            faces[key] = dict(key=key, family=item['family'], alias=alias, weight=weight, asset=item['path'], units=font['head'].unitsPerEm, capHeight=getattr(font['OS/2'], 'sCapHeight', ink['H'][1]), advances=advances, ink=ink)
    # Match advance-based fitting in browser and server; no synthetic weights or
    # unmodelled kerning/ligature changes. Unsupported scripts use bounded fallback.
    text_css = 'text{font-synthesis:none;font-kerning:none;font-variant-ligatures:none;}'
    event_css = {event: ''.join(css[file] for file in dict.fromkeys(faces[key]['asset'] for key in keys)) + text_css for event, keys in selections.items()}
    hashes = {event: 'sha256-' + base64.b64encode(hashlib.sha256(value.encode()).digest()).decode() for event, value in event_css.items()}
    serial = lambda value: json.dumps(value, ensure_ascii=True, separators=(',', ':'))
    module = '// Generated by tools/build-event-fonts.py from pinned OFL assets; do not hand-edit.\n'
    module += 'export const EVENT_FONT_METRICS = ' + serial(faces) + ';\n'
    # Deduplicate binaries between the two Cardo/Inter events in the JS module.
    module += 'const CSS = ' + serial(css) + ';\n'
    module += 'const TEXT_CSS = ' + serial(text_css) + ';\n'
    module += 'export const EVENT_FONTS = Object.freeze({' + ','.join(serial(event) + ':Object.freeze({' + ','.join(role+':EVENT_FONT_METRICS['+serial(key)+']' for role,key in zip(['display','body','emphasis'],keys)) + '})' for event,keys in selections.items()) + '});\n'
    module += 'export const EVENT_FONT_CSS = Object.freeze({' + ','.join(serial(event)+':'+'+'.join('CSS['+serial(file)+']' for file in dict.fromkeys(faces[key]['asset'] for key in keys))+'+TEXT_CSS' for event,keys in selections.items()) + '});\n'
    module += 'export const EVENT_FONT_STYLE_HASH = Object.freeze(' + serial(hashes) + ');\n'
    module += '''
export function measureEventText(value, size, face) {
  let units = 0;
  for (const char of String(value)) units += face.advances[char] ?? face.units * 1.3;
  return units * size / face.units;
}
// The vertical midpoint of the actual glyph ink, including rounded-cap overshoot
// and punctuation. Use the fitted label/face, never Inter's cap ratio for Cardo.
export function eventInkCenter(value, face) {
  const boxes = [...value].map(char => face.ink[char]).filter(Boolean);
  if (!boxes.length) return face.capHeight / face.units / 2;
  return (Math.min(...boxes.map(b => b[0])) + Math.max(...boxes.map(b => b[1]))) / face.units / 2;
}
'''
    (ROOT / 'events/fonts.js').write_text(module)
    print(json.dumps({'moduleBytes':len(module.encode()), 'eventStyleBytes':{key:len(value) for key,value in event_css.items()},'hashes':hashes}))


if __name__ == '__main__':
    build()
