// Production browser path; real public profiles. Faults/expiry are labeled below.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { selectPalette, cardURLFromControls, assertDownloadOnlyActions } from './ui-acceptance.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_ORIGIN || 'http://127.0.0.1:4197';
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('Set EVIDENCE_DIR outside hosting.');
await mkdir(evidence, { recursive: true });
const report = { origin: base, checks: [], equality: [], errors: [], externalOrigins: [] };
const save = () => writeFile(evidence + '/preview-browser-report.json', JSON.stringify(report, null, 2) + '\n');
const check = async name => { report.checks.push(name); await save(); console.log(name); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
context.on('page', page => {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { const u = new URL(request.url()); if (/^https?:$/.test(u.protocol) && u.origin !== new URL(base).origin) report.externalOrigins.push(u.origin); });
});
const ready = page => page.waitForFunction(() => {
  const image = document.getElementById('card-preview');
  return !document.getElementById('exports').disabled && image.complete && image.naturalWidth > 0;
}, null, { timeout: 45000 });
const requests = page => {
  const result = [];
  page.on('request', request => { const u = new URL(request.url()); if (['/json', '/card', '/preview-data', '/events'].includes(u.pathname)) result.push(u.pathname + u.search); });
  return result;
};
const fresh = async (page, username = 'eidolonnight') => {
  await page.goto(base + '/create?' + new URLSearchParams({ username, layout: 'profile' }));
  await page.locator('#create-button').click();
};
const source = page => page.locator('#card-preview').evaluate(image => fetch(image.src).then(response => response.text()));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const parity = async (page, layout, action) => {
  await assertDownloadOnlyActions(page);
  const url = await cardURLFromControls(page);
  assert.equal(new URL(url).pathname, '/card');
  assert.equal(new URL(url).searchParams.get('layout'), layout);
  const remote = await context.request.get(url); assert.equal(remote.status(), 200);
  const local = await source(page), canonical = await remote.text();
  // Hash first: an assertion failure must not dump embedded font/photo payloads.
  const hash = text => createHash('sha256').update(text).digest('hex');
  assert.equal(hash(local), hash(canonical), `${layout}/${action} SVG bytes differ`);
  report.equality.push({ layout, action, bytes: Buffer.byteLength(local), sha256: hash(local) });
  await save();
};
try {
  const page = await context.newPage(), traffic = requests(page);
  await fresh(page); await ready(page);
  assert.ok(traffic.some(path => path.startsWith('/preview-data?')));
  assert.equal(traffic.filter(path => path.startsWith('/card?')).length, 0);
  for (const layout of ['profile', 'square', 'classic', 'avatar', 'announcement']) {
    await page.locator('#layout').selectOption(layout); await ready(page);
    for (const action of ['dark', 'light', 'hide-avatar', 'show-avatar']) {
      const before = traffic.length;
      if (action.endsWith('avatar')) await page.locator('#avatar').setChecked(action === 'show-avatar');
      else await selectPalette(page, action);
      await ready(page);
      assert.equal(traffic.length, before, `${layout}/${action} made a network request`);
      await parity(page, layout, action);
    }
  }
  assert.equal(report.equality.length, 20);
  assert.deepEqual(traffic.filter(path => path.startsWith('/preview-data?')).map(path => new URL(path, base).searchParams.get('size')), ['320', '1024']);
  await check('20 real-profile SVGs exactly equal canonical /card; warm changes make zero requests; photo variants loaded once each');
  await page.locator('#layout').selectOption('profile'); await ready(page);
  const beforeRapid = traffic.length;
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) {
      const color = document.getElementById('foreground'); color.value = i === 49 ? '#123abc' : '#ffffff'; color.dispatchEvent(new Event('input', { bubbles: true }));
      const avatar = document.getElementById('avatar'); avatar.checked = i % 2 === 1; avatar.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await ready(page); assert.equal(traffic.length, beforeRapid);
  assert.equal(new URL(await cardURLFromControls(page)).searchParams.get('foreground'), '123ABC');
  await parity(page, 'profile', 'rapid-final-selection');
  const modules = await page.evaluate(() => performance.getEntriesByType('resource').map(item => new URL(item.name).pathname).filter(path => path.startsWith('/preview/')));
  assert.equal(new Set(modules).size, modules.length); assert.ok(modules.includes('/preview/fonts.js'));
  await check('rapid changes preserve the last selection and canonical renderer parity with one module/font download per page');
  await page.close();

  // Force a zero remaining TTL on a real response; no clock or latency guessing.
  const expiry = await context.newPage(), expiryTraffic = requests(expiry); let inputCount = 0;
  await expiry.route('**/preview-data?*', async route => {
    const original = await route.fetch(); const data = await original.json(); inputCount++;
    if (inputCount === 1) data.maxAgeMs = 0;
    await route.fulfill({ response: original, json: data });
  });
  await fresh(expiry); await ready(expiry); assert.equal(inputCount, 1);
  await selectPalette(expiry, 'dark'); await ready(expiry); assert.equal(inputCount, 2);
  await selectPalette(expiry, 'light'); await ready(expiry); assert.equal(inputCount, 2);
  assert.equal(expiryTraffic.filter(path => path.startsWith('/card?')).length, 0);
  await expiry.close(); await check('controlled TTL expiry revalidates inputs once, then resumes network-free rendering');

  const race = await context.newPage(), raceTraffic = requests(race);
  const held = deferred(), release = deferred(); let intercepted = false;
  await race.route('**/preview-data?*', async route => {
    if (new URL(route.request().url()).searchParams.get('username') !== 'eidolonnight' || intercepted) return route.continue();
    intercepted = true;
    const original = await route.fetch(); held.resolve(); await release.promise;
    await route.fulfill({ response: original }).catch(() => {}); // Expected when the user aborts the held request.
  });
  await fresh(race); await held.promise;
  await selectPalette(race, 'dark'); await selectPalette(race, 'light');
  assert.equal(raceTraffic.filter(path => path.startsWith('/preview-data?')).length, 1, 'rapid changes must share pending input');
  assert.equal(await race.locator('#exports').evaluate(el => el.disabled), true);
  await race.locator('#username').fill('matt');
  assert.equal(await race.locator('#card-preview').isHidden(), true);
  await race.locator('#create-button').click(); await ready(race);
  const current = await source(race); release.resolve();
  await race.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await source(race), current);
  assert.equal(new URL(await cardURLFromControls(race)).searchParams.get('username'), 'matt');
  assert.ok(current.includes('@matt'), 'ready preview must belong to the newly submitted profile');
  assert.equal(await race.locator('#profile-link').getAttribute('href'), 'https://profiles.wordpress.org/matt/');
  await race.close(); await check('controlled delayed input is coalesced; username switch clears old previews/exports and rejects stale completion');

  // Missing optional delivery surfaces fall back; authorization/errors do not.
  for (const unavailable of ['module', 'endpoint']) {
    const fallback = await context.newPage(), traffic = requests(fallback);
    await fallback.route(unavailable === 'module' ? '**/preview/preview.js*' : '**/preview-data?*', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
    await fresh(fallback); await ready(fallback);
    await selectPalette(fallback, 'dark'); await ready(fallback);
    assert.equal(traffic.filter(path => path.startsWith('/card?')).length, 2);
    await parity(fallback, 'profile', unavailable + '-fallback'); await fallback.close();
  }
  await check('missing browser module or preview-data route falls back to the unchanged server renderer');

  for (const fault of ['401', '403', '429', 'mime', 'syntax', 'interface', 'dependency']) {
    const broken = await context.newPage(), traffic = requests(broken);
    const path = fault === 'dependency' ? '**/preview/options.js*' : '**/preview/preview.js*';
    await broken.route(path, route => {
      if (/^\d+$/.test(fault)) return route.fulfill({ status: Number(fault), contentType: 'text/plain', body: 'Controlled delivery failure' });
      if (fault === 'dependency') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Missing dependency' });
      const body = fault === 'mime' ? '<html>Sign-in required</html>' : fault === 'syntax' ? 'export function {' : 'export const renderPreview = null;';
      return route.fulfill({ status: 200, contentType: fault === 'mime' ? 'text/html' : 'text/javascript', body });
    });
    await fresh(broken);
    await broken.waitForFunction(() => document.getElementById('status').dataset.kind === 'error' || !document.getElementById('exports').disabled, null, { timeout: 45000 });
    assert.equal(await broken.locator('#status').getAttribute('data-kind'), 'error', `module ${fault} must not be hidden by fallback`);
    assert.equal(await broken.locator('#exports').evaluate(el => el.disabled), true);
    assert.equal(traffic.filter(path => path.startsWith('/card?')).length, 0);
    await broken.close();
  }
  await check('module auth/rate-limit/MIME/syntax/interface and missing-dependency errors stay explicit without server fallback');

  const invalid = await context.newPage(), invalidTraffic = requests(invalid);
  let mode = 'unauthorized';
  const actual = await context.request.get(base + '/preview-data?username=eidolonnight&size=320');
  assert.equal(actual.status(), 200); const valid = await actual.json();
  await invalid.route('**/preview-data?*', async route => {
    if (mode === 'unauthorized') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Test access denied' } }) });
    const data = structuredClone(valid);
    if (mode === 'wrong-user') data.profile.userName = 'wrong-user';
    if (mode === 'unsafe-photo') data.avatar.data = 'https://untrusted.invalid/photo.png';
    if (mode === 'unbounded-expiry') data.maxAgeMs = 900001;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await invalid.goto(base + '/create?username=eidolonnight&layout=profile');
  for (const test of ['unauthorized', 'wrong-user', 'unsafe-photo', 'unbounded-expiry']) {
    mode = test; await invalid.locator('#create-button').click();
    await invalid.waitForFunction(() => document.getElementById('status').dataset.kind === 'error');
    assert.equal(await invalid.locator('#exports').evaluate(el => el.disabled), true);
    assert.equal(await invalid.locator('#card-preview').isHidden(), true);
  }
  assert.equal(invalidTraffic.filter(path => path.startsWith('/card?')).length, 0);
  await invalid.unroute('**/preview-data?*'); await invalid.locator('#create-button').click(); await ready(invalid);
  await invalid.close(); await check('authorization failure, wrong profile, unsafe image and unbounded TTL fail closed and recover on retry');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalOrigins, []);
  assert.equal(report.equality.length, 23); report.pass = true;
} catch (error) { report.pass = false; report.failure = error.stack; process.exitCode = 1; }
finally { await browser.close(); await save(); console.log(JSON.stringify({ pass: report.pass, checks: report.checks, equalityCases: report.equality.length, errors: report.errors, failure: report.failure }, null, 2)); }
