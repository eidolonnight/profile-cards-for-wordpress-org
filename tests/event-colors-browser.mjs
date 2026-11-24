// Real builder event-theme acceptance: no substituted profile or renderer.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom/worker';
import { cardURLFromControls, assertDownloadedPNG, assertInitialDemo } from './ui-acceptance.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4216';
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('EVIDENCE_DIR outside hosting is required');
await mkdir(evidence, { recursive: true });
const keys = ['headerColor', 'nameColor', 'subHeaderColor', 'badgeLabelColor', 'foreground'];
const light = ['191E23', '191E23', '50575E', '23282D', 'FFFFFF'];
const dark = ['F6F7F7', 'F6F7F7', 'C3C4C7', 'F0F0F1', '191E23'];
const record = { origin, checks: [], cases: [], accessibility: [], sourceHashes: {}, errors: [], externalRequests: [], failedResponses: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
context.on('page', page => {
  page.on('pageerror', error => record.errors.push(error.message));
  page.on('request', request => { const u = new URL(request.url()); if (/^https?:$/.test(u.protocol) && u.origin !== new URL(origin).origin) record.externalRequests.push(u.href); });
  page.on('response', response => { if (response.status() >= 400) record.failedResponses.push({ url: response.url(), status: response.status() }); });
});
const page = await context.newPage();
const ready = () => page.waitForFunction(() => { const i = document.getElementById('card-preview'); return !document.getElementById('exports').disabled && !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 45000 });
const values = () => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, document.getElementById(key).value.slice(1).toUpperCase()])), keys);
const assertColors = async (colors, message) => assert.deepEqual(await values(), Object.fromEntries(keys.map(k => [k, colors[k]])), message);
const preview = async () => { await ready(); return page.locator('#card-preview').evaluate(i => fetch(i.src).then(r => r.text())); };
const download = async (button, name) => { const promise = page.waitForEvent('download'); await page.locator(button).click(); const item = await promise; await item.saveAs(`${evidence}/${name}`); return readFile(`${evidence}/${name}`); };
try {
  for (const path of ['/', '/app.js', '/styles.css', '/background.js', '/events']) {
    const r = await context.request.get(origin + path); assert.equal(r.status(), 200);
    record.sourceHashes[path] = createHash('sha256').update(await r.body()).digest('hex');
  }
  const catalog = await (await context.request.get(origin + '/events')).json();
  assert.deepEqual(catalog.events.map(e => e.id), ['asia-2027', 'europe-2027', 'india-2027']);
  for (const e of catalog.events) {
    assert.deepEqual(Object.keys(e.colors).sort(), [...keys].sort());
    for (const k of keys) assert.match(e.colors[k], /^[0-9A-F]{6}$/);
    assert.equal(typeof e.styleNote, 'string'); assert.ok(e.styleNote.length);
  }
  // Unannounced details stay empty rather than being filled in.
  assert.equal(catalog.events.find(e => e.id === 'india-2027').location, '');
  const response = await page.goto(origin); assert.equal(response.status(), 200);
  if (process.env.EXPECTED_VERSION) assert.equal(response.headers()['x-spacefast-version'], process.env.EXPECTED_VERSION);
  await assertInitialDemo(page); assert.equal(await page.locator('#preset-event').isHidden(), true);
  await page.locator('#username').fill('eidolonnight'); await page.locator('#create-button').click(); await ready();
  for (const layout of ['avatar', 'announcement']) {
    await page.locator('#layout').selectOption(layout); await ready();
    // Color controls belong to a drawn social card; avatar frames are finished artwork,
    // and so is a social card derived from them (WordCamp Asia).
    const frameLayout = layout === 'avatar';
    if (!frameLayout) {
      await page.locator('#event').selectOption('europe-2027'); await ready();
      if (!await page.locator('#customize-colors').evaluate(n => n.open)) await page.locator('#customize-colors summary').click();
      assert.equal(await page.locator('#preset-event').isVisible(), true);
    }
    for (const event of catalog.events) {
      await page.locator('#event').selectOption(event.id); await ready();
      const artwork = frameLayout || event.frameCard === true;
      assert.equal(event.frameCard === true, event.id === 'asia-2027');
      // Frame artwork is not recolored; the automatic palette still follows the event.
      assert.ok(event.frameRoles?.length, `${event.id}: every edition has avatar-frame artwork`);
      assert.equal(await page.locator('#customize-colors').isVisible(), !artwork, `${layout}/${event.id} color controls`);
      await assertColors(event.colors, `${layout}/${event.id} automatic source palette`);
      assert.equal(await page.locator('#event-note').isHidden(), true);
      assert.equal(await page.locator('#event-note').textContent(), '');
      assert.equal(await page.locator('#event-source').getAttribute('href'), event.url);
      const svg = await preview();
      assert.ok(parseHTML(svg).document.querySelector('[data-field="avatar"] image'), 'the real profile photo must remain embedded, not silently fall back to initials');
      assert.equal(parseHTML(svg).document.querySelectorAll('image[data-field="frame"]').length, artwork ? 1 : 0);
      const file = `${event.id}-${layout}`;
      // Both formats download as a PNG only.
      assert.equal(await page.locator('#download-svg').count(), 0);
      const png = await download('#download-png', file + '.png');
      assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), layout === 'avatar' ? 1080 : 1350);
      await assertDownloadedPNG(page, png);
      const url = await cardURLFromControls(page); const direct = await context.request.get(url);
      const css = parseHTML(svg).document.querySelector('style').textContent;
      const hash = 'sha256-' + createHash('sha256').update(css).digest('base64');
      let faces = [];
      if (artwork) {
        // Frame artwork is composed in the browser from the published PNG; the card route has none.
        assert.equal(direct.status(), 400);
        const published = await context.request.get(`${origin}/frames/${event.id}-${await page.locator('#role').inputValue()}.png`); assert.equal(published.status(), 200);
        assert.equal(parseHTML(svg).document.querySelector('image[data-field="frame"]').getAttribute('href'), 'data:image/png;base64,' + (await published.body()).toString('base64'));
      } else {
        assert.equal(direct.status(), 200); assert.equal(await direct.text(), svg, 'actual preview/export must match canonical server');
        assert.ok(direct.headers()['content-security-policy'].includes(`'${hash}'`), 'exact event-specific CSS must be authorized');
        const documentPage = await context.newPage(); await documentPage.goto(url); await documentPage.evaluate(async () => { await Promise.all([...document.fonts].map(face => face.load())); await document.fonts.ready; });
        faces = await documentPage.evaluate(() => [...document.fonts].map(f => ({ family: f.family, weight: f.weight, status: f.status })));
        assert.ok(faces.length >= 1 && faces.every(f => f.status === 'loaded'), JSON.stringify(faces));
        await documentPage.close();
      }
      await page.setViewportSize({ width: 390, height: 950 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${evidence}/${file}-mobile.png`, fullPage: true });
      if (process.env.AXE_PATH) {
        if (!await page.evaluate(() => Boolean(globalThis.axe))) await page.addScriptTag({ path: process.env.AXE_PATH });
        const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
        record.accessibility.push({ layout, event: event.id, violations }); assert.deepEqual(violations, []);
      }
      record.cases.push({ layout, event: event.id, artwork, colors: await values(), fontFaces: faces, svgSha256: createHash('sha256').update(svg).digest('hex'), pngSha256: createHash('sha256').update(png).digest('hex'), styleHash: hash });
    }
  }
  assert.equal(record.cases.length, 6); assert.equal(new Set(record.cases.map(c => c.layout + '/' + c.event)).size, 6);
  record.checks.push('All three offered events in both formats: automatic colors, actual downloads and mobile overflow; drawn social cards match the canonical SVG with exact CSP and embedded fonts; avatar frames and the frame-derived WordCamp Asia social card embed the published PNG and are refused by the card route');
  await page.locator('#foreground').evaluate(n => { n.value = '#2e3429'; n.dispatchEvent(new Event('input', { bubbles: true })); }); await ready();
  // Between two editions whose social cards are drawn, and so have color controls.
  await page.locator('#event').selectOption('europe-2027'); await ready();
  const europe = catalog.events.find(e => e.id === 'europe-2027');
  await assertColors({ ...europe.colors, foreground: '2E3429' }, 'individual customization survives event change while automatic colors follow event');
  await page.locator('#preset-event').click(); await ready(); await assertColors(europe.colors);
  await page.locator('#preset-dark').click(); await ready();
  for (const event of catalog.events) { await page.locator('#event').selectOption(event.id); await ready(); await assertColors(Object.fromEntries(keys.map((k, i) => [k, dark[i]])), 'manual Dark palette survives every event'); }
  await page.locator('#preset-event').click(); await ready();
  await page.locator('#layout').selectOption('profile'); await ready();
  await assertColors(Object.fromEntries(keys.map((k, i) => [k, light[i]])), 'automatic event colors do not leak into ordinary profile cards');
  assert.equal(await page.locator('#preset-event').isHidden(), true);
  record.checks.push('Individual overrides and manual presets persist; Event colors restores current source palette; ordinary profile defaults remain neutral');
  await page.goto(origin + '/create?username=eidolonnight&layout=announcement&event=india-2027&headerColor=123456&handle=false&header=false');
  await page.waitForFunction(() => document.getElementById('event').value === 'india-2027' && !document.getElementById('event-controls').disabled);
  const india = catalog.events.find(e => e.id === 'india-2027');
  await assertColors({ ...india.colors, headerColor: '123456' }, 'partial URL color overrides retain the other event defaults');
  assert.equal(await page.locator('#name').isChecked(), true); assert.equal(await page.locator('#name').isDisabled(), true); assert.equal(await page.locator('#handle').isChecked(), false);
  assert.equal(await page.locator('#header').count(), 0);
  await page.locator('#create-button').click(); await ready();
  record.checks.push('URL restoration preserves explicit individual fields/colors without restoring the removed master switch');
  const bad = structuredClone(catalog); bad.events[0].colors.foreground = 'url(https://not-allowed.invalid/x)';
  await page.route('**/events', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bad) }));
  await page.goto(origin + '/create?username=eidolonnight&layout=avatar');
  await page.waitForFunction(() => !document.getElementById('retry-events').hidden);
  assert.equal(await page.locator('#event-controls').evaluate(n => n.disabled), true);
  assert.equal(await page.locator('#exports').evaluate(n => n.disabled), true);
  assert.equal(await page.locator('#card-preview').isHidden(), true);
  await page.unroute('**/events'); await page.locator('#retry-events').click();
  await page.waitForFunction(() => !document.getElementById('event-controls').disabled);
  await page.locator('#create-button').click(); await ready(); await assertColors(catalog.events.find(e => e.id === 'asia-2027').colors);
  record.checks.push('Malformed remote palette fails closed and recovers through the actual retry control');
  assert.deepEqual(record.errors, []); assert.deepEqual(record.externalRequests, []); assert.deepEqual(record.failedResponses, []);
  record.pass = true;
} catch (error) { record.pass = false; record.failure = error.stack; process.exitCode = 1; }
finally { await browser.close(); await writeFile(evidence + '/event-colors-report.json', JSON.stringify(record, null, 2) + '\n'); console.log(JSON.stringify({ pass: record.pass, cases: record.cases.length, audits: record.accessibility.length, checks: record.checks, failure: record.failure }, null, 2)); }
