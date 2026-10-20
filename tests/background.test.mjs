import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { renderCard } from '../shared/svg.js';
import { renderSocial } from '../shared/social.js';
import { LIMITS, inspectImage, fitWithin, coverCrop, backgroundGeometry, loadBackground, applyBackground } from '../public/background.js';

const concat = (...parts) => Uint8Array.from(parts.flatMap(p => [...p]));
const be32 = n => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const le32 = n => be32(n).reverse();
const ascii = s => [...s].map(c => c.charCodeAt(0));
function crc(bytes) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function chunk(name, bytes = []) { const data = concat(ascii(name), bytes); return concat(be32(bytes.length), data, be32(crc(data))); }
function png(w = 40, h = 30, extras = []) { return concat([137,80,78,71,13,10,26,10], chunk('IHDR', [...be32(w), ...be32(h), 8, 6, 0, 0, 0]), ...extras, chunk('IDAT', [1]), chunk('IEND')); }
function jpeg(w = 40, h = 30) { return concat([255,216,255,192,0,11,8,h >> 8,h & 255,w >> 8,w & 255,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]); }
function webp(w = 40, h = 30, animated = false) {
  const bits = ((w - 1) | ((h - 1) << 14)) >>> 0;
  const lossless = concat(ascii('VP8L'), le32(5), [47], le32(bits), [0]);
  const ext = animated ? concat(ascii('VP8X'), le32(10), [2,0,0,0,(w-1)&255,(w-1)>>8,0,(h-1)&255,(h-1)>>8,0]) : [];
  const body = concat(ascii('WEBP'), ext, lossless);
  return concat(ascii('RIFF'), le32(body.length), body);
}
const file = bytes => new Blob([bytes], { type: 'image/svg+xml' }); // MIME is deliberately untrusted.
const profile = { userName: 'fixture', name: 'Ada Example', badges: [], teams: [], profileUrl: 'https://profiles.wordpress.org/fixture/' };

// Synthetic structures exercise bounded header parsing, not real image decoding.
test('signature detection accepts only supported static raster headers', () => {
  for (const [bytes, mime] of [[png(), 'image/png'], [jpeg(), 'image/jpeg'], [webp(), 'image/webp']]) {
    assert.deepEqual(inspectImage(bytes), { width: 40, height: 30, mime });
  }
  for (const bytes of [new Uint8Array(), new TextEncoder().encode('<svg/>'), new TextEncoder().encode('GIF89a'), [255,216]]) assert.throws(() => inspectImage(Uint8Array.from(bytes)));
});
test('dimensions and total input size are rejected before decoding', () => {
  for (const bytes of [png(8193, 1), png(8192, 4096), png(0, 20), jpeg(9000, 20), webp(9000, 20), new Uint8Array(LIMITS.maxInputBytes + 1)]) assert.throws(() => inspectImage(bytes));
  assert.equal(inspectImage(png(8192, 3906)).width, 8192);
});
test('APNG, animated WebP, truncation, checksum errors and trailers fail closed', () => {
  assert.throws(() => inspectImage(png(40, 30, [chunk('acTL', [...be32(2), ...be32(0)])])), /animat/i);
  assert.throws(() => inspectImage(webp(40, 30, true)), /animat/i);
  for (const bytes of [png(), jpeg(), webp()]) {
    assert.throws(() => inspectImage(bytes.slice(0, -1)));
    assert.throws(() => inspectImage(concat(bytes, [1])));
  }
  const broken = png(); broken[29] ^= 1; assert.throws(() => inspectImage(broken));
});
test('normalization and crop geometry obey area, side and cover limits', () => {
  assert.deepEqual(fitWithin(8192, 100, 2048, 4000000), { width: 2048, height: 25 });
  assert.deepEqual(fitWithin(2048, 2048, 2048, 4000000), { width: 2000, height: 2000 });
  for (const [w,h] of [[1, 100000], [100000, 1], [9000, 9000], [720, 10000]]) {
    const out = fitWithin(w, h, 4096, 4000000);
    assert.ok(out.width <= 4096 && out.height <= 4096 && out.width * out.height <= 4000000);
  }
  assert.deepEqual(coverCrop(800, 400, 200, 200, { x: 100, y: 0, zoom: 2 }), { sx: 600, sy: 0, sw: 200, sh: 200 });
  assert.deepEqual(coverCrop(800, 400, 200, 200, {}), { sx: 200, sy: 0, sw: 400, sh: 400 });
  assert.throws(() => coverCrop(800, 400, 0, 200, {}));
  assert.throws(() => coverCrop(800, 400, 200, 200, { zoom: Infinity }));
  assert.throws(() => coverCrop(800, 400, 200, 200, { x: -1 }));
});
test('geometry retains classic inset/rounding and annular rather than full-circle bounds', () => {
  assert.deepEqual(backgroundGeometry('rect', { x: .5, y: .5, width: 719, height: 199, rx: 12 }), { kind: 'rect', x: .5, y: .5, width: 719, height: 199, rx: 12, ry: 12 });
  assert.deepEqual(backgroundGeometry('ring', { cx: 540, cy: 540, r: 463, 'stroke-width': 126 }), { kind: 'ring', x: 14, y: 14, width: 1052, height: 1052, innerRadius: 400, outerRadius: 526 });
  assert.throws(() => backgroundGeometry('ring', { r: 5, 'stroke-width': 20 }));
});
test('no background preserves every original byte without requiring browser globals', () => {
  const text = '  <svg>\n<!-- untouched -->\n</svg>  ';
  assert.equal(applyBackground(text, null, { tint: 'bad' }), text);
});

