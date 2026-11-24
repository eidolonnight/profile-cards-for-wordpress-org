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
// Avatar frames are square artwork around the photo: round with transparent corners
// by default, or the whole square.
const pngExport = async (name, layout, { shape = null } = {}) => {
  const bytes = await download('#download-png', name + '.png');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), layout === 'avatar' ? 1080 : 1350);
  await assertDownloadedPNG(page, bytes);
  const alpha = await alphaEvidence(bytes);
  if (layout === 'avatar' && shape === 'square') { assert.deepEqual(alpha.corners, [255, 255, 255, 255]); assert.ok(alpha.outsideCircle > 0); assert.equal(alpha.center, 255); }
  else if (layout === 'avatar') { assert.equal(shape, 'circle'); assert.deepEqual(alpha.corners, [0, 0, 0, 0]); assert.equal(alpha.outsideCircle, 0); assert.equal(alpha.center, 255); }
  else assert.deepEqual(alpha.corners, [255, 255, 255, 255]);
  report.exports.push({ file: name + '.png', shape, bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), alpha, sha256: createHash('sha256').update(bytes).digest('hex') });
};
const noOverflow = async (target = page) => assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
try {
  const eventsResponse = await context.request.get(base + '/events'); assert.equal(eventsResponse.status(), 200);
  const catalog = await eventsResponse.json(); assert.equal(catalog.events.length, 3); assert.equal(catalog.roles.length, 6);
  assert.deepEqual(catalog.events.map(event => event.id), ['asia-2027', 'europe-2027', 'india-2027']);
  // Every edition's avatar frame is PNG artwork, listed per role.
  for (const event of catalog.events) assert.deepEqual(event.frameRoles, catalog.roles.map(role => role.id), event.id);
  assert.equal(catalog.roles.find(role => role.id === 'mediapartner').label, 'Media Partner');
  await page.goto(base, { waitUntil: 'networkidle' }); await assertInitialDemo(page); check('fresh builder renders the bundled Matt demo without profile API requests'); await page.locator('#username').fill('eidolonnight'); await page.locator('#create-button').click(); await ready();
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
    // Choices that cannot be changed are not shown: the photo, the social card's name,
    // and its event dates and location, which are no longer a control at all.
    assert.equal(await page.locator('#name').isVisible(), false);
    assert.equal(await page.locator('#handle').isVisible(), layout === 'announcement');
    assert.equal(await page.locator('#eventDetails').count(), 0);
    // A drawn social card has palettes; the avatar frame has a shape and always the photo.
    const frameLayout = layout === 'avatar';
    assert.equal(await page.locator('#shape-setting').isVisible(), frameLayout);
    assert.equal(await page.locator('#display-settings').isVisible(), !frameLayout);
    assert.equal(await page.locator('#avatar').isVisible(), false);
    assert.equal(await page.locator('#avatar').isChecked(), true); assert.equal(await page.locator('#avatar').isDisabled(), true);
    if (frameLayout) assert.equal(await page.locator('#shape-circle').isChecked(), true, 'circle is the default shape');
    for (const theme of frameLayout ? ['circle', 'square'] : ['light', 'dark']) {
      // Palettes are chosen on an edition whose card is drawn, and kept across editions.
      if (frameLayout) await page.locator('#shape-' + theme).check(); else { await page.locator('#event').selectOption('europe-2027'); await ready(); await selectPalette(page, theme); }
      await ready();
      for (const event of catalog.events) {
        await page.locator('#event').selectOption(event.id); await ready();
        // WordCamp Asia's social card is made from its frame artwork: finished artwork
        // like the avatar frame, with no color controls.
        const derived = !frameLayout && event.frameCard === true; const artwork = frameLayout || derived;
        assert.equal(event.frameCard === true, event.id === 'asia-2027');
        assert.equal(await page.locator('#event-source').getAttribute('href'), event.url);
        assert.equal(await page.locator('#customize-colors').isVisible(), !artwork, `${layout}/${event.id} color controls`);
        assert.equal(await page.locator('#frame-note').count(), 0);
        for (const role of catalog.roles) {
          await page.locator('#role').selectOption(role.id); const svg = await preview(); const d = doc(svg); const root = d.querySelector('svg');
          assert.equal(root.getAttribute('data-layout'), layout); assert.equal(root.getAttribute('width'), '1080'); assert.equal(root.getAttribute('height'), layout === 'avatar' ? '1080' : '1350');
          assert.equal(d.querySelectorAll('script,foreignObject,a').length, 0);
          const texts = [...d.querySelectorAll('text')].map(node => node.textContent.trim()).join(' ');
          assert.equal(d.querySelectorAll('image[data-field="frame"]').length, artwork ? 1 : 0, `${layout}/${event.id}/${role.id} artwork`);
          if (derived) {
            // The frame sits under its band, which carries the name and username; the artwork states the rest.
            assert.equal(d.querySelector('[data-field="event"], [data-field="role"], [data-field="eventDetails"]'), null);
            assert.deepEqual([...d.querySelectorAll('text')].map(node => node.parentNode.getAttribute('data-field')), ['name', 'handle']);
            assert.equal(d.querySelector('image[data-field="frame"]').parentNode.getAttribute('transform'), 'translate(0 270)');
            const title = d.querySelector('svg > title').textContent; assert.ok(title.startsWith(event.label) && title.endsWith(role.statement), 'the accessible title names event and role');
            assert.match(await page.locator('#card-preview').getAttribute('alt'), /Participation announcement\.$/);
            const published = await context.request.get(`${base}/frames/${event.id}-${role.id}.png`);
            assert.equal(d.querySelector('image[data-field="frame"]').getAttribute('href'), 'data:image/png;base64,' + (await published.body()).toString('base64'));
            // The band is the published PNG too, drawn from the top edge, with no fade over the artwork.
            const band = await context.request.get(`${base}/frames/${event.id}-${role.id}-band.png`); assert.equal(band.status(), 200); assert.equal(band.headers()['content-type'], 'image/png');
            assert.equal(d.querySelector('image[data-field="band"]').getAttribute('href'), 'data:image/png;base64,' + (await band.body()).toString('base64'));
            assert.equal(d.querySelector('linearGradient, [data-decoration]'), null);
            assert.deepEqual([...d.querySelectorAll('text')].map(node => node.getAttribute('data-face')), ['kumbh-sans-400', 'kumbh-sans-400']);
          } else if (artwork) {
            // The artwork carries the lettering; the accessible title still names event and role.
            assert.equal(d.querySelector('[data-field="event"], [data-field="role"], text'), null);
            assert.equal(d.querySelector('svg > title').textContent, `${event.label} — ${role.statement}`);
            assert.match(await page.locator('#card-preview').getAttribute('alt'), theme === 'circle' ? /Round avatar frame\.$/ : /Square avatar frame\.$/);
            assert.equal(root.getAttribute('data-shape'), theme);
            assert.equal(Boolean(d.querySelector('#social-shape')), theme === 'circle');
          } else {
            assert.ok(texts.toLowerCase().includes(role.statement.toLowerCase()), `${layout}/${event.id}/${role.id} role`);
            assert.ok(texts.toLowerCase().includes(event.name.toLowerCase()), `${layout}/${event.id}/${role.id} event`);
            assert.equal(d.querySelector('[data-field="event"]').textContent.toLowerCase(), event.name.toLowerCase());
          }
          assert.doesNotMatch(d.querySelector('svg > title').textContent, /20\d{2}/);
          assert.doesNotMatch(await page.locator('#card-preview').getAttribute('alt'), /20\d{2}/);
          assert.equal(await page.locator('#event option:checked').innerText(), event.name);
          await assertDownloadOnlyActions(page);
          if (layout === 'announcement') {
            assert.ok(texts.includes(profile.name)); assert.ok(texts.includes('@' + profile.userName));
            if (event.dateLabel && !derived) assert.ok(texts.includes(event.dateLabel));
            if (event.location && !derived) assert.ok(texts.includes(event.location));
            assert.ok(!/January 1|Phoenix|Host city TBA/.test(texts));
          }
          const image = d.querySelector('[data-field="avatar"] image'); assert.ok(image, 'live social photo must be embedded');
          if (!report.avatarSource) report.avatarSource = await page.evaluate(async (src) => { const image = new Image(); image.src = src; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; }, image.getAttribute('href'));
          const key = `${layout}/${theme}/${event.id}/${role.id}`; expectedMatrix.push(key); report.matrix.push(key);
        }
      }
      await page.locator('#event').selectOption('asia-2027'); await page.locator('#role').selectOption('attendee'); await ready();
      // Every format downloads as a PNG only.
      assert.equal(await page.locator('#download-svg').count(), 0);
      await pngExport(`${layout}-${theme}`, layout, frameLayout ? { shape: theme } : {});
      await page.screenshot({ path: `${evidence}/${layout}-${theme}-desktop.png`, fullPage: true });
      // The drawn social card exports the same way as the derived one.
      if (!frameLayout) { await page.locator('#event').selectOption('europe-2027'); await ready(); await pngExport(`${layout}-${theme}-europe`, layout); }
      if (frameLayout) {
        // One of the project's interim frames exports the same way as organizer artwork.
        await page.locator('#event').selectOption('europe-2027'); await ready();
        await pngExport(`${layout}-${theme}-europe`, layout, { shape: theme });
      }
    }
  }
  assert.deepEqual(report.avatarSource, { width: 1024, height: 1024 });
  assert.equal(new Set(report.matrix).size, catalog.events.length * catalog.roles.length * 2 * 2);
  assert.deepEqual([...new Set(report.matrix)].sort(), expectedMatrix.sort());
  await writeFile(evidence + '/matrix.json', JSON.stringify(report.matrix, null, 2) + '\n');
  check('every event × role × social-card palette and avatar-frame shape uses live profile data, correct text and dimensions');

  assert.equal(await page.locator('#avatar').isChecked(), true); assert.equal(await page.locator('#avatar').isDisabled(), true);
  assert.equal(await page.locator('#name').isChecked(), true); assert.equal(await page.locator('#name').isDisabled(), true);
  for (const event of ['asia-2027', 'europe-2027']) for (const id of ['handle']) {
    await page.locator('#event').selectOption(event); await ready();
    await page.locator('#' + id).uncheck(); const svg = await preview(); assert.equal(doc(svg).querySelector(`[data-field="${id}"]`), null, id);
    if (id === 'handle') assert.ok(!svg.replace(/href="data:[^"]*"/g, '').includes('@' + profile.userName));
    // Event dates and location are always shown: drawn as text, or inside the frame artwork.
    assert.ok(doc(svg).querySelector(event === 'asia-2027' ? 'image[data-field="frame"]' : '[data-field="eventDetails"]'));
    assert.ok(doc(svg).querySelector('[data-field="name"]'));
    await page.locator('#' + id).check(); await ready();
  }
  await page.locator('#handle').uncheck(); await page.locator('#event').selectOption('india-2027'); await page.locator('#role').selectOption('volunteer'); await ready();
  const beforeRestore = await preview();
  const builder = new URL(await cardURLFromControls(page)); builder.pathname = '/create'; const params = builder.searchParams;
  assert.equal(params.get('event'), 'india-2027'); assert.equal(params.get('role'), 'volunteer'); assert.equal(params.get('avatar'), 'true'); assert.equal(params.get('name'), 'true'); assert.equal(params.get('handle'), 'false'); assert.equal(params.has('eventDetails'), false);
  for (const key of ['refresh', 'header', 'badges', 'link', 'userId', 'teams', 'omitTeams', 'jobTitle', 'organization', 'location', 'joined', 'badgeLabelColor']) assert.equal(params.has(key), false, key);
  await page.goto(builder.href); await page.locator('#create-button').click(); const restored = await preview();
  assert.equal(await page.locator('#event').inputValue(), 'india-2027'); assert.equal(await page.locator('#role').inputValue(), 'volunteer');
  assert.ok(doc(restored).querySelector('[data-field="avatar"]')); assert.ok(doc(restored).querySelector('[data-field="name"]')); assert.equal(doc(restored).querySelector('[data-field="handle"]'), null); assert.ok(doc(restored).querySelector('[data-field="eventDetails"]'));
  assert.equal(createHash('sha256').update(restored).digest('hex'), createHash('sha256').update(beforeRestore).digest('hex'), 'restored event, role, colors and omissions must reproduce the same SVG');
  check('required announcement identity and event details, and the optional username, survive explicit builder URLs without irrelevant parameters');

  // The avatar frame keeps its shape between visits and always includes the photo.
  await page.locator('#layout').selectOption('avatar'); await ready();
  assert.equal(await page.locator('#shape-circle').isChecked(), true);
  assert.equal(await page.locator('#avatar').isVisible(), false); assert.equal(await page.locator('#avatar').isChecked(), true);
  await page.locator('#event').selectOption('asia-2027'); const roundFrame = await preview();
  assert.deepEqual([...doc(roundFrame).querySelector('svg').children].map(node => node.localName), ['title', 'desc', 'style', 'defs', 'g']);
  await page.locator('#shape-square').check(); const squareFrame = await preview();
  assert.deepEqual([...doc(squareFrame).querySelector('svg').children].map(node => node.localName), ['title', 'desc', 'style', 'g', 'image']);
  for (const frame of [squareFrame, roundFrame]) assert.ok(doc(frame).querySelector('[data-field="avatar"] image'));
  await page.locator('#layout').selectOption('announcement'); await ready(); await page.locator('#layout').selectOption('avatar'); await ready();
  assert.equal(await page.locator('#shape-square').isChecked(), true);
  await page.locator('#shape-circle').check();
  await page.locator('#event').selectOption('india-2027'); await ready();
  await page.locator('#layout').selectOption('profile'); await ready(); assert.equal(doc(await preview()).querySelector('svg').getAttribute('data-layout'), 'profile');
  assert.equal(await page.locator('#event-settings').isHidden(), true); assert.equal(await page.locator('#avatar').isChecked(), true);
  await page.locator('#layout').selectOption('square'); await ready();
  assert.equal(doc(await preview()).querySelector('svg').getAttribute('data-layout'), 'square');
  assert.equal(await page.locator('#avatar').isChecked(), true); assert.equal(await page.locator('#badges').isChecked(), true);
  await page.locator('#badges').uncheck(); await ready();
  await page.locator('#layout').selectOption('classic'); await ready(); assert.equal(doc(await preview()).querySelector('svg').getAttribute('width'), '720');
  assert.equal(await page.locator('#badges').isChecked(), true);
  await page.locator('#link').check(); assert.ok(doc(await preview()).querySelector('a'));
  await page.locator('#layout').selectOption('avatar'); await ready(); assert.equal(await page.locator('#avatar').isChecked(), true); assert.equal(await page.locator('#shape-circle').isChecked(), true);
  await page.locator('#layout').selectOption('announcement'); await ready(); assert.equal(await page.locator('#name').isChecked(), true); assert.equal(await page.locator('#name').isDisabled(), true); assert.equal(await page.locator('#handle').isChecked(), false);
  await page.locator('#layout').selectOption('square'); await ready(); assert.equal(await page.locator('#badges').isChecked(), false);
  assert.equal(await page.locator('#link').isChecked(), true); assert.equal(await page.locator('#avatar').isChecked(), true);
  check('the always-included avatar photo, the shape and independent visibility choices survive all five layouts');

  for (const layout of ['avatar', 'announcement']) {
    await page.locator('#layout').selectOption(layout);
    assert.equal(await page.locator('#avatar').isChecked(), true); assert.equal(await page.locator('#avatar').isDisabled(), true);
    await page.locator('#event').selectOption('europe-2027'); await page.locator('#role').selectOption('attendee'); if (layout === 'announcement') await selectPalette(page, 'light'); await ready();
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
    if (layout === 'avatar') {
      // Avatar frames exist only in the builder, which fetches the published PNG; the card route refuses them.
      const refused = await context.request.get(card); assert.equal(refused.status(), 400); assert.equal((await refused.json()).error.code, 'invalid_option');
      assert.equal(doc(await preview()).querySelector('text'), null, 'the lettering is in the artwork');
      continue;
    }
    const direct = await context.newPage(); const response = await direct.goto(card); assert.equal(response.status(), 200); assert.match(response.headers()['content-security-policy'], /font-src data:; style-src 'sha256-/);
    await direct.evaluate(() => document.fonts.ready);
    const bounds = await direct.evaluate(() => [...document.querySelectorAll('text')].map(el => { const b = el.getBBox(); return { text: el.textContent, x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height }; }));
    for (const b of bounds) assert.ok(b.x >= -1 && b.y >= -1 && b.right <= 1081 && b.bottom <= 1351, JSON.stringify(b));
    const fonts = await direct.evaluate(() => [...document.fonts].map(f => ({ family: f.family, weight: f.weight, status: f.status })));
    assert.ok(fonts.some(font => font.family.includes('Event Inter') && font.status === 'loaded'));
    assert.ok(fonts.some(font => font.family.includes('Event Cardo') && font.weight === '400' && font.status === 'loaded'), 'Europe uses its evidenced Cardo face');
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
  await page.unroute('**/preview-data?*'); await page.locator('#role').selectOption('attendee'); await page.locator('#create-button').click(); await ready();
  check('changing roles invalidates stale exports and failed renders recover through the real UI');

  const recovery = await context.newPage(); await recovery.route('**/events', route => route.abort('failed'));
  await recovery.goto(base + '/create?username=eidolonnight&layout=announcement&event=india-2027&role=sponsor');
  await recovery.locator('#retry-events').waitFor({ state: 'visible' }); assert.equal(await recovery.locator('#exports').evaluate(el => el.disabled), true);
  assert.equal(await recovery.locator('#retry-events').isEnabled(), true);
  await recovery.unroute('**/events'); await recovery.locator('#retry-events').click();
  await recovery.waitForFunction(() => document.getElementById('event').value === 'india-2027');
  await recovery.locator('#create-button').click(); await ready(recovery); assert.equal(await recovery.locator('#role').inputValue(), 'sponsor');
  const indiaText = [...doc(await preview(recovery)).querySelectorAll('text')].map(el => el.textContent).join(' '); assert.ok(indiaText.includes('Late 2027')); assert.ok(!/January 1|Host city TBA/.test(indiaText));
  // An unknown edition is rejected in a shared link and by the card route, with or without a valid role.
  for (const [layout, event] of [['avatar', 'unknown-2027'], ['announcement', 'asia-2026'], ['avatar', 'asia-2026']]) {
    await recovery.goto(base + `/create?username=eidolonnight&layout=${layout}&event=${event}&role=${event === 'asia-2026' ? 'attendee' : 'unknown'}`);
    await recovery.waitForFunction(() => document.getElementById('status').textContent.includes('Some URL settings were invalid'));
    assert.equal(await recovery.locator('#exports').evaluate(el => el.disabled), true, `${layout}/${event}`);
    assert.deepEqual(await recovery.locator('#event option').allTextContents(), ['WordCamp Asia', 'WordCamp Europe', 'WordCamp India']);
  }
  assert.equal((await context.request.get(base + '/card?username=eidolonnight&layout=announcement&event=asia-2026')).status(), 400);
  for (const invalid of ['layout=avatar&avatar=false', 'layout=avatar&shape=oval', 'layout=announcement&shape=square', 'layout=announcement&eventDetails=false']) {
    await recovery.goto(base + '/create?username=eidolonnight&' + invalid);
    await recovery.waitForFunction(() => document.getElementById('status').textContent.includes('Some URL settings were invalid'));
    assert.equal(await recovery.locator('#exports').evaluate(el => el.disabled), true, invalid);
  }
  for (const [event, role, shape] of [['asia-2027', 'mediapartner', 'square'], ['india-2027', 'speaker', 'circle'], ['europe-2027', 'organizer', null]]) {
    await recovery.goto(base + `/create?username=eidolonnight&layout=avatar&event=${event}&role=${role}` + (shape ? `&shape=${shape}` : ''));
    await recovery.waitForFunction(role => document.getElementById('role').value === role, role);
    assert.equal(await recovery.locator(`#shape-${shape || 'circle'}`).isChecked(), true);
    await recovery.locator('#create-button').click(); await ready(recovery);
    const shared = await preview(recovery);
    assert.equal(doc(shared).querySelector('svg').getAttribute('data-shape'), shape || 'circle');
    assert.ok(doc(shared).querySelector('image[data-field="frame"]')); assert.ok(doc(shared).querySelector('[data-field="avatar"] image'));
    // The frame in the preview is the published PNG, byte for byte. The card route has no avatar frame.
    const published = await context.request.get(`${base}/frames/${event}-${role}.png`); assert.equal(published.status(), 200); assert.equal(published.headers()['content-type'], 'image/png');
    assert.equal(doc(shared).querySelector('image[data-field="frame"]').getAttribute('href'), 'data:image/png;base64,' + (await published.body()).toString('base64'), `${event}/${role}: builder embeds the published artwork`);
    const card = new URL(await cardURLFromControls(recovery)); assert.equal(card.searchParams.get('shape'), shape || 'circle'); assert.equal(card.searchParams.get('avatar'), 'true');
    assert.equal((await context.request.get(card.href)).status(), 400);
    assert.equal(await recovery.locator('#download-svg').count(), 0);
  }
  await recovery.close();
  check('catalog failure has a usable retry, restores pending selections, and rejects unknown shared event/role settings');
  check('shared avatar-frame links restore role and shape, embed the published PNG, and reject a hidden photo or unknown shape; the card route serves no avatar frame');
  assert.deepEqual(report.errors, []); assert.deepEqual([...new Set(report.externalOrigins)], []);
  if (process.env.EXPECTED_VERSION) assert.ok(report.documentVersions.length && report.documentVersions.every(version => version === process.env.EXPECTED_VERSION));
  report.pass = true;
} catch (error) { report.pass = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  await writeFile(evidence + '/social-browser-report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify({ pass: report.pass, matrixCount: report.matrix.length, checks: report.checks, exports: report.exports, errors: report.errors, failure: report.failure }, null, 2));
}
