import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4210';
const evidence = process.env.EVIDENCE_DIR;
const baseline = process.env.BASELINE_ONLY === '1';
if (!evidence || !process.env.AXE_PATH) throw new Error('EVIDENCE_DIR and AXE_PATH are required.');
await mkdir(evidence, { recursive: true });
const report = { origin, version: process.env.EXPECTED_VERSION || null, mode: baseline ? 'baseline-only' : 'acceptance', checks: [], views: [], layouts: [], accessibility: [], errors: [], failedResponses: [], externalOrigins: [], sourceHashes: {} };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
context.on('page', page => {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== new URL(origin).origin) report.externalOrigins.push(url.origin);
  });
  page.on('response', response => {
    if (response.status() >= 400) report.failedResponses.push({ path: new URL(response.url()).pathname, status: response.status(), retryAfter: response.headers()['retry-after'] || null });
  });
});
const page = await context.newPage();
const ready = () => page.waitForFunction(() => {
  const img = document.getElementById('card-preview');
  return !document.getElementById('exports').disabled && !img.hidden && img.complete && img.naturalWidth > 0;
}, null, { timeout: 45000 });
const capture = async (state, width) => {
  await page.setViewportSize({ width, height: 1050 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const geometry = await page.evaluate(() => {
    const controls = document.querySelector('.controls'), result = document.querySelector('.result');
    const box = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
    const targets = [...controls.querySelectorAll('button, select, input:not([type="checkbox"]), .check-label, summary')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').map(node => ({ name: node.id || node.textContent.trim(), ...box(node) }));
    return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, controls: box(controls), result: box(result), targets };
  });
  assert.ok(geometry.scroll <= width, `${state}/${width} horizontal overflow`);
  for (const target of geometry.targets) {
    assert.ok(target.width >= 44 && target.height >= 44, `Small target ${target.name}: ${JSON.stringify(target)}`);
    assert.ok(target.x >= geometry.controls.x - 1 && target.right <= geometry.controls.right + 1, `Control outside Step 1: ${target.name}`);
  }
  if (width > 900) assert.ok(geometry.controls.right <= geometry.result.x);
  else assert.ok(geometry.controls.bottom <= geometry.result.y);
  await page.screenshot({ path: `${evidence}/${state}-${width}.png`, fullPage: true });
  report.views.push({ state, width, ...geometry });
  if (!baseline) {
    if (!await page.evaluate(() => Boolean(globalThis.axe))) await page.addScriptTag({ path: process.env.AXE_PATH });
    const issues = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
    report.accessibility.push({ state, width, issues }); assert.deepEqual(issues, []);
  }
};
try {
  for (const path of ['/', '/styles.css', '/app.js', '/background.js']) {
    const response = await context.request.get(origin + path); assert.equal(response.status(), 200);
    report.sourceHashes[path] = createHash('sha256').update(await response.body()).digest('hex');
  }
  const documentResponse = await page.goto(origin);
  assert.equal(documentResponse.status(), 200);
  if (report.version) assert.equal(documentResponse.headers()['x-spacefast-version'], report.version);
  await ready();
  for (const width of [1440, 320]) await capture('default', width);
  await page.setViewportSize({ width: 1440, height: 1050 });
  if (!baseline) {
    assert.doesNotMatch(await page.locator('.controls').innerText(), /Color palette/i);
    assert.deepEqual(await page.locator('.controls #layout, .controls #event-settings, .controls #profile-form, .controls #display-settings, .controls #customize-colors, .controls .background-settings').evaluateAll(nodes => nodes.map(node => node.id || node.className)), ['profile-form', 'layout', 'event-settings', 'display-settings', 'customize-colors', 'background-settings']);
    await page.locator('#username').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'create-button');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'layout');
    await page.locator('#customize-colors summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#preset-light').isVisible(), true);
    await page.keyboard.press('Enter'); assert.equal(await page.locator('#preset-light').isVisible(), false);
    const profileControls = ['avatar', 'name', 'handle', 'jobTitle', 'organization', 'location', 'joined', 'teams', 'badges', 'badgeNames', 'link', 'social'];
    assert.equal(await page.locator('#header').count(), 0);
    assert.equal(await page.locator('#display-settings').evaluate(node => node.tagName), 'FIELDSET');
    assert.equal(await page.locator('#display-settings > legend').innerText(), 'Profile content');
    assert.equal(await page.locator('#profile-fields legend').count(), 0);
    assert.deepEqual(await page.locator('.profile-content-options input[id]:not(#team-options input)').evaluateAll(nodes => nodes.map(node => node.id)), profileControls);
    assert.equal(await page.locator('#profile-fields').evaluate(node => getComputedStyle(node).display), 'contents');
    const grid = await page.locator('.profile-content-options').evaluate(node => ({ display: getComputedStyle(node).display, columns: getComputedStyle(node).gridTemplateColumns.split(' ').length }));
    assert.deepEqual(grid, { display: 'grid', columns: 2 });
    for (const id of profileControls) {
      assert.equal(await page.locator('#' + id).isChecked(), true, `${id} default`);
      assert.equal(await page.locator('#' + id).isEnabled(), true, `${id} enabled`);
    }
    assert.ok(await page.locator('#team-options input').count());
    assert.equal(await page.locator('#team-options input:not(:checked)').count(), 0);
    assert.equal(await page.locator('.about details').count(), 0);
    assert.doesNotMatch(await page.locator('.about').innerText(), /developer|\/card\?|\/json\?/i);
    assert.match(await page.locator('.about').innerText(), /public WordPress\.org profile data/);
    assert.match(await page.locator('.about').innerText(), /processed in your browser, never uploaded or saved/);
    // Clear the dependent badge-name choice before disabling its parent.
    for (const id of [...profileControls].reverse()) await page.locator('#' + id).uncheck();
    await page.waitForFunction(() => document.getElementById('empty-title').textContent === 'Nothing to show on this card.' && document.getElementById('exports').disabled);
    assert.equal(await page.locator('#card-preview').isHidden(), true);
    assert.equal(await page.locator('#card-preview').getAttribute('src'), null);
    assert.equal(await page.locator('#open-preview').getAttribute('href'), null);
    assert.equal(await page.locator('#download-png').isDisabled(), true);
    assert.equal(await page.locator('#download-svg').isDisabled(), true);
    assert.match(await page.locator('#status').innerText(), /All available card content is hidden/);
    for (const id of profileControls) assert.equal(await page.locator('#' + id).isEnabled(), id !== 'badgeNames', id);
    assert.equal(await page.locator('#team-items').evaluate(node => node.disabled), true);
    await page.locator('#link').check(); await ready();
    const linkOnly = await page.locator('#card-preview').evaluate(async image => new DOMParser().parseFromString(await (await fetch(image.src)).text(), 'image/svg+xml').querySelectorAll('[data-field]').length);
    assert.equal(linkOnly, 1);
    for (const id of profileControls) await page.locator('#' + id).check();
    await ready();
    assert.equal(await page.locator('#team-items').evaluate(node => !node.disabled), true);
    report.checks.push('Profile content is a fieldset legend with one two-column grid, all selected defaults and selected teams; individual all-empty guard and link-only recovery work; developer disclosure removed without losing privacy copy');
    const applicable = { profile: profileControls, square: profileControls, classic: ['avatar', 'badges', 'link'], avatar: ['avatar'], announcement: ['avatar', 'name', 'handle', 'eventDetails'] };
    for (const layout of ['profile', 'square', 'classic', 'avatar', 'announcement']) {
      await page.locator('#layout').selectOption(layout); await ready();
      const social = ['avatar', 'announcement'].includes(layout);
      assert.equal(await page.locator('#event-settings').isVisible(), social);
      assert.equal(await page.locator('#profile-fields').evaluate(node => node.hidden), !['profile', 'square', 'announcement'].includes(layout));
      assert.equal(await page.locator('#header').count(), 0);
      for (const id of profileControls) {
        assert.equal(await page.locator('#' + id).isVisible(), applicable[layout].includes(id), `${layout}/${id} visibility`);
        assert.equal(await page.locator('#' + id).isEnabled(), applicable[layout].includes(id), `${layout}/${id} applicability`);
      }
      for (const id of applicable[layout]) assert.equal(await page.locator('#' + id).isChecked(), true, `${layout}/${id} fresh default`);
      assert.equal(await page.locator('#event-controls').evaluate(node => node.disabled), !social);
      if (social) {
        await page.locator('#layout').focus(); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'event');
        await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'role');
        assert.equal(await page.locator('#eventDetails').isVisible(), layout === 'announcement');
        const eventBox = await page.locator('#event-settings').boundingBox(), profileBox = await page.locator('#profile-form').boundingBox();
        assert.ok(profileBox.y + profileBox.height <= eventBox.y);
      }
      await capture(layout, 390); report.layouts.push(layout);
      await page.locator('#avatar').uncheck(); await ready();
      const fields = await page.locator('#card-preview').evaluate(async image => new DOMParser().parseFromString(await (await fetch(image.src)).text(), 'image/svg+xml').querySelectorAll('[data-field="avatar"]').length);
      assert.equal(fields, 0, `${layout} avatar omission`);
    }
    for (const layout of Object.keys(applicable)) {
      await page.locator('#layout').selectOption(layout); await ready();
      for (const id of applicable[layout]) assert.equal(await page.locator('#' + id).isChecked(), id !== 'avatar', `${layout}/${id} persisted choice`);
      await page.locator('#avatar').check(); await ready();
    }
    report.checks.push('All five layouts default every applicable control on; individual avatar omissions affect SVG and persist independently across all five layouts; irrelevant controls remain hidden and disabled');
    await page.goto(origin + '/create?username=eidolonnight&layout=profile&header=false&name=false&badges=false&link=false');
    assert.doesNotMatch(await page.locator('#status').innerText(), /Some URL settings were invalid/);
    await page.locator('#create-button').click(); await ready();
    for (const id of profileControls) assert.equal(await page.locator('#' + id).isChecked(), !['name', 'badges', 'link'].includes(id), `${id} explicit restoration`);
    const restoredFields = await page.locator('#card-preview').evaluate(async image => [...new DOMParser().parseFromString(await (await fetch(image.src)).text(), 'image/svg+xml').querySelectorAll('[data-field]')].map(node => node.getAttribute('data-field')));
    for (const id of ['name', 'badges', 'link']) assert.equal(restoredFields.includes(id), false);
    for (const id of ['avatar', 'handle']) assert.equal(restoredFields.includes(id), true);
    for (const id of profileControls) await page.locator('#' + id).check();
    await ready();
    report.checks.push('Legacy builder header=false is ignored while explicit name=false, badges=false and link=false are restored; WordCamp selectors retain keyboard order');
  }
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
    const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 900, 600);
    gradient.addColorStop(0, '#dbe8df'); gradient.addColorStop(1, '#8da89a'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 900, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#background-file').setInputFiles({ name: 'synthetic-layout-fixture.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') }); await ready();
  await page.locator('#customize-colors summary').click();
  await page.locator('#individual-details summary').click();
  for (const width of baseline ? [1440, 320] : [1440, 1024, 901, 900, 620, 390, 320]) await capture('expanded', width);
  if (!baseline) {
    await page.locator('#background-x').focus(); const old = Number(await page.locator('#background-x').inputValue());
    await page.keyboard.press('ArrowRight'); await ready();
    assert.equal(Number(await page.locator('#background-x').inputValue()), old + 1);
    assert.equal(await page.locator('#background-x-value').textContent(), `${old + 1}%`);
    await page.locator('#background-remove').click(); await ready();
    assert.equal(await page.locator('#background-controls').isHidden(), true);
    assert.equal(await page.locator('#background-file').inputValue(), '');
    report.checks.push('Expanded teams, colors and local-image adjustments fit desktop, breakpoint and narrow-mobile widths with 44px targets and axe A/AA');
    report.checks.push('Background slider keyboard/output behavior and removal still work after regrouping');
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalOrigins, []); assert.deepEqual(report.failedResponses, []);
  if (!baseline) report.pass = true;
} catch (error) {
  report.pass = false; report.failure = error.stack; process.exitCode = 1;
  report.applicationState = await page.evaluate(() => Object.fromEntries(['status', 'empty-title', 'background-status'].map(id => [id, document.getElementById(id)?.textContent ?? null]))).catch(() => null);
}
finally {
  await browser.close();
  await writeFile(evidence + '/control-layout-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ mode: report.mode, pass: report.pass ?? null, checks: report.checks, views: report.views.length, layouts: report.layouts, accessibilityAudits: report.accessibility.length, failure: report.failure ?? null }, null, 2));
}