function setGlobal(t, name, value) {
  const old = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => { if (old) Object.defineProperty(globalThis, name, old); else delete globalThis[name]; });
}
function browser(t, decoder = async () => ({ width: 40, height: 30, close() {} })) {
  const canvases = [];
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => realTimeout(fn, Math.min(ms, 50), ...args));
  setGlobal(t, 'createImageBitmap', decoder);
  setGlobal(t, 'DOMParser', DOMParser);
  setGlobal(t, 'XMLSerializer', class { serializeToString(node) { return node.toString(); } });
  setGlobal(t, 'document', { createElement(name) {
    assert.equal(name, 'canvas');
    const calls = [];
    const ctx = new Proxy({}, { get(target, key) { return target[key] ?? ((...args) => calls.push([key, ...args])); }, set(target, key, value) { target[key] = value; calls.push([key, value]); return true; } });
    const canvas = { width: 0, height: 0, calls, getContext: () => ctx, toDataURL(type) { assert.equal(type, 'image/png'); calls.push(['encode', this.width, this.height]); return 'data:image/png;base64,Y3JvcA=='; } };
    canvases.push(canvas); return canvas;
  } });
  return canvases;
}
const realTimeout = globalThis.setTimeout;

test('ingestion ignores file MIME, normalizes, closes the bitmap, and disposes idempotently', async t => {
  let closed = 0; let decodeOptions;
  const canvases = browser(t, async (blob, options) => { assert.equal(blob.type, 'image/png'); decodeOptions = options; return { width: 40, height: 30, close() { closed++; } }; });
  const bg = await loadBackground(file(png()));
  assert.deepEqual(decodeOptions, { imageOrientation: 'from-image' });
  assert.equal(bg.width, 40); assert.equal(bg.height, 30); assert.equal(closed, 1);
  assert.equal(bg.canvas, canvases[0]); assert.equal(bg.canvas.calls.filter(c => c[0] === 'drawImage').length, 1);
  bg.dispose(); bg.dispose(); assert.equal(bg.canvas.width, 0); assert.equal(bg.canvas.height, 0);
  assert.throws(() => applyBackground(renderCard(profile), bg));
});
test('oversized files and dimensions never reach the browser decoder', async t => {
  let count = 0; browser(t, async () => { count++; throw new Error('must not decode'); });
  await assert.rejects(loadBackground({ size: LIMITS.maxInputBytes + 1, arrayBuffer() { throw new Error('must not read'); } }));
  await assert.rejects(loadBackground(file(png(8193, 2))));
  assert.equal(count, 0);
});
test('late bitmap resolution after timeout is closed rather than retained', async t => {
  let closed = 0; let resolve;
  browser(t, () => new Promise(r => { resolve = r; }));
  await assert.rejects(loadBackground(file(png())), /timed out/i);
  resolve({ width: 40, height: 30, close() { closed++; } });
  await new Promise(r => realTimeout(r, 0)); assert.equal(closed, 1);
});
for (const settlement of ['fulfillment', 'rejection']) {
  test(`native timeout keeps decoding gated until actual ${settlement}`, async t => {
    let attempts = 0; let lateClosed = 0; let closed = 0; let resolve; let reject; let started;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    const decoding = new Promise(yes => { started = yes; });
    const lateBitmap = { width: 40, height: 30, close() { lateClosed++; } };
    const { created, images, canvases } = fallbackBrowser(t, 'success', () => {
      attempts++;
      if (attempts === 1) { started(); return pending; }
      return Promise.resolve({ width: 40, height: 30, close() { closed++; } });
    });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    // Always settle the native operation, even if a regression assertion fails.
    t.after(async () => { resolve(lateBitmap); await new Promise(r => realTimeout(r, 0)); });
    const first = assert.rejects(loadBackground(file(png())), /timed out/i);
    await decoding;
    t.mock.timers.tick(LIMITS.timeoutMs);
    await first;
    assert.equal(lateClosed, 0);
    await assert.rejects(loadBackground(file(png())), /still.*decod.*wait.*reload/i);
    assert.equal(attempts, 1);
    assert.equal(created.length, 0); assert.equal(images.length, 0); assert.equal(canvases.length, 0);
    if (settlement === 'fulfillment') resolve(lateBitmap);
    else reject(new Error('late decode failure'));
    await new Promise(r => realTimeout(r, 0));
    assert.equal(lateClosed, settlement === 'fulfillment' ? 1 : 0);
    assert.equal(created.length, 0); assert.equal(images.length, 0);
    const bg = await loadBackground(file(png()));
    assert.equal(attempts, 2); assert.equal(closed, 1); assert.equal(canvases.length, 1);
    assert.equal(bg.width, 40); assert.equal(bg.height, 30);
    assert.equal(created.length, 0); assert.equal(images.length, 0);
    bg.dispose();
  });
}
test('corrupt decoder output is closed without allocating normalization canvas', async t => {
  let closed = 0; const canvases = browser(t, async () => ({ width: 99999, height: 1, close() { closed++; } }));
  await assert.rejects(loadBackground(file(png()))); assert.equal(closed, 1); assert.equal(canvases.length, 0);
});
for (const layout of ['classic', 'profile', 'square', 'announcement', 'avatar']) {
  test(`${layout}: trusted SVG compositing retains content and encodes only a freshly cropped raster`, async t => {
    const canvases = browser(t);
    const bg = await loadBackground(file(png()));
    const source = ['avatar', 'announcement'].includes(layout) ? renderSocial(profile, { layout, avatar: false }) : renderCard(profile, { layout });
    const svg = applyBackground(source, bg, { x: 100, y: 0, zoom: 2, tint: '#123ABC', tintOpacity: .4 });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const image = doc.querySelector('image[data-local-background]'); assert.ok(image);
    assert.equal(doc.documentElement.getAttribute('data-local-background'), 'true');
    assert.equal(image.getAttribute('data-local-background-image'), 'true');
    assert.equal(image.getAttribute('href'), 'data:image/png;base64,Y3JvcA==');
    const original = new DOMParser().parseFromString(source, 'image/svg+xml');
    assert.equal(doc.querySelector('title').textContent, original.querySelector('title').textContent);
    assert.equal(doc.querySelectorAll('text').length, original.querySelectorAll('text').length);
    assert.equal(doc.querySelector('style')?.textContent, original.querySelector('style')?.textContent);
    assert.equal(canvases.length, 2); const crop = canvases[1];
    const draw = crop.calls.find(c => c[0] === 'drawImage'); assert.equal(draw[1], bg.canvas); assert.equal(draw.length, 10);
    assert.ok(draw[4] < bg.width && draw[5] < bg.height);
    assert.ok(crop.calls.some(c => c[0] === 'fillStyle' && c[1] === '#123ABC'));
    assert.ok(crop.calls.some(c => c[0] === 'globalAlpha' && c[1] === .4));
    const encoded = crop.calls.find(c => c[0] === 'encode'); assert.ok(encoded[1] <= 4096 && encoded[2] <= 4096 && encoded[1] * encoded[2] <= 4000000);
    assert.equal(crop.width, 0); assert.equal(crop.height, 0); // scratch raster released
    if (layout === 'classic') {
      assert.equal(image.getAttribute('x'), '0.5'); assert.equal(image.getAttribute('width'), '719');
      assert.ok(doc.querySelector('clipPath[data-local-background] rect[rx="12"]'));
      assert.ok(doc.querySelector('rect[data-local-background][fill="none"]'));
    }
    if (layout === 'avatar') {
      const ring = doc.querySelector('[data-field="ring"]'); assert.equal(image.previousElementSibling, ring);
      assert.equal(image.getAttribute('x'), '14'); assert.equal(image.getAttribute('width'), '1052');
      assert.ok(doc.querySelector('clipPath[data-local-background] path[clip-rule="evenodd"]'));
      assert.ok(crop.calls.some(c => c[0] === 'clip' && c[1] === 'evenodd'));
      assert.equal(doc.querySelector('[data-field="avatar"]'), null);
    }
    bg.dispose();
  });
}
test('bad tint and controls fail before crop allocation', async t => {
  const canvases = browser(t); const bg = await loadBackground(file(png()));
  for (const settings of [{ tint: 'url(https://example.org)' }, { tintOpacity: 2 }, { zoom: 0 }, { x: NaN }]) assert.throws(() => applyBackground(renderCard(profile), bg, settings));
  assert.equal(canvases.length, 1); bg.dispose();
});

