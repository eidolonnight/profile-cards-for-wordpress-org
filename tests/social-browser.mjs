import assert from 'node:assert/strict';
import { assertDownloadOnlyActions, cardURLFromControls, selectPalette, assertInitialDemo, assertDownloadedPNG } from './ui-acceptance.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom/worker';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_ORIGIN || 'http://127.0.0.1:4197';
const evidence = process.env.EVIDENCE_DIR;
if (!evidence || !process.env.AXE_PATH) throw new Error('EVIDENCE_DIR outside hosting and AXE_PATH are required.');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true, ...(process.env.BROWSER_STATE ? { storageState: process.env.BROWSER_STATE } : {}) });
const report = { origin: base, checks: [], matrix: [], exports: [], layouts: [], accessibility: [], errors: [], externalOrigins: [], documentVersions: [], inputResponses: [], failedRequests: [] };
context.on('page', page => {
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  page.on('request', request => { const url = new URL(request.url()); if (/^https?:$/.test(url.protocol) && url.origin !== new URL(base).origin) report.externalOrigins.push(url.origin); });
  page.on('requestfailed', request => { const url = new URL(request.url()); if (url.origin === new URL(base).origin) report.failedRequests.push({ path: url.pathname, size: url.searchParams.get('size'), error: request.failure()?.errorText }); });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === new URL(base).origin && ['/json', '/preview-data', '/card', '/events'].includes(url.pathname)) report.inputResponses.push({ path: url.pathname, size: url.searchParams.get('size'), status: response.status(), retryAfter: response.headers()['retry-after'] || null });
  });
  page.on('response', response => { if (response.request().isNavigationRequest() && response.status() === 200 && new URL(response.url()).origin === new URL(base).origin) report.documentVersions.push(response.headers()['x-spacefast-version'] || null); });
});
const page = await context.newPage();
const ready = async (target = page) => {
  try {
    await target.waitForFunction(() => !document.getElementById('exports').disabled && document.getElementById('card-preview').complete && document.getElementById('card-preview').naturalWidth > 0, null, { timeout: 45000 });
  } catch (error) {
    report.readinessFailure = await target.evaluate(() => ({
      layout: document.getElementById('layout')?.value,
      status: document.getElementById('status')?.textContent,
      busy: document.getElementById('preview-stage')?.getAttribute('aria-busy'),
      exportsDisabled: document.getElementById('exports')?.disabled,
      image: { complete: document.getElementById('card-preview')?.complete, width: document.getElementById('card-preview')?.naturalWidth, hidden: document.getElementById('card-preview')?.hidden },
    })).catch(() => ({ unavailable: true }));
    throw error;
  }
};
const preview = async (target = page) => { await ready(target); return target.locator('#card-preview').evaluate(image => fetch(image.src).then(response => response.text())); };
const doc = svg => parseHTML(svg).document;
const check = label => report.checks.push(label);
const download = async (id, filename) => {
  const wait = page.waitForEvent('download'); await page.locator(id).click(); const result = await wait;
  assert.match(result.suggestedFilename(), /^eidolonnight-(asia|europe|us|india)-2027-(avatar|announcement)\.(svg|png)$/);
  await result.saveAs(evidence + '/' + filename); return readFile(evidence + '/' + filename);
};
const alphaEvidence = async (png) => page.evaluate(async (encoded) => {
  const image = new Image(); image.src = 'data:image/png;base64,' + encoded; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const c = canvas.getContext('2d'); c.drawImage(image, 0, 0); const { data } = c.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = (x, y) => data[(y * canvas.width + x) * 4 + 3];
  let outside = 0;
  if (canvas.width === canvas.height) for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (Math.hypot(x + 0.5 - 540, y + 0.5 - 540) > 542 && alpha(x, y) > 5) outside++;
  }
  return { center: alpha(540, 540), corners: [alpha(0, 0), alpha(canvas.width - 1, 0), alpha(0, canvas.height - 1), alpha(canvas.width - 1, canvas.height - 1)], outsideCircle: outside };
}, png.toString('base64'));
const pngExport = async (name, layout, frameOnly = false) => {
  const bytes = await download('#download-png', name + '.png');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), layout === 'avatar' ? 1080 : 1350);
  await assertDownloadedPNG(page, bytes);
  const alpha = await alphaEvidence(bytes);
  if (layout === 'avatar') { assert.deepEqual(alpha.corners, [0, 0, 0, 0]); assert.equal(alpha.outsideCircle, 0); assert.equal(alpha.center, frameOnly ? 0 : 255); }
  else assert.deepEqual(alpha.corners, [255, 255, 255, 255]);
  report.exports.push({ file: name + '.png', bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), alpha, sha256: createHash('sha256').update(bytes).digest('hex') });
};
const noOverflow = async (target = page) => assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
try {
  const eventsResponse = await context.request.get(base + '/events'); assert.equal(eventsResponse.status(), 200);
  const catalog = await eventsResponse.json(); assert.equal(catalog.events.length, 4); assert.equal(catalog.roles.length, 5);
  assert.deepEqual(catalog.events.map(event => event.id), ['asia-2027', 'europe-2027', 'us-2027', 'india-2027']);
  await page.goto(base, { waitUntil: 'networkidle' }); await assertInitialDemo(page); check('live matt demo is labeled while username stays blank'); await page.locator('#username').fill('eidolonnight'); await page.locator('#create-button').click(); await ready();
  const source = await context.request.get(base + '/json?username=eidolonnight'); assert.equal(source.status(), 200); const profile = await source.json();
  assert.equal(profile.userName, 'eidolonnight'); assert.ok(profile.name); report.profile = { username: profile.userName, fetchedAt: profile.fetchedAt };
  const expectedMatrix = [];
  for (const layout of ['avatar', 'announcement']) {
    await page.locator('#layout').selectOption(layout); await ready();
    assert.equal(await page.locator('#event-settings').isVisible(), true);
    assert.equal(await page.locator('#header').count(), 0);
    for (const hidden of ['badges', 'link', 'jobTitle', 'organization', 'location', 'joined', 'teams']) {
      assert.equal(await page.locator('#' + hidden).isVisible(), false, hidden);
      assert.equal(await page.locator('#' + hidden).isDisabled(), true, hidden);
    }
    assert.equal(await page.locator('#name').isVisible(), layout === 'announcement');
    assert.equal(await page.locator('#eventDetails').isVisible(), layout === 'announcement');
    for (const theme of ['light', 'dark']) {
      await selectPalette(page, theme); await ready();
      for (const event of catalog.events) {
        await page.locator('#event').selectOption(event.id); await ready();
        assert.equal(await page.locator('#event-source').getAttribute('href'), event.url);
        for (const role of catalog.roles) {
          await page.locator('#role').selectOption(role.id); const svg = await preview(); const d = doc(svg); const root = d.querySelector('svg');
          assert.equal(root.getAttribute('data-layout'), layout); assert.equal(root.getAttribute('width'), '1080'); assert.equal(root.getAttribute('height'), layout === 'avatar' ? '1080' : '1350');
          assert.equal(d.querySelectorAll('script,foreignObject,a').length, 0);
          const texts = [...d.querySelectorAll('text')].map(node => node.textContent.trim()).join(' ');
          assert.ok(texts.toLowerCase().includes(role.statement.toLowerCase()), `${layout}/${event.id}/${role.id} role`);
          assert.ok(texts.toLowerCase().includes(event.name.toLowerCase()), `${layout}/${event.id}/${role.id} event`);
          assert.equal(d.querySelector('[data-field="event"]').textContent.toLowerCase(), event.name.toLowerCase());
          assert.doesNotMatch(d.querySelector('svg > title').textContent, /20\d{2}/);
          assert.doesNotMatch(await page.locator('#card-preview').getAttribute('alt'), /20\d{2}/);
          assert.equal(await page.locator('#event option:checked').innerText(), event.name);
          await assertDownloadOnlyActions(page);
          if (layout === 'announcement') {
            assert.ok(texts.includes(profile.name)); assert.ok(texts.includes('@' + profile.userName));
            if (event.dateLabel) assert.ok(texts.includes(event.dateLabel));
            if (event.location) assert.ok(texts.includes(event.location));
            assert.ok(!/January 1|Phoenix|Host city TBA/.test(texts));
          }
          const image = d.querySelector('[data-field="avatar"] image'); assert.ok(image, 'live social photo must be embedded');
          if (!report.avatarSource) report.avatarSource = await page.evaluate(async (src) => { const image = new Image(); image.src = src; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; }, image.getAttribute('href'));
          const key = `${layout}/${theme}/${event.id}/${role.id}`; expectedMatrix.push(key); report.matrix.push(key);
        }
      }
      await page.locator('#event').selectOption('asia-2027'); await page.locator('#role').selectOption('attendee'); await ready();
      await download('#download-svg', `${layout}-${theme}.svg`); await pngExport(`${layout}-${theme}`, layout);
      await page.screenshot({ path: `${evidence}/${layout}-${theme}-desktop.png`, fullPage: true });
    }
  }
  assert.deepEqual(report.avatarSource, { width: 1024, height: 1024 });
  assert.equal(new Set(report.matrix).size, catalog.events.length * catalog.roles.length * 2 * 2);
  assert.deepEqual([...new Set(report.matrix)].sort(), expectedMatrix.sort());
  await writeFile(evidence + '/matrix.json', JSON.stringify(report.matrix, null, 2) + '\n');
  check('every event × role × format × light/dark combination uses live profile data, correct text and dimensions');

  for (const id of ['name', 'handle', 'avatar', 'eventDetails']) {
    await page.locator('#' + id).uncheck(); const svg = await preview(); assert.equal(doc(svg).querySelector(`[data-field="${id}"]`), null, id);
    if (id === 'name') assert.ok(!svg.includes(profile.name));
    if (id === 'handle') assert.ok(!svg.includes('@' + profile.userName));
    await page.locator('#' + id).check(); await ready();
  }
  await page.locator('#name').uncheck(); await page.locator('#eventDetails').uncheck(); await page.locator('#event').selectOption('india-2027'); await page.locator('#role').selectOption('volunteer'); await ready();
  const beforeRestore = await preview();
  const builder = new URL(await cardURLFromControls(page)); builder.pathname = '/create'; const params = builder.searchParams;
  assert.equal(params.get('event'), 'india-2027'); assert.equal(params.get('role'), 'volunteer'); assert.equal(params.get('name'), 'false'); assert.equal(params.get('eventDetails'), 'false');
  for (const key of ['refresh', 'header', 'badges', 'link', 'userId', 'teams', 'omitTeams', 'jobTitle', 'organization', 'location', 'joined', 'badgeLabelColor']) assert.equal(params.has(key), false, key);
  await page.goto(builder.href); await page.locator('#create-button').click(); const restored = await preview();
  assert.equal(await page.locator('#event').inputValue(), 'india-2027'); assert.equal(await page.locator('#role').inputValue(), 'volunteer');
  assert.equal(doc(restored).querySelector('[data-field="name"]'), null); assert.equal(doc(restored).querySelector('[data-field="eventDetails"]'), null);
  assert.equal(createHash('sha256').update(restored).digest('hex'), createHash('sha256').update(beforeRestore).digest('hex'), 'restored event, role, colors and omissions must reproduce the same SVG');
  check('announcement omissions and event/role/color settings survive explicit builder URLs without irrelevant parameters');

  await page.locator('#layout').selectOption('avatar'); await ready(); await page.locator('#avatar').uncheck(); const frame = await preview();
  assert.equal(doc(frame).querySelector('[data-field="avatar"]'), null); await pngExport('avatar-overlay', 'avatar', true);
  await page.locator('#layout').selectOption('profile'); await ready(); assert.equal(doc(await preview()).querySelector('svg').getAttribute('data-layout'), 'profile');
  assert.equal(await page.locator('#event-settings').isHidden(), true); assert.equal(await page.locator('#avatar').isChecked(), true);
  await page.locator('#layout').selectOption('square'); await ready();
  assert.equal(doc(await preview()).querySelector('svg').getAttribute('data-layout'), 'square');
  assert.equal(await page.locator('#avatar').isChecked(), true); assert.equal(await page.locator('#badges').isChecked(), true);
  await page.locator('#badges').uncheck(); await ready();
  await page.locator('#layout').selectOption('classic'); await ready(); assert.equal(doc(await preview()).querySelector('svg').getAttribute('width'), '720');
  assert.equal(await page.locator('#badges').isChecked(), true);
  await page.locator('#link').check(); assert.ok(doc(await preview()).querySelector('a'));
  await page.locator('#layout').selectOption('avatar'); await ready(); assert.equal(await page.locator('#avatar').isChecked(), false);
  await page.locator('#layout').selectOption('announcement'); await ready(); assert.equal(await page.locator('#name').isChecked(), false); assert.equal(await page.locator('#eventDetails').isChecked(), false);
  await page.locator('#layout').selectOption('square'); await ready(); assert.equal(await page.locator('#badges').isChecked(), false);
  assert.equal(await page.locator('#link').isChecked(), true); assert.equal(await page.locator('#avatar').isChecked(), true);
  check('transparent frame-only export and independent visibility choices survive all five layouts');

  for (const layout of ['avatar', 'announcement']) {
    await page.locator('#layout').selectOption(layout); await page.locator('#avatar').check(); if (layout === 'announcement') { await page.locator('#name').check(); await page.locator('#eventDetails').check(); }
    await page.locator('#event').selectOption('europe-2027'); await page.locator('#role').selectOption('attendee'); await selectPalette(page, 'light'); await ready();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 }); await noOverflow();
      const controls = await page.locator('.controls').boundingBox(), result = await page.locator('.result').boundingBox();
      if (width >= 1024) { assert.ok(result.x >= controls.x + controls.width); assert.ok(Math.abs(result.y - controls.y) < 1); }
      else { assert.ok(result.y >= controls.y + controls.height); assert.ok(Math.abs(result.x - controls.x) < 1); }
      const image = await page.locator('#card-preview').boundingBox(); assert.ok(image.width <= result.width + 1);
      report.layouts.push({ layout, width, columns: width >= 1024 ? 2 : 1, image });
      if (width === 390 || width === 1440) await page.screenshot({ path: `${evidence}/${layout}-${width}.png`, fullPage: true });
    }
    await page.addScriptTag({ path: process.env.AXE_PATH });
    const violations = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }).then(result => result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
    report.accessibility.push({ layout, violations }); assert.deepEqual(violations, []);
    const card = await cardURLFromControls(page);
    const direct = await context.newPage(); const response = await direct.goto(card); assert.equal(response.status(), 200); assert.match(response.headers()['content-security-policy'], /font-src data:; style-src 'sha256-/);
    await direct.evaluate(() => document.fonts.ready);
    const bounds = await direct.evaluate(() => [...document.querySelectorAll('text')].map(el => { const b = el.getBBox(); return { text: el.textContent, x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height }; }));
    for (const b of bounds) assert.ok(b.x >= -1 && b.y >= -1 && b.right <= 1081 && b.bottom <= (layout === 'avatar' ? 1081 : 1351), JSON.stringify(b));
    const fonts = await direct.evaluate(() => [...document.fonts].map(f => ({ family: f.family, weight: f.weight, status: f.status })));
    assert.ok(fonts.some(font => font.family.includes('Event Inter') && font.status === 'loaded'));
    assert.ok(fonts.some(font => font.family.includes('Event Cardo') && font.weight === '400' && font.status === 'loaded'), 'Europe uses its evidenced Cardo face in both formats');
    await direct.close();
  }
  check('two-column desktop, stacked mobile, native aspect ratio, embedded font CSP, SVG text bounds and axe A/AA pass');

  assert.equal(await page.locator('#role').evaluate(el => { el.value = 'speaker'; el.dispatchEvent(new Event('change', { bubbles: true })); return document.getElementById('exports').disabled; }), true);
  await ready();
  await page.route('**/preview-data?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Test service unavailable' } }) }));
  // Cached option redraws deliberately do not contact the server. A new lookup
  // clears that snapshot and exercises the real input-error/recovery path.
  await page.locator('#role').selectOption('organizer'); await ready();
  await page.locator('#create-button').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('Test service unavailable'));
  assert.equal(await page.locator('#exports').evaluate(el => el.disabled), true); assert.equal(await page.locator('#card-preview').isHidden(), true);
  await page.unroute('**/preview-data?*'); await page.locator('#role').selectOption('attendee'); await ready();
  check('changing roles invalidates stale exports and failed renders recover through the real UI');

  const recovery = await context.newPage(); await recovery.route('**/events', route => route.abort('failed'));
  await recovery.goto(base + '/create?username=eidolonnight&layout=announcement&event=us-2027&role=sponsor');
  await recovery.locator('#retry-events').waitFor({ state: 'visible' }); assert.equal(await recovery.locator('#exports').evaluate(el => el.disabled), true);
  assert.equal(await recovery.locator('#retry-events').isEnabled(), true);
  await recovery.unroute('**/events'); await recovery.locator('#retry-events').click();
  await recovery.waitForFunction(() => document.getElementById('event').value === 'us-2027');
  await recovery.locator('#create-button').click(); await ready(recovery); assert.equal(await recovery.locator('#role').inputValue(), 'sponsor');
  const usText = [...doc(await preview(recovery)).querySelectorAll('text')].map(el => el.textContent).join(' '); assert.ok(!/January 1|Phoenix/.test(usText));
  await recovery.goto(base + '/create?username=eidolonnight&layout=avatar&event=unknown-2027&role=unknown');
  await recovery.waitForFunction(() => document.getElementById('status').textContent.includes('Some URL settings were invalid'));
  assert.equal(await recovery.locator('#exports').evaluate(el => el.disabled), true); await recovery.close();
  check('catalog failure has a usable retry, restores pending selections, and rejects unknown shared event/role settings');
  assert.deepEqual(report.errors, []); assert.deepEqual([...new Set(report.externalOrigins)], []);
  if (process.env.EXPECTED_VERSION) assert.ok(report.documentVersions.length && report.documentVersions.every(version => version === process.env.EXPECTED_VERSION));
  report.pass = true;
} catch (error) { report.pass = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  await writeFile(evidence + '/social-browser-report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify({ pass: report.pass, matrixCount: report.matrix.length, checks: report.checks, exports: report.exports, errors: report.errors, failure: report.failure }, null, 2));
}
