// Browser-only, local raster ingestion. This module never fetches, persists, or
// uploads images. The only input markup applyBackground accepts is renderer SVG;
// it is NOT a general-purpose SVG sanitizer. User files only enter as bytes.
export const LIMITS = Object.freeze({
  maxInputBytes: 10 * 1024 * 1024,
  maxInputSide: 8192,
  maxInputPixels: 32000000,
  normalizedSide: 2048,
  normalizedPixels: 4000000,
  cropSide: 4096,
  cropPixels: 4000000,
  timeoutMs: 10000,
});
const NS = 'http://www.w3.org/2000/svg';
const invalid = (message = 'Invalid or corrupt image. Choose a JPEG, PNG, or nonanimated WebP.') => new Error(message);
function dimensions(width, height, side = LIMITS.maxInputSide, pixels = LIMITS.maxInputPixels) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > side || height > side || width * height > pixels) throw invalid('Image dimensions exceed the supported limits or are invalid.');
  return { width, height };
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Pure, bounded structural inspection; full pixel validity is checked by decode. */
export function inspectImage(input) {
  const b = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!b || !b.length || b.length > LIMITS.maxInputBytes) throw invalid('Image must be nonempty and no larger than 10 MiB.');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const text = (offset, size) => String.fromCharCode(...b.subarray(offset, offset + size));
  const result = (mime, width, height) => ({ ...dimensions(width, height), mime });
  if (b.length >= 8 && b[0] === 137 && text(1, 7) === 'PNG\r\n\x1a\n') {
    let pos = 8; let width; let height; let depth; let color; let palette = false; let data = false; let dataEnded = false;
    while (pos + 12 <= b.length) {
      const length = v.getUint32(pos); const type = text(pos + 4, 4); const end = pos + 12 + length;
      if (end > b.length || !/^[A-Za-z]{4}$/.test(type) || (b[pos + 6] & 32)) throw invalid();
      if (crc32(b, pos + 4, end - 4) !== v.getUint32(end - 4)) throw invalid('Corrupt PNG checksum.');
      if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw invalid('Animated PNG images are not supported.');
      if (pos === 8 && type !== 'IHDR') throw invalid();
      if (type === 'IHDR') {
        if (pos !== 8 || length !== 13) throw invalid();
        width = v.getUint32(pos + 8); height = v.getUint32(pos + 12); dimensions(width, height);
        depth = b[pos + 16]; color = b[pos + 17];
        const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!depths[color]?.includes(depth) || b[pos + 18] !== 0 || b[pos + 19] !== 0 || b[pos + 20] > 1) throw invalid();
      } else if (type === 'PLTE') {
        if (palette || data || !length || length % 3 || length > 768 || color === 0 || color === 4 || (color === 3 && length / 3 > 2 ** depth)) throw invalid();
        palette = true;
      } else if (type === 'IDAT') {
        if (dataEnded || (color === 3 && !palette)) throw invalid();
        data = data || length > 0;
      } else if (type === 'IEND') {
        if (length || end !== b.length || !data) throw invalid();
        return result('image/png', width, height);
      } else if (!(b[pos + 4] & 32)) throw invalid('Unsupported critical PNG chunk.');
      if (data && type !== 'IDAT') dataEnded = true;
      pos = end;
    }
    throw invalid('Truncated PNG image.');
  }
  if (b[0] === 255 && b[1] === 216) {
    let pos = 2; let width; let height; let scans = 0; let entropy = false;
    while (pos < b.length) {
      if (entropy) {
        while (pos < b.length && b[pos] !== 255) pos++;
      }
      if (b[pos++] !== 255) throw invalid();
      while (b[pos] === 255) pos++;
      const marker = b[pos++];
      if (entropy && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
      entropy = false;
      if (marker === 0xd9) {
        if (!width || !scans || pos !== b.length) throw invalid();
        return result('image/jpeg', width, height);
      }
      if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || pos + 2 > b.length) throw invalid();
      const length = v.getUint16(pos); const end = pos + length;
      if (length < 2 || end > b.length) throw invalid();
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (![0xc0, 0xc1, 0xc2].includes(marker) || width || length < 8) throw invalid('Unsupported JPEG frame.');
        height = v.getUint16(pos + 3); width = v.getUint16(pos + 5); dimensions(width, height);
        const components = b[pos + 7];
        if (b[pos + 2] !== 8 || ![1, 3, 4].includes(components) || length !== 8 + 3 * components) throw invalid();
      }
      // DNL and hierarchical frames can change the dimensions after the header.
      if ([0xdc, 0xde, 0xdf].includes(marker)) throw invalid('Unsupported JPEG dimensions.');
      if (marker === 0xda) {
        if (!width || length < 6 || !b[pos + 2] || length !== 6 + 2 * b[pos + 2]) throw invalid();
        scans++; entropy = true;
      }
      pos = end;
    }
    throw invalid('Truncated JPEG image.');
  }
  if (b.length >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    if (v.getUint32(4, true) + 8 !== b.length) throw invalid('Invalid WebP container size.');
    let pos = 12; let frame; let extended;
    while (pos + 8 <= b.length) {
      const type = text(pos, 4); const length = v.getUint32(pos + 4, true); const start = pos + 8; const end = start + length;
      if (end + (length & 1) > b.length) throw invalid();
      if (['ANIM', 'ANMF'].includes(type)) throw invalid('Animated WebP images are not supported.');
      if (type === 'VP8X') {
        if (length !== 10 || pos !== 12 || extended || (b[start] & 0xc1) || b[start + 1] || b[start + 2] || b[start + 3]) throw invalid();
        if (b[start] & 2) throw invalid('Animated WebP images are not supported.');
        const u24 = p => b[p] + b[p + 1] * 256 + b[p + 2] * 65536;
        extended = dimensions(1 + u24(start + 4), 1 + u24(start + 7));
      } else if (type === 'VP8L') {
        if (frame || length < 5 || b[start] !== 47) throw invalid();
        const bits = v.getUint32(start + 1, true);
        if (bits >>> 29) throw invalid();
        frame = dimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
      } else if (type === 'VP8 ') {
        if (frame || length < 10 || (b[start] & 1) || text(start + 3, 3) !== '\x9d\x01\x2a') throw invalid();
        frame = dimensions(v.getUint16(start + 6, true) & 0x3fff, v.getUint16(start + 8, true) & 0x3fff);
      }
      pos = end + (length & 1);
    }
    if (pos !== b.length || !frame || (extended && (extended.width !== frame.width || extended.height !== frame.height))) throw invalid();
    return result('image/webp', frame.width, frame.height);
  }
  throw invalid('Choose a JPEG, PNG, or nonanimated WebP. SVG and other file types are not supported.');
}

