import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cardURLFromControls } from './ui-acceptance.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4214';
const evidence = process.env.EVIDENCE_DIR;
if (!evidence || !process.env.AXE_PATH) throw new Error('EVIDENCE_DIR and AXE_PATH are required');
await mkdir(evidence, { recursive: true });
const report = { origin, expectedVersion: process.env.EXPECTED_VERSION || null, assetRevision: process.env.ASSET_REVISION || null, checks: [], views: [], exports: [], errors: [], externalOrigins: [], documents: [], browserAssets: [] };
if (report.assetRevision) assert.match(report.assetRevision, /^[0-9a-f]{64}$/);
const staticPaths = new Set(['/app.js', '/theme.js', '/styles.css', '/background.js', ...['preview', 'options', 'svg', 'social', 'fonts', 'events', 'event-themes', 'event-fonts'].map(n => `/preview/${n}.js`)]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const modern = ['avatar', 'name', 'handle', 'jobTitle', 'organization', 'location', 'joined', 'teams', 'badges', 'badgeNames', 'social', 'link'];
const disclaimer = 'Your participation role is self-reported. These personal graphics are not official event badges or proof of registration.';
const watch = context => {
  const get = context.request.get.bind(context.request);
  context.request.get = async (...args) => {
    const response = await get(...args);
    if (response.status() >= 400) {
      const body = await response.json().catch(() => null);
      (report.failedAPIResponses ||= []).push({ path: new URL(args[0]).pathname, status: response.status(), retryAfter: response.headers()['retry-after'] || null, error: body?.error || null });
    }
    return response;
  };
  context.on('page', page => {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) (report.failedResponses ||= []).push({ path: new URL(response.url()).pathname, status: response.status(), retryAfter: response.headers()['retry-after'] || null }); });
  page.on('request', request => {
    const u = new URL(request.url());
    if (/^https?:$/.test(u.protocol) && u.origin !== new URL(origin).origin) report.externalOrigins.push(u.origin);
    if (u.origin === new URL(origin).origin && staticPaths.has(u.pathname)) report.browserAssets.push({ path: u.pathname, query: u.searchParams.toString() });
  });
});
};
const navigate = async (page, path = '/') => {
  const r = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
  assert.equal(r.status(), 200);
  if (report.expectedVersion) assert.equal(r.headers()['x-spacefast-version'], report.expectedVersion);
  report.documents.push({ path, status: r.status(), version: r.headers()['x-spacefast-version'] || null });
};
const ready = page => page.waitForFunction(() => { const i = document.querySelector('#card-preview'); return !document.querySelector('#exports').disabled && !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 60000 });
const svgText = page => page.locator('#card-preview').evaluate(async i => (await fetch(i.src)).text());
const readSvg = (page, text) => page.evaluate(text => {
  const d = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (d.querySelector('parsererror')) throw new Error('Malformed exported SVG');
  return { fields: [...new Set([...d.querySelectorAll('[data-field]')].map(n => n.dataset.field))], text: [...d.querySelectorAll('text')].map(n => n.textContent), links: [...d.querySelectorAll('a')].map(n => ({ href: n.getAttribute('href'), name: n.getAttribute('aria-label') || n.querySelector('title')?.textContent || n.textContent, target: n.getAttribute('target'), rel: n.getAttribute('rel') })), badges: [...d.querySelectorAll('[data-badge]')].map(n => ({ name: n.dataset.badge, label: n.getAttribute('aria-label'), text: [...n.querySelectorAll('text')].map(t => t.textContent).join(' ') })), width: Number(d.documentElement.getAttribute('width')), height: Number(d.documentElement.getAttribute('height')) };
}, text);
const change = async (page, action) => { await action(); await ready(page); };
const effectiveTheme = page => page.evaluate(() => {
  const mode = document.documentElement.dataset.theme;
  return mode === 'light' || mode === 'dark' ? mode : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
});
const setAppearance = async (page, target) => {
  if (await effectiveTheme(page) !== target) await page.locator('#site-theme').click();
  assert.equal(await effectiveTheme(page), target);
};
const inspectCardGeometry = async (context, builder, layout) => {
  const card = await context.newPage();
  try {
    const response = await card.goto(await cardURLFromControls(builder), { waitUntil: 'load' });
    assert.equal(response.status(), 200);
    await card.evaluate(async () => { document.documentElement.getBoundingClientRect(); await document.fonts.ready; await new Promise(requestAnimationFrame); });
    const geometry = await card.evaluate(() => {
      const root = document.documentElement;
      const inverse = root.getScreenCTM().inverse();
      const matrix = n => inverse.multiply(n.getScreenCTM());
      const box = n => {
        const b = n.getBBox(), m = matrix(n);
        const points = [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y]) => new DOMPoint(x,y).matrixTransform(m));
        return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
      };
      return { width: root.viewBox.baseVal.width, height: root.viewBox.baseVal.height,
        metadata: [...root.querySelectorAll('[data-field]')].filter(n => ['name','jobLine','handle','link','location','joined'].includes(n.dataset.field)).map(box),
        teams: [...root.querySelectorAll('[data-field="teams"]')].map(box),
        social: [...root.querySelectorAll('[data-social]')].map(n => ({ ...box(n), x: matrix(n).e, y: matrix(n).f })),
        badges: [...root.querySelectorAll('[data-badge]')].map(n => ({ ...box(n), x: matrix(n).e, y: matrix(n).f, name: n.dataset.badge })) };
    });
    assert.ok(geometry.social.length > 0);
    const socialTop = Math.min(...geometry.social.map(n => n.top)), socialBottom = Math.max(...geometry.social.map(n => n.bottom));
    assert.ok(socialTop >= Math.max(...geometry.metadata.map(n => n.bottom)), `${layout} social must follow identity metadata`);
    if (geometry.teams.length) assert.ok(socialBottom <= Math.min(...geometry.teams.map(n => n.top)), `${layout} social must precede teams`);
    if (geometry.badges.length) assert.ok(socialBottom <= Math.min(...geometry.badges.map(n => n.top)), `${layout} social must precede badges`);
    if (layout === 'square') {
      assert.deepEqual([geometry.width, geometry.height], [720,720]);
      const rows = new Map();
      for (const icon of geometry.social) { const y = icon.y.toFixed(3); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(icon); }
      for (const row of rows.values()) assert.ok(Math.abs((Math.min(...row.map(n => n.left)) + Math.max(...row.map(n => n.right))) / 2 - 360) < 0.1, 'Each Vertical social row is centered');
      const columns = [...new Set(geometry.badges.map(n => n.x.toFixed(3)))].map(Number).sort((a,b) => a-b);
      assert.equal(columns.length, 3, 'Vertical badges have exactly three aligned columns');
      assert.ok(Math.abs((columns[1]-columns[0]) - (columns[2]-columns[1])) < 0.01, 'Badge columns are evenly spaced');
      for (let i = 0; i < geometry.badges.length; i++) {
        const a = geometry.badges[i];
        assert.ok(a.left >= -0.1 && a.right <= 720.1 && a.top >= -0.1 && a.bottom <= 720.1, `Badge fits canvas: ${a.name}`);
        for (const b of geometry.badges.slice(i+1)) assert.ok(a.right <= b.left+0.1 || b.right <= a.left+0.1 || a.bottom <= b.top+0.1 || b.bottom <= a.top+0.1, `Badge cells do not overlap: ${a.name}/${b.name}`);
      }
    }
    report.checks.push({ layout, renderedCardGeometry: geometry });
  } finally { await card.close(); }
};
const capture = async (page, label, width) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, background: getComputedStyle(document.documentElement).backgroundColor, text: getComputedStyle(document.body).color, first: [...document.querySelectorAll('.controls input:not([type=file]),.controls select,.controls textarea')].find(n => n.getClientRects().length)?.id }));
  assert.ok(geometry.scroll <= width, label + ' horizontal overflow');
  assert.equal(geometry.first, 'username');
  const controls = await page.evaluate(ids => {
    const layout = document.querySelector('#layout').value;
    const options = ids.map(id => document.getElementById(id)).filter(n => n.getClientRects().length).map(n => {
      const b = n.closest('label').getBoundingClientRect();
      return { id: n.id, x: b.x, y: b.y, width: b.width, height: b.height };
    });
    const note = document.querySelector('#cache-note');
    const status = document.querySelector('#status');
    const button = document.querySelector('#site-theme').getBoundingClientRect();
    return { layout, options, noteInStatus: note.closest('#status') === status, noteText: note.textContent, statusText: status.textContent, noteDisplay: getComputedStyle(note).display, button: { width: button.width, height: button.height } };
  }, modern);
  if (['profile','square'].includes(controls.layout)) {
    assert.equal(controls.options.length, modern.length);
    const columns = new Map();
    for (const option of controls.options) { const x = option.x.toFixed(2); if (!columns.has(x)) columns.set(x, []); columns.get(x).push(option); assert.ok(option.height >= 44, option.id + ' label target'); }
    assert.equal(columns.size, 2, 'Content choices form two aligned columns');
    const [left, right] = [...columns.values()].sort((a,b) => a[0].x-b[0].x);
    assert.deepEqual([left.length,right.length],[6,6]);
    for (let i=0; i<6; i++) { assert.ok(Math.abs(left[i].y-right[i].y) < 1, 'Content choices align in six rows'); assert.ok(Math.abs(left[i].width-right[i].width) < 1, 'Equal-width option columns'); }
  }
  assert.equal(controls.noteInStatus, true, 'Fetched timestamp shares ready status paragraph');
  assert.match(controls.statusText.trim(), /^Your image is ready to download\.\s+Profile fetched /);
  assert.equal(controls.noteDisplay, 'inline');
  assert.ok(controls.button.width >= 44 && controls.button.height >= 44, 'Theme button target');
  if (!await page.evaluate(() => Boolean(globalThis.axe))) await page.addScriptTag({ path: process.env.AXE_PATH });
  const issues = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
  assert.deepEqual(issues, [], label + ' accessibility');
  const path = `${evidence}/${label}-${width}.png`;
  await page.screenshot({ path, fullPage: true });
  report.views.push({ label, ...geometry, issues, screenshot: path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
};
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }); watch(context);
  const page = await context.newPage();
  await navigate(page); await ready(page);
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://profiles.wapuu.news/');
  assert.equal(await page.locator('.controls input, .controls select').first().getAttribute('id'), 'username');
  assert.equal(await page.locator('#customize-colors').evaluate(n => n.open), false);
  assert.equal(await page.locator('#background-choose').isVisible(), false);
  assert.equal(await page.locator('#customize-colors .background-settings').count(), 1);
  assert.equal(await page.locator('.about #role-help').innerText(), disclaimer);
  assert.equal(await page.locator('footer #role-help').count(), 0);
  assert.equal(await page.locator('#role').getAttribute('aria-describedby'), 'role-help');
  assert.equal(await page.locator('#site-theme').isVisible(), true);
  const light = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  assert.equal(await page.locator('#site-theme').evaluate(n => n.tagName), 'BUTTON');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'system');
  for (const id of modern) assert.equal(await page.locator('#' + id).isChecked(), true, 'Fresh default ' + id);
  await page.locator('#site-theme').click();
  const dark = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  assert.notEqual(dark, light);
  const cardBeforeTheme = await svgText(page);
  await page.locator('#site-theme').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'system', 'Returning to OS palette restores automatic appearance');
  assert.equal(await svgText(page), cardBeforeTheme, 'Site appearance must not recolor the card');
  await page.locator('#site-theme').click(); await page.reload(); await ready(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), dark);
  await page.locator('#site-theme').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'system');
  await page.emulateMedia({ colorScheme: 'light' }); assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), light);
  await page.emulateMedia({ colorScheme: 'dark' }); assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), dark);
  report.checks.push('System-aware light/dark site appearance, explicit override persistence, independent card colors, username-first order, collapsed colors/background, grouped privacy/participation notices and canonical domain');
  await page.locator('#username').fill('eidolonnight'); await page.locator('#create-button').click(); await ready(page);
  const profileResponse = await context.request.get(origin + '/json?username=eidolonnight'); assert.equal(profileResponse.status(), 200); const profile = await profileResponse.json();
  const layoutFields = {};
  for (const layout of ['profile', 'square']) {
    await change(page, () => page.locator('#layout').selectOption(layout));
    for (const id of modern) {
      assert.equal(await page.locator('#' + id).isVisible(), true, `${layout}/${id} available`);
      assert.equal(await page.locator('#' + id).isChecked(), true, `${layout}/${id} default checked`);
    }
    for (const id of modern) await change(page, () => page.locator('#' + id).check());
    const svg = await svgText(page), info = await readSvg(page, svg); layoutFields[layout] = info.fields.sort();
    const direct = await context.request.get(await cardURLFromControls(page));
    assert.equal(direct.status(), 200);
    assert.equal(await direct.text(), svg, `${layout} all-fields canonical server parity`);
    for (const key of ['name', 'handle', 'jobLine', 'location', 'joined', 'teams', 'badges', 'link', 'social']) assert.ok(info.fields.includes(key), `${layout} missing ${key}`);
    assert.ok(info.text.includes('profiles.wp.org/eidolonnight/'));
    assert.ok(info.links.some(l => l.href === 'https://profiles.wp.org/eidolonnight/'));
    for (const badge of profile.badges) assert.equal(info.badges.find(b => b.name === badge.name)?.text.replace(/\s+/g, ''), badge.name.replace(/\s+/g, ''), `${layout} complete label ${badge.name}`);
    assert.ok(info.badges.length >= profile.badges.length, `${layout} badge icons retained`);
    for (const link of info.links) { const u = new URL(link.href); assert.ok(['https:', 'http:'].includes(u.protocol)); assert.equal(u.username, ''); assert.equal(u.password, ''); assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/); assert.match(link.rel, /noreferrer/); }
    assert.ok(info.links.length > 1, 'Public social links included');
    // The identity row must follow name/job and precede location/teams/badges.
    const sequence = await page.evaluate(text => { const d = new DOMParser().parseFromString(text, 'image/svg+xml'); return [...d.querySelectorAll('[data-field]')].map(n => n.dataset.field); }, svg);
    assert.ok(sequence.indexOf('link') > sequence.indexOf('jobLine'));
    assert.ok(sequence.indexOf('link') < sequence.indexOf('teams'));
    assert.ok(Math.abs(sequence.indexOf('link') - sequence.indexOf('handle')) <= 1);
    assert.ok(sequence.indexOf('social') > sequence.indexOf('location'));
    assert.ok(sequence.indexOf('social') < sequence.indexOf('teams'));
    assert.ok(sequence.indexOf('social') < sequence.indexOf('badges'));
    await inspectCardGeometry(context, page, layout);
    for (const format of ['svg', 'png']) {
      const downloading = page.waitForEvent('download'); await page.locator('#download-' + format).click(); const d = await downloading;
      const path = `${evidence}/${layout}-all.${format}`; await d.saveAs(path); const bytes = await readFile(path);
      if (format === 'svg') assert.equal(bytes.toString(), svg);
      else { assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20); assert.ok(w > 0 && h > 0); if (layout === 'square') assert.deepEqual([w, h], [1440, 1440]); }
      report.exports.push({ layout, format, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    await page.locator('#customize-colors summary').click();
    for (const palette of ['light', 'dark']) {
      await change(page, () => page.locator('#preset-' + palette).click());
      const paletteSVG = await svgText(page);
      const linkFill = await page.evaluate(text => new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('[data-field="link"] text').getAttribute('fill'), paletteSVG);
      assert.equal(linkFill.toLowerCase(), (await page.locator('#subHeaderColor').inputValue()).toLowerCase());
      const canonical = await context.request.get(await cardURLFromControls(page));
      assert.equal(canonical.status(), 200); assert.equal(await canonical.text(), paletteSVG);
      if (palette === 'dark') {
        const downloading = page.waitForEvent('download'); await page.locator('#download-png').click(); const d = await downloading;
        const path = `${evidence}/${layout}-all-dark.png`; await d.saveAs(path); const bytes = await readFile(path);
        report.exports.push({ layout, format: 'png', palette, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
    await change(page, () => page.locator('#preset-light').click());
    await page.locator('#customize-colors summary').click();
    await change(page, () => page.locator('#badgeNames').uncheck()); const iconsOnly = await readSvg(page, await svgText(page));
    assert.equal(iconsOnly.badges.length, info.badges.length);
    for (const badge of profile.badges) assert.ok(!iconsOnly.text.includes(badge.name), 'Badge names opt out');
    await change(page, () => page.locator('#social').uncheck());
    assert.equal((await readSvg(page, await svgText(page))).links.length, 1);
    for (const [id, field] of [['name','name'], ['handle','handle'], ['location','location'], ['joined','joined'], ['teams','teams'], ['badges','badges'], ['link','link']]) {
      await change(page, () => page.locator('#' + id).uncheck());
      assert.ok(!(await readSvg(page, await svgText(page))).fields.includes(field), `${layout}/${id} omission`);
      await change(page, () => page.locator('#' + id).check());
    }
    await page.locator('#individual-details').evaluate(n => n.open = true);
    const team = page.locator('#team-options input').first(); assert.ok(await team.count());
    await change(page, () => team.uncheck());
    const remainingTeams = await page.evaluate(text => [...new DOMParser().parseFromString(text, 'image/svg+xml').querySelectorAll('[data-team]')].map(n => n.dataset.team), await svgText(page));
    assert.equal(remainingTeams.length, profile.teams.length - 1); await change(page, () => team.check());
    await page.locator('#individual-details').evaluate(n => n.open = false);
    for (const id of ['badgeNames', 'social']) await change(page, () => page.locator('#' + id).check());
    for (const theme of ['light', 'dark']) {
      await setAppearance(page, theme);
      for (const width of [1440, 390, 320]) await capture(page, `${layout}-${theme}`, width);
    }
    await page.locator('#customize-colors summary').click();
    assert.equal(await page.locator('#background-choose').isVisible(), true);
    await capture(page, `${layout}-customization-dark`, 320);
    await page.locator('#customize-colors summary').click();
  }
  assert.deepEqual(layoutFields.profile, layoutFields.square, 'Modern layouts must offer the same selected content');
  report.checks.push('Landscape/Vertical content parity, individual omissions, short adjacent profile links, optional badge labels, safe linked social icons, real SVG/PNG exports, responsive light/dark axe checks');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const layout of ['avatar', 'announcement']) {
    await change(page, () => page.locator('#layout').selectOption(layout));
    assert.doesNotMatch(await page.locator('.controls').innerText(), /Catalog checked|Faculty Glyphic|Kumbh Sans|Dates and city announced|botanical accents/);
    assert.equal(await page.locator('#event-source').isVisible(), true);
    assert.equal(await page.locator('.about #role-help').innerText(), disclaimer);
  assert.equal(await page.locator('footer #role-help').count(), 0);
    assert.equal(await page.locator('#social').isVisible(), false);
    await capture(page, layout + '-dark', 320);
  }
  report.checks.push('Both WordCamp formats retain working previews, official source links and grouped privacy/participation notices without verbose catalog/style notes');
  await context.close();
  // Shared shell, no-script fallback and blocked preference storage are separate contexts.
  for (const path of ['/', '/create']) for (const scheme of ['light','dark']) {
    const c = await browser.newContext({ javaScriptEnabled: false, colorScheme: scheme, viewport: { width: 320, height: 900 } }); watch(c); const p = await c.newPage(); await navigate(p, path); await p.waitForLoadState('load'); // No scripts exist to hold DOMContentLoaded until the stylesheet is ready.
    assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), scheme === 'dark' ? dark : light);
    assert.equal(await p.locator('#site-theme').isVisible(), false);
    assert.equal(await p.locator('noscript').innerText(), 'JavaScript is needed to build and download a card. Your public profile is still available at profiles.wordpress.org.');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await p.screenshot({ path: `${evidence}/noscript-${path === '/' ? 'home' : 'create'}-${scheme}.png`, fullPage: true }); await c.close();
  }
  const blocked = await browser.newContext({ colorScheme: 'dark' }); watch(blocked);
  await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }); });
  const bp = await blocked.newPage(); await navigate(bp, '/create'); await ready(bp); await bp.locator('#site-theme').click();
  assert.equal(await bp.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), light); await blocked.close();
  const noThemeScript = await browser.newContext({ colorScheme: 'dark' }); watch(noThemeScript); await noThemeScript.route('**/theme.js*', r => r.abort()); const tp = await noThemeScript.newPage(); await navigate(tp); await ready(tp);
  assert.equal(await tp.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), dark); assert.equal(await tp.locator('#site-theme').isVisible(), false); await noThemeScript.close();
  report.checks.push('Both routes have no-JavaScript OS-theme fallback, blocked storage remains functional, and blocked theme enhancement preserves CSS and the builder');
  assert.deepEqual(report.errors, []); assert.deepEqual([...new Set(report.externalOrigins)], []);
  if (report.assetRevision) {
    const requested = new Set(report.browserAssets.map(a => a.path));
    for (const path of staticPaths) if (path !== '/background.js') assert.ok(requested.has(path), 'Missing browser asset ' + path);
    for (const asset of report.browserAssets) assert.equal(asset.query, 'v=' + report.assetRevision, 'Stale or inconsistent browser cache key for ' + asset.path);
    report.checks.push('Actual browser asset requests use one frozen content-derived cache key, including all transitive renderer modules');
  }
  report.pass = true;
} catch (error) {
  report.pass = false; report.failure = error.stack;
  report.failureStates = [];
  for (const p of browser.contexts().flatMap(c => c.pages())) {
    report.failureStates.push(await p.evaluate(() => ({ path: location.pathname, status: document.getElementById('status')?.textContent, empty: document.getElementById('empty-title')?.textContent, exportsDisabled: document.getElementById('exports')?.disabled, imageDecoded: Boolean(document.getElementById('card-preview')?.naturalWidth) })).catch(() => ({ unavailable: true })));
  }
}
finally { await browser.close(); await writeFile(evidence + '/report.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
if (!report.pass) process.exitCode = 1;
