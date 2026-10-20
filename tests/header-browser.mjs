import assert from 'node:assert/strict';
import { cardURLFromControls, selectPalette, assertInitialDemo, assertDownloadedPNG } from './ui-acceptance.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom/worker';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_ORIGIN || 'http://127.0.0.1:4197';
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('EVIDENCE_DIR outside hosting is required.');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true, ...(process.env.BROWSER_STATE ? { storageState: process.env.BROWSER_STATE } : {}) });
const report = { origin: base, checks: [], errors: [], externalOrigins: [], documentVersions: [] };
context.on('page', page => {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { const u = new URL(request.url()); if (/^https?:$/.test(u.protocol) && u.origin !== new URL(base).origin) report.externalOrigins.push(u.origin); });
  page.on('response', response => { if (response.request().isNavigationRequest() && response.status() === 200 && new URL(response.url()).origin === new URL(base).origin) report.documentVersions.push(response.headers()['x-spacefast-version'] || null); });
});
const page = await context.newPage();
const ready = () => page.waitForFunction(() => !document.getElementById('exports').disabled && document.getElementById('card-preview').complete && document.getElementById('card-preview').naturalWidth > 0, null, { timeout: 45000 });
const preview = async () => { await ready(); return page.locator('#card-preview').evaluate(async image => (await fetch(image.src)).text()); };
const check = name => report.checks.push(name);
const overflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows horizontally');
const download = async (selector, filename) => { const waiting = page.waitForEvent('download'); await page.locator(selector).click(); const item = await waiting; await item.saveAs(evidence + '/' + filename); return readFile(evidence + '/' + filename); };
try {
  for (const omission of ['x'.repeat(81), 'Core,,Meta', Array.from({ length: 41 }, (_, i) => `Team${i}`).join(','), 'Core\u0085Meta']) {
    await page.goto(base + '/create?' + new URLSearchParams({ username: 'eidolonnight', layout: 'profile', omitTeams: omission }));
    assert.match(await page.locator('#status').innerText(), /Some URL settings were invalid/, 'malformed team omissions must not be reported as restored');
  }
  check('malformed team omissions are rejected during builder restoration');
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
  await assertInitialDemo(page); check('live matt demo is labeled while username stays blank');
  assert.equal(await page.locator('#layout').inputValue(), 'profile');
  assert.equal(await page.locator('#layout option:checked').innerText(), 'Landscape banner');
  assert.equal(await page.locator('#display-settings > legend').count(), 1);
  assert.equal(await page.locator('#profile-fields legend').count(), 0);
  assert.equal(await page.locator('#display-settings > legend').innerText(), 'Profile content');
  assert.equal(await page.locator('#header').count(), 0);
  assert.equal(await page.locator('.about details').count(), 0);
  assert.match(await page.locator('.about').innerText(), /processed in your browser, never uploaded or saved/);
  const profileControls = ['avatar', 'name', 'handle', 'jobTitle', 'organization', 'location', 'joined', 'teams', 'badges', 'link'];
  for (const id of profileControls) assert.equal(await page.locator('.profile-content-options #' + id).isChecked(), true, id);
  assert.equal(await page.locator('#username').inputValue(), '');
  await page.locator('#username').fill('eidolonnight'); await page.locator('#create-button').click(); await ready();
  const response = await context.request.get(base + '/json?username=eidolonnight'); assert.equal(response.status(), 200); const profile = await response.json();
  assert.equal(profile.userName, 'eidolonnight'); assert.ok(profile.jobTitle && profile.organization && profile.location && profile.joined && profile.userId);
  assert.ok(profile.teams.length);
  const initialSVG = await preview(); const initial = parseHTML(initialSVG).document;
  assert.equal(initial.querySelector('svg').getAttribute('data-layout'), 'profile');
  assert.equal(initial.querySelectorAll('[data-team]').length, profile.teams.length); assert.equal(initial.querySelectorAll('[data-social]').length, 0);
  assert.equal(initial.querySelector('[data-field="jobLine"]').textContent, profile.jobTitle + ' at ' + profile.organization);
  assert.equal(initial.querySelector('[data-field="location"]').textContent, profile.location);
  assert.equal(initial.querySelectorAll('[data-field="userId"],[data-field="website"],[data-field="github"],[data-field="slack"],[data-field="social"]').length, 0);
  assert.equal(initial.querySelectorAll('a').length, 1); assert.equal(initial.querySelector('a').getAttribute('href'), 'https://profiles.wordpress.org/eidolonnight/');
  assert.equal(initial.querySelectorAll('[data-field="badges"]').length, profile.badges.length);
  assert.equal(await page.locator('#userId,#website,#github,#slack,#social,#social-items,#linkColor').count(), 0);
  assert.equal(await page.locator('#link').isVisible(), true); assert.equal(await page.locator('#link').isDisabled(), false);
  const avatar = initial.querySelector('[data-field="avatar"] image'); assert.ok(avatar, 'live profile photo must be embedded');
  assert.ok(Number(avatar.getAttribute('width')) > 0); assert.equal(avatar.getAttribute('width'), avatar.getAttribute('height'));
  const initialAvatarSize = Number(avatar.getAttribute('width'));
  report.avatar = await page.evaluate(src => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = reject; image.src = src; }), avatar.getAttribute('href'));
  assert.deepEqual(report.avatar, { width: 320, height: 320 });
  check('Landscape keeps profile details, excludes obsolete social/ID controls, and offers the optional public profile link in one content section');
  report.layout = [];
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 1050 }); await overflow();
    const controls = await page.locator('.controls').boundingBox(), result = await page.locator('.result').boundingBox();
    assert.ok(result.x >= controls.x + controls.width); assert.ok(Math.abs(result.y - controls.y) < 1);
    assert.ok(await page.locator('.controls #display-settings').count()); assert.ok(await page.locator('.controls #customize-colors').count());
    report.layout.push({ width, columns: 2 });
  }
  check('desktop builder has controls on the left and preview on the right');
  await page.screenshot({ path: evidence + '/desktop-light.png', fullPage: true }); await overflow();
  const svg = await download('#download-svg', 'header-light.svg'); assert.equal(svg.toString(), initialSVG);
  const png = await download('#download-png', 'header-light.png'); assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(png.readUInt32BE(16), Number(initial.querySelector('svg').getAttribute('width')) * 2);
  report.png = { bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: createHash('sha256').update(png).digest('hex') };
  await assertDownloadedPNG(page, png);
  check('self-contained header SVG and full-resolution PNG downloads match the preview');
  const cardURL = await cardURLFromControls(page); assert.equal(new URL(cardURL).searchParams.get('layout'), 'profile');
  const direct = await context.newPage(); const directResponse = await direct.goto(cardURL, { waitUntil: 'networkidle' }); assert.equal(directResponse.status(), 200);
  await direct.evaluate(() => document.fonts.ready);
  const typography = await direct.evaluate(() => ({ faces: [...document.fonts].map(f => ({ family: f.family, status: f.status })), garamond: document.fonts.check('500 88px "Card Garamond"'), inter: document.fonts.check('400 24px "Card Inter"') }));
  assert.ok(typography.garamond && typography.inter); assert.ok(typography.faces.every(f => f.status === 'loaded'));
  const bounds = await direct.evaluate(() => { const svg = document.querySelector('svg'); const width = svg.viewBox.baseVal.width; const height = svg.viewBox.baseVal.height; return [...svg.querySelectorAll('text')].map(el => { const b = el.getBBox(), m = el.getCTM(); const a = new DOMPoint(b.x, b.y).matrixTransform(m), z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m); return { text: el.textContent, left: a.x, top: a.y, right: z.x, bottom: z.y, width, height }; }).filter(b => b.left < -1 || b.top < -1 || b.right > b.width + 1 || b.bottom > b.height + 1); });
  assert.deepEqual(bounds, []); report.typography = typography;
  await direct.setViewportSize({ width: Number(initial.querySelector('svg').getAttribute('width')), height: Number(initial.querySelector('svg').getAttribute('height')) });
  await direct.screenshot({ path: evidence + '/card-light.png' }); await direct.close();
  check('direct card URL loads embedded Garamond/Inter under CSP and text stays within SVG bounds');
  assert.equal(initialAvatarSize, Number(initial.querySelector('[data-profile-text]').getAttribute('data-text-height')));
  report.avatarLayoutHeight = initialAvatarSize;
  const popupEvent = context.waitForEvent('page'); await page.locator('#open-preview').click(); const popup = await popupEvent; await popup.waitForLoadState(); assert.ok((await popup.locator('svg').textContent()).includes(profile.name)); await popup.close();
  for (const key of ['avatar', 'name', 'handle', 'location', 'joined', 'teams']) {
    await page.locator('#' + key).uncheck(); const hidden = parseHTML(await preview()).document; assert.equal(hidden.querySelectorAll(`[data-field="${key}"]`).length, 0, key);
    await page.locator('#' + key).check(); await ready();
  }
  await page.locator('#jobTitle').uncheck(); assert.equal(parseHTML(await preview()).document.querySelector('[data-field="jobLine"]').textContent, profile.organization); await page.locator('#jobTitle').check(); await ready();
  await page.locator('#organization').uncheck(); assert.equal(parseHTML(await preview()).document.querySelector('[data-field="jobLine"]').textContent, profile.jobTitle); await page.locator('#organization').check(); await ready();
  await page.locator('#jobTitle').uncheck(); await page.locator('#organization').uncheck(); assert.equal(parseHTML(await preview()).document.querySelector('[data-field="jobLine"]'), null); await page.locator('#jobTitle').check(); await page.locator('#organization').check(); await ready();
  await page.locator('#badges').uncheck(); assert.equal(parseHTML(await preview()).document.querySelector('[data-field="badges"]'), null);
  await page.locator('#badges').check();
  const badgeDoc = parseHTML(await preview()).document;
  assert.equal(badgeDoc.querySelectorAll('[data-field="badges"]').length, profile.badges.length);
  assert.equal(badgeDoc.querySelectorAll('[data-field="badges"] text').length, 0);
  assert.deepEqual([...badgeDoc.querySelectorAll('[data-field="badges"] title')].map(el => el.textContent), profile.badges.map(badge => badge.name));
  await page.locator('#link').uncheck(); assert.equal(parseHTML(await preview()).document.querySelector('a'), null);
  await page.locator('#link').check();
  const linked = parseHTML(await preview()).document;
  assert.equal(linked.querySelectorAll('a').length, 1); assert.equal(linked.querySelector('a').getAttribute('href'), 'https://profiles.wordpress.org/eidolonnight/');
  assert.equal(linked.querySelector('[data-field="link"] text').getAttribute('fill'), '#50575E');
  await download('#download-png', 'landscape-icons-link.png');
  await download('#download-svg', 'landscape-icons-link.svg');
  await selectPalette(page, 'dark');
  assert.equal(parseHTML(await preview()).document.querySelector('[data-field="link"] text').getAttribute('fill'), '#C3C4C7');
  await download('#download-png', 'landscape-icons-link-dark.png');
  await selectPalette(page, 'light'); await ready();
  const iconsURL = await cardURLFromControls(page);
  const iconsPage = await context.newPage(); await iconsPage.goto(iconsURL); await iconsPage.evaluate(() => document.fonts.ready);
  report.badgeGeometry = await iconsPage.evaluate(() => [...document.querySelectorAll('[data-field="badges"]')].map(el => { const b = el.getBBox(), m = el.getCTM(); const top = new DOMPoint(b.x,b.y).matrixTransform(m), bottom = new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(m); const origin = new DOMPoint(0,0).matrixTransform(m); return { x:top.x,y:top.y,width:bottom.x-top.x,height:bottom.y-top.y,originY:origin.y }; }));
  // Different glyphs have different painted bounds; their icon cells share a row.
  assert.equal(new Set(report.badgeGeometry.map(b => Math.round(b.originY))).size, 1);
  assert.ok(report.badgeGeometry.every((b,i,a) => b.width <= 48 && b.height <= 48 && (i===0 || b.x >= a[i-1].x+a[i-1].width)));
  await iconsPage.close();
  await page.locator('#link').uncheck(); await page.locator('#badges').uncheck(); assert.equal(parseHTML(await preview()).document.querySelector('[data-field="badges"]'), null);
  for (const id of ['jobTitle','organization','handle','location','joined','teams']) await page.locator('#'+id).uncheck();
  const compact = parseHTML(await preview()).document; assert.ok(Number(compact.querySelector('[data-field="avatar"] image').getAttribute('width')) < initialAvatarSize, 'avatar shrinks when visible text is reduced');
  assert.equal(Number(compact.querySelector('[data-field="avatar"] image').getAttribute('height')), Number(compact.querySelector('[data-profile-text]').getAttribute('data-text-height')));
  await download('#download-png', 'landscape-name-only.png');
  for (const id of ['jobTitle','organization','handle','location','joined','teams']) await page.locator('#'+id).check(); await ready();
  check('every individual header component checkbox changes the actual SVG');
  // Exercise actual per-item controls rather than relying on generated IDs.
  const teamInput = page.locator('#team-options input').first();
  assert.ok(await teamInput.count());
  if (!(await teamInput.isVisible())) await teamInput.evaluate(el => { for (let node = el.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true; });
  report.itemControls = [];
  for (const [container, attribute, values] of [['team-options', 'data-team', profile.teams]]) {
    const inputs = page.locator(`#${container} input`); assert.equal(await inputs.count(), values.length);
    for (let i = 0; i < values.length; i++) {
      const input = inputs.nth(i); const value = await input.inputValue(); assert.equal(value, values[i]); assert.equal(await input.isChecked(), true, 'individual teams default selected');
      await input.uncheck(); const remaining = [...parseHTML(await preview()).document.querySelectorAll(`[${attribute}]`)].map(el => el.getAttribute(attribute)); assert.deepEqual(remaining, values.filter(item => item !== value));
      await input.check(); await ready(); report.itemControls.push({ container, value, pass: true });
    }
  }
  check('every individual team checkbox omits exactly its selected item');
  const omittedTeam = await teamInput.inputValue(); await teamInput.uncheck(); assert.equal(parseHTML(await preview()).document.querySelectorAll('[data-team]').length, profile.teams.length - 1);
  await selectPalette(page, 'dark'); await ready();
  const builderURL = new URL(await cardURLFromControls(page)); builderURL.pathname = '/create'; const parameters = builderURL.searchParams;
  assert.equal(parameters.get('layout'), 'profile'); assert.ok(parameters.get('omitTeams').split(',').includes(omittedTeam)); assert.equal(parameters.get('foreground'), '191E23'); assert.equal(parameters.get('link'),'false'); for (const key of ['userId', 'website', 'github', 'slack', 'social', 'omitSocial', 'linkColor']) assert.equal(parameters.has(key), false, key);
  await page.goto(builderURL.href); await page.locator('#create-button').click(); const restored = parseHTML(await preview()).document; assert.equal(restored.querySelectorAll('[data-team]').length, profile.teams.length - 1); assert.equal(restored.querySelectorAll('[data-social]').length, 0); assert.equal(restored.querySelector('svg > rect').getAttribute('fill'), '#191E23');
  await page.locator('#create-button').click(); const lookedUpAgain = parseHTML(await preview()).document; assert.equal(lookedUpAgain.querySelectorAll('[data-team]').length, profile.teams.length - 1); assert.equal(lookedUpAgain.querySelectorAll('[data-social]').length, 0);
  check('team omissions and dark theme survive explicit builder URLs without removed fields');
  for (const layout of ['square', 'classic']) {
    await page.locator('#layout').selectOption(layout); await ready();
    const url = await cardURLFromControls(page);
    assert.equal(new URL(url).searchParams.has('omitTeams'), false);
    const response = await context.request.get(url); assert.equal(response.status(), 200);
    assert.equal(createHash('sha256').update(await preview()).digest('hex'), createHash('sha256').update(await response.text()).digest('hex'), `${layout} preview must match the canonical URL without Landscape omissions`);
  }
  await page.locator('#layout').selectOption('profile');
  assert.equal(parseHTML(await preview()).document.querySelectorAll('[data-team]').length, profile.teams.length - 1);
  check('team omissions stay local to Landscape and survive switching away and back');
  await page.screenshot({ path: evidence + '/desktop-dark.png', fullPage: true }); await download('#download-png', 'header-dark.png');
  for (const width of [768, 390, 320]) { await page.setViewportSize({ width, height: 844 }); await overflow(); const c = await page.locator('.controls').boundingBox(), r = await page.locator('.result').boundingBox(); assert.ok(r.y >= c.y + c.height); assert.ok(Math.abs(r.x - c.x) < 1); report.layout.push({ width, columns: 1 }); await page.screenshot({ path: evidence + `/mobile-${width}.png`, fullPage: true }); }
  check('two columns at 1440/1024px, mobile stacking at 768/390/320px, with no overflow');
  if (process.env.AXE_PATH) { await page.addScriptTag({ path: process.env.AXE_PATH }); const results = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })); report.accessibility = results.violations.map(v => ({ id: v.id, help: v.help, nodes: v.nodes.map(n => n.target) })); assert.deepEqual(report.accessibility, []); check('mobile axe A/AA accessibility audit'); }
  for (const id of profileControls) await page.locator('#' + id).uncheck();
  await page.waitForFunction(() => document.getElementById('exports').disabled && document.getElementById('empty-title').textContent === 'Nothing to show on this card.');
  assert.equal(await page.locator('#card-preview').isHidden(), true); assert.equal(await page.locator('#card-preview').getAttribute('src'), null);
  assert.match(await page.locator('#status').innerText(), /All available card content is hidden/);
  for (const id of ['download-png', 'download-svg']) assert.equal(await page.locator('#' + id).isDisabled(), true);
  await page.locator('#link').check();
  const linkOnly = parseHTML(await preview()).document;
  assert.equal(linkOnly.querySelectorAll('[data-field]').length, 1); assert.equal(linkOnly.querySelectorAll('[data-field="link"] a').length, 1);
  assert.equal(linkOnly.querySelector('a').getAttribute('href'), 'https://profiles.wordpress.org/eidolonnight/');
  for (const id of profileControls) await page.locator('#' + id).check(); await ready();
  check('individually hiding all Landscape content clears stale preview and exports; link alone recovers, then every control can be restored');
  const emptyResponse = await context.request.get(base + '/card?username=eidolonnight&layout=profile&header=false'); assert.equal(emptyResponse.status(), 200); assert.equal(parseHTML(await emptyResponse.text()).document.querySelectorAll('[data-field]').length, 0);
  const apiLinkResponse = await context.request.get(base + '/card?username=eidolonnight&layout=profile&header=false&link=true'); assert.equal(apiLinkResponse.status(), 200);
  const apiLink = parseHTML(await apiLinkResponse.text()).document;
  assert.equal(apiLink.querySelectorAll('[data-field]').length, 1); assert.ok(apiLink.querySelector('[data-field="link"] a'));
  const apiDefaultResponse = await context.request.get(base + '/card?username=eidolonnight&layout=profile'); assert.equal(apiDefaultResponse.status(), 200);
  const apiDefault = parseHTML(await apiDefaultResponse.text()).document;
  assert.ok(apiDefault.querySelector('[data-field="name"]')); assert.equal(apiDefault.querySelectorAll('[data-field="badges"],[data-field="link"]').length, 0);
  check('direct /card retains header=false, independent link=true, and legacy badge/link defaults');
  const old = new URL('/create?username=eidolonnight&layout=profile&header=false&link=true&userId=true&website=true&github=true&slack=true&social=true&omitSocial=twitter&linkColor=3858E9', base);
  await page.goto(old.href); await page.locator('#create-button').click();
  const legacy = parseHTML(await preview()).document;
  for (const id of profileControls) assert.equal(await page.locator('#' + id).isChecked(), true, `${id} legacy builder default`);
  for (const field of ['avatar', 'name', 'handle', 'link']) assert.ok(legacy.querySelector(`[data-field="${field}"]`), field);
  assert.equal(legacy.querySelectorAll('[data-field="badges"]').length, profile.badges.length);
  assert.equal(legacy.querySelectorAll('[data-field="userId"],[data-field="website"],[data-field="github"],[data-field="slack"],[data-field="social"]').length, 0);
  check('legacy builder header=false no longer hides profile fields; old social/ID flags still cannot restore removed fields');
  for (const query of ['header=invalid', 'header=', 'header=FALSE', 'header=false&header=false', 'header=true&header=false']) {
    await page.goto(base + '/create?username=eidolonnight&layout=profile&' + query);
    assert.match(await page.locator('#status').innerText(), /Some URL settings were invalid/, query);
    const invalid = await context.request.get(base + '/card?username=eidolonnight&layout=profile&' + query); assert.equal(invalid.status(), 400, query);
  }
  check('invalid header booleans and duplicate header parameters remain rejected by builder and API');
  await page.goto(base + '/create?username=eidolonnight&badges=true'); assert.equal(await page.locator('#layout').inputValue(), 'classic'); await page.locator('#create-button').click(); assert.equal(parseHTML(await preview()).document.querySelector('svg').getAttribute('width'), '720'); assert.equal(await page.locator('#link').isVisible(), true); await page.locator('#link').check(); assert.ok(parseHTML(await preview()).document.querySelector('a')); check('old builder links and classic profile-link control remain compatible');
  assert.deepEqual(report.errors, []); assert.deepEqual([...new Set(report.externalOrigins)], []);
  if (process.env.EXPECTED_VERSION) assert.ok(report.documentVersions.length && report.documentVersions.every(v => v === process.env.EXPECTED_VERSION));
  report.pass = true;
} catch (error) { report.pass = false; report.failure = error.message; process.exitCode = 1; }
finally { await writeFile(evidence + '/header-browser-report.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify(report, null, 2)); }
