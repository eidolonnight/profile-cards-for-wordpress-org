// Offline branding acceptance: actual /card handler, strict CSP and real raster.
// EVIDENCE_DIR=/outside/repo PLAYWRIGHT_MODULE=/.../index.mjs node tests/event-themes-browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GET } from '../functions/card.js';
import { EVENTS, ROLES } from '../shared/events.js';
import { EVENT_FONTS, EVENT_FONT_STYLE_HASH } from '../shared/event-fonts.js';
import { queryOptions } from '../shared/options.js';
import { renderSocial } from '../shared/social.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('External EVIDENCE_DIR required');
await mkdir(evidence, { recursive: true });
const realFetch = globalThis.fetch;
const upstream = [];
globalThis.fetch = async url => {
  upstream.push(String(url));
  if (!/^https:\/\/profiles\.wordpress\.org\/branding-fixture\/$/.test(String(url))) throw new Error('Unwanted upstream request: ' + url);
  return new Response('<header class="site-header"><h2>Ada Example</h2></header>', { headers: { 'Content-Type': 'text/html' } });
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4215');
    if (url.pathname === '/card') {
      const response = await GET(new Request(url));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
    }
    if (url.pathname === '/') { res.end('<!doctype html><title>Offline branding test</title>'); return; }
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const modules = new Set(['social','events','options','fonts','svg','event-themes','event-fonts']);
    const match = url.pathname.match(/^\/shared\/(.+)\.js$/);
    if (match && modules.has(match[1])) { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL(`../shared/${match[1]}.js`, import.meta.url))); return; }
    if (url.pathname === '/background.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('../public/background.js', import.meta.url))); return; }
    res.writeHead(404).end();
  } catch (e) { res.writeHead(500).end(e.message); }
});
await new Promise(resolve => server.listen(4215, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:4215';
// Names independently read from the pinned binaries, not inferred from CSS.
const postScriptNames = {
  'faculty-glyphic-400': 'FacultyGlyphic-Regular',
  'kumbh-sans-400': 'KumbhSans-Regular', 'kumbh-sans-500': 'KumbhSans-Medium',
  'cardo-400': 'Cardo-Regular', 'cardo-700': 'Cardo-Bold',
  'inter-400': 'Inter', 'inter-600': 'Inter',
  'open-sans-300': 'OpenSans-Light', 'open-sans-400': 'OpenSans-Regular',
  'open-sans-600': 'OpenSans-SemiBold'
};
const fontMatches = (fonts, face) => fonts.length > 0 && fonts.every(font => font.isCustomFont && font.postScriptName === postScriptNames[face] && font.glyphCount > 0);
const report = { cases: [], pageErrors: [], consoleErrors: [], externalRequests: [] };
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  page.on('pageerror', e => report.pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== origin) { report.externalRequests.push(url); return route.abort(); }
    return route.continue();
  });
  for (const event of EVENTS) for (const layout of ['avatar','announcement']) for (const role of ROLES) {
    const params = new URLSearchParams({ username: 'branding-fixture', layout, event: event.id, role: role.id, avatar: 'true' });
    const url = origin + '/card?' + params;
    const response = await page.goto(url);
    assert.equal(response.status(), 200);
    const source = await response.text();
    const csp = response.headers()['content-security-policy'];
    assert.ok(csp.includes(`style-src '${EVENT_FONT_STYLE_HASH[event.id]}'`));
    const key = event.id + '-' + layout + '-' + role.id;
    const loaded = await page.evaluate(async fonts => {
      await document.fonts.ready;
      const records = [];
      for (const f of fonts) {
        const found = await document.fonts.load(`${f.weight} 48px "${f.alias}"`, 'WordCamp');
        records.push({ family: f.family, weight: f.weight, count: found.length, status: found.map(x => x.status) });
      }
      const dimensions = [...document.querySelectorAll('text')].map(t => ({ field: t.closest('[data-field]').getAttribute('data-field'), text: t.textContent, face: t.getAttribute('data-face'), family: getComputedStyle(t).fontFamily, weight: +getComputedStyle(t).fontWeight, width: t.getComputedTextLength(), limit: +t.getAttribute('data-max-width') }));
      return { records, dimensions };
    }, Object.values(EVENT_FONTS[event.id]).map(({ family, alias, weight }) => ({ family, alias, weight })));
    for (const font of loaded.records) { assert.ok(font.count > 0); assert.ok(font.status.every(s => s === 'loaded')); }
    for (const t of loaded.dimensions) assert.ok(t.width <= t.limit + 1, `real glyph width ${key}/${t.text}: ${t.width} > ${t.limit}`);
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'svg text' });
    assert.equal(nodeIds.length, loaded.dimensions.length);
    const eventFonts = EVENT_FONTS[event.id];
    const fields = { avatar: eventFonts.display, event: eventFonts.display, name: eventFonts.display, handle: eventFonts.body, eventDetails: eventFonts.body, role: layout === 'avatar' && event.id === 'asia-2027' ? eventFonts.display : eventFonts.emphasis };
    for (let i = 0; i < nodeIds.length; i++) {
      const text = loaded.dimensions[i]; const expected = fields[text.field];
      assert.ok(expected, `${key}: unreviewed text field ${text.field}`);
      assert.equal(text.face, expected.key); assert.equal(text.weight, expected.weight);
      assert.ok(text.family.startsWith(`"${expected.alias}"`), `${key}/${text.field}: wrong computed family`);
      text.renderedFonts = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId: nodeIds[i] })).fonts;
      assert.ok(fontMatches(text.renderedFonts, expected.key), `${key}/${text.field}: actual rendered font does not match the embedded event binary`);
    }
    const expectedFields = layout === 'avatar' ? ['avatar', 'event', 'role'] : ['avatar', 'event', 'handle', 'name', 'role', ...(event.dateLabel || event.location ? ['eventDetails'] : [])];
    assert.deepEqual([...new Set(loaded.dimensions.map(t => t.field))].sort(), expectedFields.sort());
    // Prove the check detects real fallback, not only matching declarations.
    const negativeIndex = nodeIds.length - 1;
    const savedFamily = await page.locator('svg text').nth(negativeIndex).getAttribute('font-family');
    await page.locator('svg text').nth(negativeIndex).evaluate(async n => {
      n.setAttribute('font-family', 'monospace'); n.getComputedTextLength();
      // CDP reports fonts from painted glyphs, not pending presentation attrs.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const negativeFonts = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId: nodeIds[negativeIndex] })).fonts;
    assert.equal(fontMatches(negativeFonts, loaded.dimensions[negativeIndex].face), false, 'font guard must reject deliberate system fallback');
    await page.locator('svg text').nth(negativeIndex).evaluate(async (n, value) => {
      n.setAttribute('font-family', value); n.getComputedTextLength();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, savedFamily);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(fontMatches((await cdp.send('CSS.getPlatformFontsForNode', { nodeId: nodeIds[negativeIndex] })).fonts, loaded.dimensions[negativeIndex].face));
    await page.screenshot({ path: `${evidence}/${key}-csp.png`, omitBackground: true });
    // Canonical module comparison uses the parsed profile fixture, no real users.
    await page.goto(origin);
    const result = await page.evaluate(async ({ source, event, layout, role }) => {
      const { renderSocial } = await import('/shared/social.js');
      const { queryOptions } = await import('/shared/options.js');
      const { applyBackground } = await import('/background.js');
      const options = queryOptions(new Request(location.origin + '/card?' + new URLSearchParams({ username: 'branding-fixture', layout, event, role, avatar: 'true' })));
      const canonical = renderSocial({ name: 'Ada Example', userName: 'branding-fixture' }, options);
      const raster = async svg => {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        try {
          const image = new Image(); image.src = url; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = layout === 'avatar' ? 1080 : 1350;
          const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0);
          const pixel = (x,y) => [...c.getImageData(x,y,1,1).data];
          return { png: canvas.toDataURL('image/png'), center: pixel(540,540), corner: pixel(0,0), topGround: pixel(540,80) };
        } finally { URL.revokeObjectURL(url); }
      };
      const bgCanvas = document.createElement('canvas'); bgCanvas.width = bgCanvas.height = 32;
      const c = bgCanvas.getContext('2d'); c.fillStyle = '#F200E4'; c.fillRect(0,0,32,32);
      const hiddenSource = renderSocial({ name: 'Ada Example', userName: 'branding-fixture' }, { ...options, avatar: false });
      const custom = applyBackground(source, { width: 32, height: 32, canvas: bgCanvas });
      const hiddenCustom = applyBackground(hiddenSource, { width: 32, height: 32, canvas: bgCanvas });
      const changed = new DOMParser().parseFromString(custom, 'image/svg+xml');
      const local = changed.querySelector('[data-local-background-image]');
      const d = new DOMParser().parseFromString(source, 'image/svg+xml');
      // Exercise every text node as an SVG image, the same raster path as PNG
      // export. Its pixels must differ when ONLY its event font is removed.
      const exportFonts = [];
      for (let i = 0; i < d.querySelectorAll('text').length; i++) {
        const isolated = d.cloneNode(true); const nodes = [...isolated.querySelectorAll('text')];
        nodes.forEach((n, index) => { if (index !== i) n.remove(); });
        const node = nodes[i]; const serializer = new XMLSerializer();
        const branded = await raster(serializer.serializeToString(isolated));
        const generic = node.getAttribute('font-family').split(',').at(-1).trim();
        node.setAttribute('font-family', generic);
        const fallback = await raster(serializer.serializeToString(isolated));
        exportFonts.push({ field: node.closest('[data-field]').getAttribute('data-field'), text: node.textContent, face: node.getAttribute('data-face'), generic, pixelsDifferFromFallback: branded.png !== fallback.png });
      }
      const colors = renderSocial({ name: 'Ada Example', userName: 'branding-fixture' }, { ...options, foreground: '123456', headerColor: 'FEDCBA', nameColor: 'ABCDEF' });
      return { canonical: canonical === source, exportFonts, base: await raster(source), custom: await raster(custom), hidden: await raster(hiddenSource), hiddenCustom: await raster(hiddenCustom), customInserted: Boolean(local), fontStyleUnchanged: changed.querySelector('style').textContent === d.querySelector('style').textContent, customColors: colors.includes('#123456') && colors.includes('#FEDCBA'), fields: [...d.querySelectorAll('[data-field]')].map(n => n.getAttribute('data-field')) };
    }, { source, event: event.id, layout, role: role.id });
    assert.equal(result.exportFonts.length, loaded.dimensions.length);
    for (const font of result.exportFonts) assert.equal(font.pixelsDifferFromFallback, true, `${key}/${font.field}: PNG must use event font, not generic fallback`);
    assert.equal(result.canonical, true); assert.equal(result.customInserted, true); assert.equal(result.fontStyleUnchanged, true); assert.equal(result.customColors, true);
    if (layout === 'avatar') for (const r of [result.hidden, result.hiddenCustom]) { assert.equal(r.center[3],0); assert.equal(r.corner[3],0); }
    assert.equal(result.base.png === result.custom.png, false, 'local background remains visible');
    await writeFile(`${evidence}/${key}.svg`, source);
    for (const variant of ['base','custom','hidden','hiddenCustom']) { await writeFile(`${evidence}/${key}-${variant}.png`, Buffer.from(result[variant].png.split(',')[1], 'base64')); delete result[variant].png; }
    report.cases.push({ key, sha256: createHash('sha256').update(source).digest('hex'), bytes: source.length, csp, fallbackNegativeControlRejected: true, ...loaded, ...result });
    console.log(`PASS ${key}: ${loaded.dimensions.length} actual text fonts and PNG font checks`);
  }
  assert.equal(new Set(report.cases.map(c => c.key)).size, EVENTS.length * ROLES.length * 2); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.externalRequests, []);
  report.pass = true;
} catch (error) { report.pass = false; report.error = error.stack; process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = realFetch;
  report.upstreamFixtureRequests = upstream;
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, error: report.error, consoleErrors: report.consoleErrors, externalRequests: report.externalRequests }, null, 2));
}