function fallbackBrowser(t, mode, decoder = undefined) {
  const canvases = browser(t, decoder);
  if (!decoder) setGlobal(t, 'createImageBitmap', undefined);
  const created = []; const revoked = []; const images = [];
  t.mock.method(URL, 'createObjectURL', blob => { assert.ok(blob instanceof Blob); const url = `blob:local-${created.length}`; created.push(url); return url; });
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  setGlobal(t, 'Image', class {
    constructor() { images.push(this); this.naturalWidth = 40; this.naturalHeight = 30; }
    set src(value) { this.value = value; if (mode !== 'timeout') queueMicrotask(() => mode === 'success' ? this.onload?.() : this.onerror?.()); }
    removeAttribute(name) { assert.equal(name, 'src'); this.value = null; }
  });
  return { canvases, created, revoked, images };
}
for (const mode of ['success', 'error', 'timeout']) {
  test(`HTMLImageElement fallback revokes local object URLs on ${mode}`, async t => {
    const { created, revoked, images } = fallbackBrowser(t, mode);
    if (mode === 'success') { const bg = await loadBackground(file(png())); bg.dispose(); }
    else await assert.rejects(loadBackground(file(png())), mode === 'timeout' ? /timed out/i : /corrupt/i);
    assert.equal(created.length, 1); assert.deepEqual(revoked, created);
    assert.equal(images[0].value, null); assert.equal(images[0].onload, null); assert.equal(images[0].onerror, null);
  });
}
for (const failure of ['throw', 'rejection']) {
  test(`native decoder ${failure} releases its gate and falls back once per load`, async t => {
    let attempts = 0;
    const { created, revoked } = fallbackBrowser(t, 'success', () => {
      attempts++;
      const error = new Error('unsupported options');
      if (failure === 'throw') throw error;
      return Promise.reject(error);
    });
    for (let count = 1; count <= 2; count++) {
      const bg = await loadBackground(file(png()));
      assert.equal(attempts, count); assert.equal(created.length, count); assert.deepEqual(revoked, created);
      bg.dispose();
    }
  });
}
test('normalization draw failures clear the canvas and release the fallback image', async t => {
  const state = fallbackBrowser(t, 'success');
  const create = document.createElement;
  document.createElement = name => {
    const canvas = create(name); const context = canvas.getContext();
    context.drawImage = () => { throw new Error('draw failed'); }; return canvas;
  };
  await assert.rejects(loadBackground(file(png())), /draw failed/);
  assert.deepEqual(state.revoked, state.created); assert.equal(state.canvases[0].width, 0);
});
test('pixel decode corruption rejects even when structure alone is well formed', async t => {
  const { revoked, created } = fallbackBrowser(t, 'error', async () => { throw new Error('bad pixel data'); });
  await assert.rejects(loadBackground(file(png())), /corrupt/);
  assert.deepEqual(revoked, created);
});
test('orientation-swapped decoding and large input normalize within both caps', async t => {
  let closed = 0;
  browser(t, async () => ({ width: 3000, height: 6000, close() { closed++; } }));
  const bg = await loadBackground(file(png(6000, 3000)));
  assert.equal(bg.width, 1024); assert.equal(bg.height, 2048); assert.equal(closed, 1); bg.dispose();
});
test('native rejection after timeout is handled and does not create fallback URLs', async t => {
  let reject;
  const { created } = fallbackBrowser(t, 'success', () => new Promise((_, r) => { reject = r; }));
  await assert.rejects(loadBackground(file(png())), /timed out/i);
  reject(new Error('late decode failure')); await new Promise(r => realTimeout(r, 0)); assert.equal(created.length, 0);
});
test('bounded file reads time out without ever invoking a decoder', async t => {
  let decoded = 0; browser(t, () => { decoded++; });
  await assert.rejects(loadBackground({ size: 10, arrayBuffer: () => new Promise(() => {}) }), /timed out/i);
  assert.equal(decoded, 0);
});
test('scratch encoding failures still release crop canvas without disposing the source', async t => {
  const canvases = browser(t); const bg = await loadBackground(file(png()));
  const create = document.createElement;
  document.createElement = name => { const canvas = create(name); canvas.toDataURL = () => { throw new Error('encode failed'); }; return canvas; };
  assert.throws(() => applyBackground(renderCard(profile), bg), /encode failed/);
  assert.equal(canvases[1].width, 0); assert.equal(bg.canvas.width, 40); bg.dispose();
});
test('avatar photo markup and both original ring/text layers survive composition', async t => {
  browser(t); const bg = await loadBackground(file(png()));
  const avatar = 'data:image/png;base64,cGhvdG8=';
  const original = renderSocial(profile, { layout: 'avatar' }, avatar);
  const doc = new DOMParser().parseFromString(applyBackground(original, bg), 'image/svg+xml');
  assert.equal(doc.querySelector('[data-field="avatar"] image').getAttribute('href'), avatar);
  assert.equal(doc.querySelectorAll('[data-field="ring"]').length, 1);
  const image = doc.querySelector('[data-local-background-image]');
  assert.equal(image.previousElementSibling.getAttribute('data-field'), 'ring');
  assert.equal(image.nextElementSibling.getAttribute('stroke-width'), '2');
  assert.ok(doc.querySelector('[data-field="event"] textPath')); assert.ok(doc.querySelector('[data-field="role"] textPath')); bg.dispose();
});
test('malformed SVG and absent background geometry fail without crop allocation', async t => {
  const canvases = browser(t); const bg = await loadBackground(file(png()));
  for (const svg of ['<not-svg/>', '<svg/>', '<svg data-layout="avatar"><rect width="10" height="10"/></svg>']) assert.throws(() => applyBackground(svg, bg));
  assert.equal(canvases.length, 1); bg.dispose();
});
test('header fuzzing and all truncation offsets terminate with controlled failures', () => {
  for (const bytes of [png(), jpeg(), webp()]) for (let n = 0; n < bytes.length; n++) assert.throws(() => inspectImage(bytes.slice(0, n)));
  // Deterministic mutations are allowed to remain valid (e.g. JPEG scan bytes),
  // but must never escape with a DataView range error or hang the parser.
  for (const bytes of [png(), jpeg(), webp()]) for (let i = 0; i < bytes.length; i++) {
    const changed = bytes.slice(); changed[i] ^= 255;
    try { inspectImage(changed); } catch (error) { assert.ok(error instanceof Error); assert.ok(!(error instanceof RangeError), `offset ${i}`); }
  }
});