function positive(value) { if (!Number.isFinite(value) || value <= 0) throw invalid('Invalid image geometry.'); return value; }
/** Pure proportional resize, never upscales, with integer raster dimensions. */
export function fitWithin(width, height, maxSide, maxPixels) {
  [width, height, maxSide, maxPixels].forEach(positive);
  const scale = Math.min(1, maxSide / width, maxSide / height, Math.sqrt(maxPixels / width / height));
  const w = Math.max(1, Math.floor(width * scale)); const h = Math.max(1, Math.floor(height * scale));
  return { width: w, height: h };
}
function setting(value, fallback, min, max) {
  const n = value === undefined ? fallback : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw invalid('Background controls are outside their supported range.');
  return n;
}
function settings(input = {}) {
  const tint = input.tint === undefined ? '#000000' : input.tint;
  if (typeof tint !== 'string' || !/^#[0-9a-f]{6}$/i.test(tint)) throw invalid('Background tint must be a six-digit hex color.');
  return { x: setting(input.x, 50, 0, 100), y: setting(input.y, 50, 0, 100), zoom: setting(input.zoom, 1, 1, 3), tint, tintOpacity: setting(input.tintOpacity, 0, 0, 1) };
}
/** x/y align the available source crop range: 0=start, 50=center, 100=end. */
export function coverCrop(sourceWidth, sourceHeight, width, height, options = {}) {
  [sourceWidth, sourceHeight, width, height].forEach(positive);
  const { x, y, zoom } = settings(options);
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * zoom;
  const sw = Math.min(sourceWidth, width / scale); const sh = Math.min(sourceHeight, height / scale);
  return { sx: (sourceWidth - sw) * x / 100, sy: (sourceHeight - sh) * y / 100, sw, sh };
}
/** Attributes are numbers/number strings from the existing trusted SVG nodes. */
export function backgroundGeometry(kind, attributes) {
  const n = (key, fallback = 0) => {
    const value = attributes[key] == null ? fallback : Number(attributes[key]);
    if (!Number.isFinite(value)) throw invalid('Invalid SVG background geometry.');
    return value;
  };
  if (kind === 'ring') {
    const radius = positive(n('r')); const half = positive(n('stroke-width')) / 2;
    const outerRadius = radius + half; const innerRadius = radius - half;
    if (innerRadius <= 0) throw invalid('Invalid SVG ring geometry.');
    return { kind, x: n('cx') - outerRadius, y: n('cy') - outerRadius, width: outerRadius * 2, height: outerRadius * 2, innerRadius, outerRadius };
  }
  if (kind !== 'rect') throw invalid('Unsupported SVG background geometry.');
  const width = positive(n('width')); const height = positive(n('height'));
  const rx = n('rx', n('ry')); const ry = n('ry', rx);
  if (rx < 0 || ry < 0) throw invalid('Invalid SVG corner radius.');
  return { kind, x: n('x'), y: n('y'), width, height, rx: Math.min(rx, width / 2), ry: Math.min(ry, height / 2) };
}

function timed(promise, label, onLate = () => {}) {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; const error = invalid(`${label} timed out. Try a smaller image.`); error.code = 'background_timeout'; reject(error); }, LIMITS.timeoutMs);
    Promise.resolve(promise).then(value => {
      clearTimeout(timer);
      if (expired) { onLate(value); return; }
      resolve(value);
    }, error => { clearTimeout(timer); if (!expired) reject(error); });
  });
}
function imageFallback(blob) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== 'function' || typeof URL?.createObjectURL !== 'function') { reject(invalid('This browser cannot decode this image.')); return; }
    let image; let url; let timer; let finished = false;
    const release = () => {
      clearTimeout(timer);
      if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src'); }
      if (url) { URL.revokeObjectURL(url); url = null; }
    };
    const fail = error => { if (finished) return; finished = true; release(); reject(error); };
    try {
      image = new Image(); url = URL.createObjectURL(blob);
      image.onload = () => {
        if (finished) return;
        finished = true; clearTimeout(timer); image.onload = null; image.onerror = null;
        resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, release });
      };
      image.onerror = () => fail(invalid('The image is corrupt or cannot be decoded.'));
      timer = setTimeout(() => fail(invalid('Image decoding timed out. Try a smaller image.')), LIMITS.timeoutMs);
      // Modern HTMLImageElement decoding, like from-image ImageBitmap, applies EXIF orientation.
      image.src = url;
    } catch (error) { fail(error); }
  });
}
// A timeout ends our wait, not the noncancellable native decoder. Keep its
// slot occupied until the actual operation settles, even across later loads.
let nativeDecodePending = false;
async function nativeBitmap(blob) {
  nativeDecodePending = true;
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  finally { nativeDecodePending = false; }
}
async function decode(blob) {
  // Outside the fallback catch: a busy decoder must not launch another decode.
  if (nativeDecodePending) throw invalid('The browser is still decoding the previous image. Please wait, or reload the page if it remains stuck.');
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await timed(nativeBitmap(blob), 'Image decoding', late => late.close());
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch (error) {
      // Do not launch a second decode while a timed-out native decode is still alive.
      if (error?.code === 'background_timeout') throw error;
    }
  }
  return imageFallback(blob);
}
function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}
function releaseCanvas(canvas) { if (canvas) { canvas.width = 0; canvas.height = 0; } }

