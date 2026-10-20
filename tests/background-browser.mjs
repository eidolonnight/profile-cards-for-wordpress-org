// Browser-only backgrounds: real handlers/profile data, generated local image fixtures.
// Decoder delays and delivery faults below are controlled tests, not runtime behavior.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4210';
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('Set EVIDENCE_DIR outside the hosting tree.');
await mkdir(evidence, { recursive: true });
const report = { origin, checks: [], exports: [], requests: [], pageErrors: [], accessibility: [], diagnostics: [] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = () => writeFile(evidence + '/background-browser-report.json', JSON.stringify(report, null, 2) + '\n');
const check = async text => { report.checks.push(text); await save(); console.log(text); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
context.on('page', page => {
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('request', req => { if (/^https?:/.test(req.url())) report.requests.push({ url: req.url(), method: req.method(), body: req.postData() }); });
});
await context.addInitScript(() => {
  globalThis.__storageWrites = [];
  const record = name => function () { globalThis.__storageWrites.push(name); throw new Error('Unexpected persistence: ' + name); };
  Storage.prototype.setItem = record('Storage.setItem');
  IDBFactory.prototype.open = record('IndexedDB.open');
  if (globalThis.CacheStorage) CacheStorage.prototype.open = record('CacheStorage.open');
  if (globalThis.Cache) for (const name of ['put', 'add', 'addAll']) Cache.prototype[name] = record('Cache.' + name);
  globalThis.__decodes = { active: 0, peak: 0, calls: 0, hold: false, releases: [] };
  const decode = globalThis.createImageBitmap.bind(globalThis);
  globalThis.createImageBitmap = async (...args) => {
    const s = globalThis.__decodes;
    s.calls++; s.active++; s.peak = Math.max(s.peak, s.active);
    try {
      const bitmap = await decode(...args);
      if (s.hold) await new Promise(resolve => s.releases.push(resolve));
      return bitmap;
    } finally { s.active--; }
  };
});
const ready = page => page.waitForFunction(() => {
  const image = document.getElementById('card-preview');
  return !document.getElementById('exports').disabled && !image.hidden && image.complete && image.naturalWidth > 0;
}, null, { timeout: 45000 });
const fresh = async page => { await page.goto(origin + '/'); await ready(page); await page.locator('#customize-colors summary').click(); };
const svgSource = page => page.locator('#card-preview').evaluate(image => fetch(image.src).then(r => r.text()));
const setControl = async (page, id, value) => {
  await page.locator('#background-' + id).evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await ready(page);
};
const select = async (page, fixture) => { await page.locator('#background-file').setInputFiles(fixture); await ready(page); };
const backgroundImage = page => page.evaluate(async () => {
  const svg = await fetch(document.getElementById('card-preview').src).then(r => r.text());
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const image = root.querySelector('[data-local-background-image]');
  if (!image) return null;
  const img = new Image(); img.src = image.getAttribute('href'); await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
  const sample = [0.1, 0.5, 0.9].map(x => [...ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * 0.5), 1, 1).data]);
  return { width: canvas.width, height: canvas.height, sample, data: image.getAttribute('href') };
});
const download = async (page, type, label) => {
  const pending = page.waitForEvent('download'); await page.locator('#download-' + type).click();
  const item = await pending, path = evidence + '/' + label + '.' + type;
  await item.saveAs(path); return readFile(path);
};
const verifyExport = async (page, label) => {
  const preview = await svgSource(page);
  const svg = await download(page, 'svg', label), png = await download(page, 'png', label);
  assert.equal(hash(svg), hash(preview), 'SVG download must equal the displayed SVG');
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  const pixels = await page.evaluate(async ({ svg, png }) => {
    const image = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
    const [vector, raster] = await Promise.all([image('data:image/svg+xml;base64,' + svg), image('data:image/png;base64,' + png)]);
    const extract = async input => {
      const c = document.createElement('canvas'); c.width = raster.naturalWidth; c.height = raster.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(input, 0, 0, c.width, c.height);
      const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))].map(n => n.toString(16).padStart(2, '0')).join('');
      return { digest, corner: [...rgba.slice(0, 4)], center: [...ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data] };
    };
    return { width: raster.naturalWidth, height: raster.naturalHeight, svg: await extract(vector), png: await extract(raster) };
  }, { svg: svg.toString('base64'), png: png.toString('base64') });
  assert.equal(pixels.svg.digest, pixels.png.digest, 'Actual PNG pixels must match the displayed/exported SVG at export size');
  report.exports.push({ label, svgSha256: hash(svg), pngSha256: hash(png), ...pixels }); await save();
  return { svg: svg.toString(), png, pixels };
};
// Embed real PNG metadata with a valid CRC; only the re-encoded crop may survive.
function metadataPNG(bytes, text) {
  const data = Buffer.from('Comment\0' + text), type = Buffer.from('tEXt');
  const chunk = Buffer.alloc(data.length + 12); chunk.writeUInt32BE(data.length); type.copy(chunk, 4); data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([type, data])) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return Buffer.concat([bytes.subarray(0, 33), chunk, bytes.subarray(33)]);
}
let page;
try {
  page = await context.newPage(); await fresh(page);
  const baseline = await svgSource(page);
  assert.equal(await page.locator('#copy-card, #copy-markdown, #copy-fallback, #copy-text, #page-title').count(), 0);
  const fixtureData = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 600;
    const ctx = c.getContext('2d');
    for (const [i, color] of ['#cc0000', '#00aa00', '#0000cc'].entries()) { ctx.fillStyle = color; ctx.fillRect(i * 400, 0, 400, 600); }
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, 1200, 140);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(0, 460, 1200, 140);
    const png = c.toDataURL('image/png').split(',')[1];
    const jpeg = c.toDataURL('image/jpeg', .9).split(',')[1];
    const webp = c.toDataURL('image/webp', .9).split(',')[1];
    ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = '#993366'; ctx.fillRect(400, 0, 400, 600);
    const transparent = c.toDataURL('image/png').split(',')[1];
    return { png, jpeg, webp, transparent };
  });
  const sentinel = 'LOCAL_BACKGROUND_METADATA_DO_NOT_TRANSMIT';
  const png = { name: 'private-background-marker.png', mimeType: 'image/png', buffer: metadataPNG(Buffer.from(fixtureData.png, 'base64'), sentinel) };
  const jpeg = { name: 'local-test.jpeg', mimeType: 'image/jpeg', buffer: Buffer.from(fixtureData.jpeg, 'base64') };
  const webp = { name: 'local-test.webp', mimeType: 'image/webp', buffer: Buffer.from(fixtureData.webp, 'base64') };
  await page.evaluate(() => import('/background.js' + new URL(document.querySelector('script[src^="/app.js"]').src).search)); // Warm the exact module requested by this release; module download is not image traffic.
  const before = report.requests.length;
  await select(page, png);
  assert.equal(report.requests.length, before, 'Selecting a warm local image must not make HTTP requests');
  assert.equal(await page.locator('#background-file').inputValue(), '');
  assert.equal(await page.locator('#background-controls').isVisible(), true);
  let image = await backgroundImage(page); assert.ok(image); assert.ok(image.width <= 4096 && image.height <= 4096 && image.width * image.height <= 4000000);
  assert.equal(Buffer.from(image.data.split(',')[1], 'base64').includes(Buffer.from(sentinel)), false);
  await setControl(page, 'strength', 0);
  await setControl(page, 'zoom', 3);
  await setControl(page, 'x', 0);
  const left = await backgroundImage(page);
  await setControl(page, 'x', 100);
  const right = await backgroundImage(page);
  assert.notEqual(hash(left.data), hash(right.data), 'Horizontal position must alter baked crop');
  assert.ok(left.sample[1][0] > 150 && left.sample[1][2] < 30);
  assert.ok(right.sample[1][2] > 150 && right.sample[1][0] < 30);
  await setControl(page, 'y', 0); const top = await backgroundImage(page);
  await setControl(page, 'y', 100); const bottom = await backgroundImage(page);
  assert.notEqual(hash(top.data), hash(bottom.data), 'Vertical position must alter baked crop');
  await setControl(page, 'tint', '#ffffff'); await setControl(page, 'strength', 100);
  const tinted = await verifyExport(page, 'full-tint-profile');
  assert.deepEqual(tinted.pixels.png.corner, [255, 255, 255, 255]);
  await setControl(page, 'strength', 35); await setControl(page, 'x', 50); await setControl(page, 'y', 50); await setControl(page, 'zoom', 1);
  assert.equal(report.requests.length, before, 'Crop/tint/export must not send HTTP requests');
  await check('PNG is processed only in browser memory; real metadata removed; position/zoom crop baked locally; full tint and matching PNG/SVG export verified');

  for (const layout of ['profile', 'square', 'classic', 'avatar', 'announcement']) {
    await page.locator('#layout').selectOption(layout); await ready(page);
    if (layout === 'avatar') { await page.locator('#avatar').uncheck(); await ready(page); }
    const result = await verifyExport(page, 'background-' + layout);
    assert.match(result.svg, /data-local-background="true"/);
    assert.doesNotMatch(result.svg, /LOCAL_BACKGROUND_METADATA_DO_NOT_TRANSMIT|private-background-marker/);
    if (layout === 'avatar') {
      assert.equal(result.pixels.png.corner[3], 0);
      assert.equal(result.pixels.png.center[3], 0, 'Ring-only background must not fill the transparent center');
    }
    if (layout === 'classic') assert.equal(result.pixels.png.corner[3], 0, 'Rounded legacy corner must remain transparent');
  }
  assert.deepEqual(new Set(report.exports.filter(x => x.label.startsWith('background-')).map(x => x.label)), new Set(['profile', 'square', 'classic', 'avatar', 'announcement'].map(x => 'background-' + x)));
  await check('All five formats export matching preview/SVG/PNG pixels; avatar ring and legacy corners preserve transparency');

  await page.locator('#layout').selectOption('profile'); await ready(page);
  for (const fixture of [jpeg, webp]) { const n = report.requests.length; await select(page, fixture); assert.ok(await backgroundImage(page)); assert.equal(report.requests.length, n); }
  await select(page, { name: 'alpha.png', mimeType: 'image/png', buffer: Buffer.from(fixtureData.transparent, 'base64') });
  await verifyExport(page, 'alpha-profile');
  await page.locator('#background-remove').click(); await ready(page);
  assert.equal(hash(await svgSource(page)), hash(baseline), 'Remove must restore byte-identical original profile SVG');
  assert.equal(await page.locator('#background-controls').isHidden(), true);
  await check('JPEG, WebP and alpha PNG accepted locally; remove restores exact canonical SVG without persisting image state');

  for (const bad of [
    { name: 'not-an-image.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') },
    { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') },
    { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
  ]) {
    const n = report.requests.length;
    await page.locator('#background-file').setInputFiles(bad);
    await page.waitForFunction(() => document.getElementById('background-status').dataset.kind === 'error');
    assert.equal(await page.locator('#exports').evaluate(el => el.disabled), true);
    assert.equal(await page.locator('#card-preview').isHidden(), true);
    assert.equal(report.requests.length, n);
    await page.locator('#background-remove').click(); await ready(page);
  }
  await check('Unsupported, spoofed and oversized files fail closed without requests or stale exports, with working removal recovery');

  // Hold a real decoded bitmap; newer selections queue rather than decoding concurrently.
  await page.evaluate(() => { __decodes.hold = true; __decodes.peak = 0; });
  await page.locator('#background-file').setInputFiles(png);
  await page.waitForFunction(() => __decodes.releases.length === 1);
  const calls = await page.evaluate(() => __decodes.calls);
  await page.locator('#background-file').setInputFiles(jpeg);
  await page.locator('#background-file').setInputFiles(webp);
  assert.equal(await page.evaluate(() => __decodes.calls), calls);
  assert.equal(await page.locator('#exports').evaluate(el => el.disabled), true);
  await page.evaluate(() => { __decodes.hold = false; for (const release of __decodes.releases.splice(0)) release(); });
  await ready(page);
  assert.equal(await page.evaluate(() => __decodes.calls), calls + 1);
  assert.equal(await page.evaluate(() => __decodes.peak), 1);
  const newest = hash(await svgSource(page));
  await select(page, webp); assert.equal(hash(await svgSource(page)), newest);
  await page.evaluate(() => { __decodes.hold = true; });
  await page.locator('#background-file').setInputFiles(png);
  await page.waitForFunction(() => __decodes.releases.length === 1);
  await page.locator('#background-remove').click(); await ready(page);
  await page.evaluate(() => { __decodes.hold = false; for (const release of __decodes.releases.splice(0)) release(); });
  await page.waitForFunction(() => __decodes.active === 0);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await backgroundImage(page), null);
  assert.equal(hash(await svgSource(page)), hash(baseline));
  await check('Controlled decoding races prove one active decode plus latest queued selection; stale completion after remove is discarded');

  // A timed-out native decoder can still be alive. Do not start another.
  await page.evaluate(() => { __decodes.hold = true; __decodes.peak = 0; });
  await page.locator('#background-file').setInputFiles(png);
  await page.waitForFunction(() => __decodes.releases.length === 1);
  const timedOutCalls = await page.evaluate(() => __decodes.calls);
  await page.waitForFunction(() => document.getElementById('background-status').dataset.kind === 'error', null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => __decodes.active), 1);
  assert.equal(await page.locator('#exports').evaluate(el => el.disabled), true);
  await page.locator('#background-file').setInputFiles(jpeg);
  await page.waitForFunction(() => document.getElementById('background-status').dataset.kind === 'error');
  assert.equal(await page.evaluate(() => __decodes.calls), timedOutCalls, 'A timeout must not free the actual native-decoder slot');
  assert.equal(await page.evaluate(() => __decodes.peak), 1);
  await page.locator('#background-remove').click(); await ready(page);
  await page.evaluate(() => { __decodes.hold = false; for (const release of __decodes.releases.splice(0)) release(); });
  await page.waitForFunction(() => __decodes.active === 0);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await backgroundImage(page), null);
  await select(page, png);
  assert.ok(await backgroundImage(page));
  await check('Actual 10-second decoder timeout remains fail-closed; another selection cannot overlap the unsettled decoder; late settlement permits recovery');

  // Hold PNG encoding to prove changes prevent delivery of the old export.
  await select(page, png);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    globalThis.__restoreToBlob = () => { HTMLCanvasElement.prototype.toBlob = original; };
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) { return original.call(this, blob => { globalThis.__releasePNG = () => callback(blob); }, ...args); };
  });
  let staleDownloads = 0; const staleListener = () => staleDownloads++; page.on('download', staleListener);
  await page.locator('#download-png').click(); await page.waitForFunction(() => typeof __releasePNG === 'function');
  await setControl(page, 'strength', 70);
  await page.evaluate(() => { __restoreToBlob(); __releasePNG(); });
  await page.waitForFunction(() => !document.getElementById('download-png').disabled);
  page.off('download', staleListener); assert.equal(staleDownloads, 0);
  await verifyExport(page, 'current-after-stale-png');
  await check('A controlled in-flight PNG export is rejected after background change; current export succeeds');

  await page.locator('#background-x').focus();
  const oldPosition = Number(await page.locator('#background-x').inputValue());
  await page.keyboard.press('ArrowRight'); await ready(page);
  assert.equal(Number(await page.locator('#background-x').inputValue()), oldPosition + 1);
  assert.equal(await page.locator('#background-x-value').textContent(), (oldPosition + 1) + '%');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, inputs: [...document.querySelectorAll('#background-controls input')].map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })) }));
    assert.ok(geometry.scroll <= geometry.viewport, JSON.stringify(geometry));
    assert.ok(geometry.inputs.every(x => x.width >= 44 && x.height >= 44));
    await page.screenshot({ path: evidence + '/background-' + width + '.png', fullPage: true });
    if (process.env.AXE_PATH) {
      await page.addScriptTag({ path: process.env.AXE_PATH });
      const issues = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })));
      report.accessibility.push({ width, issues }); assert.deepEqual(issues, []);
    }
  }
  await check('Keyboard sliders, desktop/390px/320px geometry, touch targets and configured axe audits verified');
  assert.deepEqual(await page.evaluate(() => __storageWrites), []);
  const cleanURL = page.url(); await page.reload(); await ready(page);
  assert.equal(page.url(), cleanURL); assert.equal(await backgroundImage(page), null);
  assert.equal(await page.locator('#background-controls').isHidden(), true);
  assert.equal(await page.locator('#background-file').inputValue(), '');
  assert.deepEqual(await page.evaluate(() => ({ writes: __storageWrites, local: localStorage.length, session: sessionStorage.length })), { writes: [], local: 0, session: 0 });
  await check('Reload clears the custom image; no browser storage writes or image/query state persisted');

  // Preserve server fallback without forwarding any custom image to it.
  const fallback = await context.newPage();
  await fallback.route('**/preview/preview.js*', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Missing optional module (test)' }));
  await fresh(fallback); await select(fallback, png); assert.ok(await backgroundImage(fallback));
  await verifyExport(fallback, 'fallback-local-background');
  assert.deepEqual(await fallback.evaluate(() => __storageWrites), []); await fallback.close();
  const broken = await context.newPage();
  await broken.route('**/background.js*', route => route.fulfill({ status: 403, contentType: 'text/plain', body: 'Controlled module denial' }));
  await fresh(broken); await broken.locator('#background-file').setInputFiles(png);
  await broken.waitForFunction(() => document.getElementById('background-status').dataset.kind === 'error');
  assert.equal(await broken.locator('#exports').evaluate(el => el.disabled), true);
  await broken.locator('#background-remove').click(); await ready(broken); await broken.close();
  await check('Server rendering fallback still composites locally; failed background-module delivery blocks exports and supports removal');
  assert.equal(report.pageErrors.length, 0);
  assert.ok(report.requests.every(r => ['GET', 'HEAD'].includes(r.method) && new URL(r.url).origin === new URL(origin).origin && !r.body));
  assert.ok(report.requests.filter(r => r.method === 'HEAD').every(r => new URL(r.url).pathname === '/preview/preview.js'), 'Only the existing missing-renderer probe may use HEAD');
  for (const r of report.requests) assert.doesNotMatch(r.url, /private-background-marker|LOCAL_BACKGROUND_METADATA|data%3Aimage|data:image|background-(?:x|y|zoom|strength|tint)/);
  report.pass = true;
} catch (error) {
  report.pass = false; report.failure = error.message; report.stack = error.stack;
  if (page && !page.isClosed()) report.diagnostics.push(await page.evaluate(() => ({ status: document.getElementById('status')?.textContent, background: document.getElementById('background-status')?.textContent, exportsDisabled: document.getElementById('exports')?.disabled })).catch(() => ({})));
  throw error;
} finally { await save(); await browser.close(); }