/** Returns a normalized local canvas. The owner must dispose replaced/stale results. */
export async function loadBackground(file) {
  if (!file || !Number.isInteger(file.size) || file.size <= 0 || file.size > LIMITS.maxInputBytes || typeof file.arrayBuffer !== 'function') throw invalid('Choose a nonempty image no larger than 10 MiB.');
  const bytes = new Uint8Array(await timed(file.arrayBuffer(), 'Image reading'));
  if (bytes.length !== file.size) throw invalid('The image changed while it was being read.');
  const header = inspectImage(bytes); // Reject dimensions/animation BEFORE browser decode.
  const decoded = await decode(new Blob([bytes], { type: header.mime }));
  let canvas;
  try {
    dimensions(decoded.width, decoded.height);
    // EXIF can exchange axes; neither orientation can exceed the inspected bounds.
    if (!((decoded.width === header.width && decoded.height === header.height) || (decoded.width === header.height && decoded.height === header.width))) throw invalid('Decoded dimensions do not match the image header.');
    const { width, height } = fitWithin(decoded.width, decoded.height, LIMITS.normalizedSide, LIMITS.normalizedPixels);
    canvas = canvasOf(width, height); const context = canvas.getContext('2d');
    if (!context) throw invalid('Canvas image processing is unavailable in this browser.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, width, height);
    // Only the pixels survive. No EXIF, ICC, filenames, or original bytes are returned.
    return Object.freeze({ width, height, canvas, dispose() { releaseCanvas(canvas); } });
  } catch (error) { releaseCanvas(canvas); throw error; }
  finally { decoded.release(); }
}

function canvasClip(context, geometry) {
  const { width: w, height: h } = geometry;
  context.beginPath();
  if (geometry.kind === 'ring') {
    context.arc(w / 2, h / 2, geometry.outerRadius, 0, Math.PI * 2);
    context.moveTo(w / 2 + geometry.innerRadius, h / 2);
    context.arc(w / 2, h / 2, geometry.innerRadius, 0, Math.PI * 2);
    context.clip('evenodd');
  } else {
    const { rx, ry } = geometry;
    if (!rx || !ry) context.rect(0, 0, w, h);
    else {
      context.moveTo(rx, 0); context.lineTo(w - rx, 0);
      context.ellipse(w - rx, ry, rx, ry, 0, -Math.PI / 2, 0);
      context.lineTo(w, h - ry); context.ellipse(w - rx, h - ry, rx, ry, 0, 0, Math.PI / 2);
      context.lineTo(rx, h); context.ellipse(rx, h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
      context.lineTo(0, ry); context.ellipse(rx, ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
      context.closePath();
    }
    context.clip();
  }
}
function cropData(background, geometry, options) {
  const size = fitWithin(geometry.width, geometry.height, LIMITS.cropSide, LIMITS.cropPixels);
  const canvas = canvasOf(size.width, size.height);
  try {
    const context = canvas.getContext('2d'); if (!context) throw invalid('Canvas image processing is unavailable.');
    const crop = coverCrop(background.width, background.height, geometry.width, geometry.height, options);
    context.scale(size.width / geometry.width, size.height / geometry.height);
    canvasClip(context, geometry); // Do not even embed hidden corner/center pixels.
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(background.canvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, geometry.width, geometry.height);
    if (options.tintOpacity > 0) {
      context.fillStyle = options.tint; context.globalAlpha = options.tintOpacity;
      context.fillRect(0, 0, geometry.width, geometry.height);
    }
    const data = canvas.toDataURL('image/png');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) throw invalid('The cropped background could not be encoded.');
    return data;
  } finally { releaseCanvas(canvas); }
}
function node(doc, tag, attributes = {}) {
  const element = doc.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}
function annulusPath(geometry) {
  const { x, y, width, height, outerRadius: r, innerRadius: inner } = geometry;
  const cx = x + width / 2; const cy = y + height / 2;
  const circle = radius => `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy} Z`;
  return circle(r) + ' ' + circle(inner);
}

/** Synchronous trusted-renderer SVG composition; pass pristine renderer output. */
export function applyBackground(svgText, background, controls = {}) {
  if (!background) return svgText; // Byte-identical default, including formatting.
  const options = settings(controls);
  if (!background.canvas || background.canvas.width !== background.width || background.canvas.height !== background.height) throw invalid('The background has been disposed or is invalid.');
  dimensions(background.width, background.height, LIMITS.normalizedSide, LIMITS.normalizedPixels);
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (root?.localName !== 'svg' || doc.querySelector('parsererror')) throw invalid('Invalid renderer SVG.');
  const ring = root.getAttribute('data-layout') === 'avatar' ? root.querySelector('circle[data-field="ring"]') : null;
  const base = ring || [...root.children].find(child => child.localName === 'rect');
  if (!base || (root.getAttribute('data-layout') === 'avatar' && !ring)) throw invalid('The renderer SVG has no supported background.');
  const geometry = backgroundGeometry(ring ? 'ring' : 'rect', Object.fromEntries([...base.attributes].map(attr => [attr.name, attr.value])));
  const data = cropData(background, geometry, options);
  const ids = new Set([...root.querySelectorAll('[id]')].map(element => element.getAttribute('id')));
  let id = 'local-background-clip'; let suffix = 0; while (ids.has(id)) id = `local-background-clip-${++suffix}`;
  const defs = node(doc, 'defs', { 'data-local-background': 'true' });
  const clip = node(doc, 'clipPath', { id, clipPathUnits: 'userSpaceOnUse', 'data-local-background': 'true' });
  if (ring) clip.appendChild(node(doc, 'path', { d: annulusPath(geometry), 'clip-rule': 'evenodd' }));
  else clip.appendChild(node(doc, 'rect', { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, rx: geometry.rx, ry: geometry.ry }));
  defs.appendChild(clip); root.insertBefore(defs, root.firstChild);
  root.setAttribute('data-local-background', 'true');
  const image = node(doc, 'image', { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, preserveAspectRatio: 'none', 'clip-path': `url(#${id})`, href: data, 'data-local-background': 'true', 'data-local-background-image': 'true' });
  base.parentNode.insertBefore(image, base.nextSibling);
  // Keep the existing solid fill/ring below transparent image pixels. Classic's
  // inset border must also paint above the image, without adding any corner fill.
  if (!ring && base.hasAttribute('stroke') && base.getAttribute('stroke') !== 'none') {
    const border = base.cloneNode(false); border.removeAttribute('id'); border.setAttribute('fill', 'none'); border.setAttribute('data-local-background', 'true');
    image.parentNode.insertBefore(border, image.nextSibling);
  }
  return new XMLSerializer().serializeToString(root);
}
