import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { assertInitialDemo, assertDownloadedPNG, assertCleanupFailures } from './ui-acceptance.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_ORIGIN || 'http://127.0.0.1:4197';
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('Set EVIDENCE_DIR outside the publish root.');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, ...(process.env.BROWSER_STATE ? { storageState: process.env.BROWSER_STATE } : {}) });
const report = { origin: base, checks: [], errors: [] };
context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
try {
  const page = await context.newPage();
  const traffic = [];
  page.on('request', request => {
    const url = new URL(request.url());
    traffic.push({ origin: url.origin, path: url.pathname });
  });
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
  await assertInitialDemo(page); report.checks.push('externally request-free bundled Matt demo with cached local portrait, blank username, branding, removed controls and export ordering');
  for (const layout of ['profile', 'square', 'avatar', 'announcement']) {
    await page.locator('#layout').selectOption(layout);
    await page.waitForFunction(() => !document.getElementById('exports').disabled && document.getElementById('card-preview').complete && document.getElementById('card-preview').naturalWidth > 0);
  }
  assert.deepEqual(traffic.filter(item => ['/json', '/preview-data', '/card'].includes(item.path)), []);
  assert.deepEqual(traffic.filter(item => item.origin !== new URL(base).origin), []);
  assert.equal(traffic.filter(item => item.path === '/matt-demo-avatar.jpg').length, 1);
  report.checks.push('every bundled-demo layout reuses one cached local portrait without profile, card, WordPress.org or live Gravatar requests');
  const demoWaiting = page.waitForEvent('download'); await page.locator('#download-svg').click(); const demoDownload = await demoWaiting;
  await demoDownload.saveAs(evidence + '/bundled-demo.svg');
  assert.match(await readFile(evidence + '/bundled-demo.svg', 'utf8'), /data:image\/jpeg;base64,/);
  assert.match(await page.locator('#cache-note').innerText(), /Bundled profile snapshot from 2026-11-03; no WordPress\.org request was made/);
  report.checks.push('bundled/not-live disclosure remains visible after demo downloads and other transient status changes');
  await page.locator('#username').fill('matt'); await page.locator('#create-button').click();
  await page.waitForFunction(() => !document.getElementById('exports').disabled && document.getElementById('card-preview').complete && document.getElementById('card-preview').naturalWidth > 0, null, { timeout: 45000 });
  assert.equal(traffic.filter(item => item.path === '/preview-data').length, 1);
  assert.deepEqual(traffic.filter(item => ['/json', '/card'].includes(item.path)), []);
  assert.doesNotMatch(await page.locator('#status').innerText(), /bundled snapshot|Bundled profile snapshot/);
  assert.equal(await page.locator('#username').inputValue(), 'matt');
  report.checks.push('explicit Matt submission leaves the bundled snapshot and uses the normal one-request live lookup path');
  const waiting = page.waitForEvent('download'); await page.locator('#download-png').click(); const download = await waiting;
  assert.match(download.suggestedFilename(), /^matt-.*-announcement\.png$/);
  await download.saveAs(evidence + '/demo.png'); const png = await readFile(evidence + '/demo.png');
  await assertDownloadedPNG(page, png); report.checks.push('actual downloaded PNG signature, dimensions and decoded pixels match the preview');
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (!await page.locator('#customize-colors').evaluate(el => el.open)) await page.locator('#customize-colors summary').click();
    assert.equal(await page.locator('#preset-light').isVisible(), true);
    assert.equal(await page.locator('#preset-dark').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${evidence}/expanded-colors-${width}.png`, fullPage: true });
  }
  report.checks.push('expanded Light/Dark presets remain inside Customize colors at desktop and 320px without overflow');
  if (process.env.AXE_PATH) {
    await page.addScriptTag({ path: process.env.AXE_PATH });
    report.accessibility = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }).then(result => result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))));
    assert.deepEqual(report.accessibility, []); report.checks.push('created-card state axe WCAG A/AA');
  }
  const portraitBytes = await readFile(new URL('../public/matt-demo-avatar.jpg', import.meta.url));
  const validPngBytes = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d'); context.fillStyle = '#3858e9'; context.fillRect(0, 0, 1024, 1024);
    return canvas.toDataURL('image/png').split(',', 2)[1];
  }), 'base64');
  const alternateJpegBytes = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d'); context.fillStyle = '#3858e9'; context.fillRect(0, 0, 1024, 1024);
    return canvas.toDataURL('image/jpeg', 0.9).split(',', 2)[1];
  }), 'base64');
  async function assertPortraitFallback(name, fulfill, verifyInitials = false) {
    const fallback = await context.newPage(), portraitTraffic = [];
    fallback.on('request', request => portraitTraffic.push(new URL(request.url())));
    await fallback.route('**/matt-demo-avatar.jpg*', route => route.fulfill(fulfill));
    await fallback.goto(base);
    await fallback.waitForFunction(() => !document.getElementById('exports').disabled && document.getElementById('card-preview').complete && document.getElementById('card-preview').naturalWidth > 0);
    assert.match(await fallback.locator('#status-warning').innerText(), /bundled portrait could not be loaded, so initials are shown/i);
    assert.equal(portraitTraffic.filter(url => url.pathname === '/matt-demo-avatar.jpg').length, 1);
    assert.deepEqual(portraitTraffic.filter(url => ['/json', '/preview-data', '/card'].includes(url.pathname)), []);
    assert.deepEqual(portraitTraffic.filter(url => url.origin !== new URL(base).origin), []);
    if (verifyInitials) {
      const waiting = fallback.waitForEvent('download'); await fallback.locator('#download-svg').click(); const download = await waiting;
      const output = `${evidence}/${name}.svg`; await download.saveAs(output); const svg = await readFile(output, 'utf8');
      assert.doesNotMatch(svg, /data:image\/jpeg;base64,/); assert.match(svg, />MM<|>M<\/text>\s*<text[^>]*>M</);
    }
    await fallback.close();
  }
  await assertPortraitFallback('missing-portrait', { status: 404, contentType: 'text/plain', body: 'Missing bundled portrait (test)' });
  await assertPortraitFallback('wrong-mime-portrait', { status: 200, contentType: 'image/png', body: portraitBytes });
  await assertPortraitFallback('wrong-format-portrait', { status: 200, contentType: 'image/jpeg', body: validPngBytes }, true);
  await assertPortraitFallback('alternate-jpeg-portrait', { status: 200, contentType: 'image/jpeg', body: alternateJpegBytes }, true);
  await assertPortraitFallback('undersize-portrait', { status: 200, contentType: 'image/jpeg', body: Buffer.alloc(1023, 0x41) });
  await assertPortraitFallback('oversize-portrait', { status: 200, contentType: 'image/jpeg', body: Buffer.alloc(2 * 1024 * 1024 + 1, 0x41) });
  await assertPortraitFallback('corrupt-portrait', { status: 200, contentType: 'image/jpeg', body: Buffer.alloc(2048, 0x41) }, true);
  const stalledPortrait = await context.newPage(), stalledTraffic = []; let releaseStall;
  stalledPortrait.on('request', request => stalledTraffic.push(new URL(request.url())));
  await stalledPortrait.route('**/matt-demo-avatar.jpg*', async route => {
    await new Promise(resolve => { releaseStall = resolve; });
    await route.abort('timedout').catch(() => {});
  });
  const stalledAt = Date.now(); await stalledPortrait.goto(base);
  await stalledPortrait.waitForFunction(() => !document.getElementById('exports').disabled && document.getElementById('card-preview').complete && document.getElementById('card-preview').naturalWidth > 0, null, { timeout: 9000 });
  const stalledMs = Date.now() - stalledAt;
  assert.ok(stalledMs >= 2500 && stalledMs < 6000, `Bundled portrait timeout took ${stalledMs} ms`);
  assert.match(await stalledPortrait.locator('#status-warning').innerText(), /bundled portrait could not be loaded, so initials are shown/i);
  assert.deepEqual(stalledTraffic.filter(url => ['/json', '/preview-data', '/card'].includes(url.pathname)), []);
  assert.deepEqual(stalledTraffic.filter(url => url.origin !== new URL(base).origin), []);
  releaseStall(); await new Promise(resolve => setTimeout(resolve, 50)); await stalledPortrait.close();
  const racePage = await context.newPage(), raceTraffic = []; let releaseRace;
  racePage.on('request', request => raceTraffic.push(new URL(request.url())));
  await racePage.route('**/matt-demo-avatar.jpg*', async route => {
    await new Promise(resolve => { releaseRace = resolve; });
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: portraitBytes }).catch(() => {});
  });
  await racePage.goto(base); await racePage.locator('#username').fill('matt');
  await racePage.locator('#create-button').click();
  await racePage.waitForFunction(() => !document.getElementById('exports').disabled && document.getElementById('card-preview').complete && document.getElementById('card-preview').naturalWidth > 0, null, { timeout: 45000 });
  const liveStatus = await racePage.locator('#status').innerText();
  assert.doesNotMatch(liveStatus, /bundled (?:profile )?snapshot/i); assert.equal(await racePage.locator('#username').inputValue(), 'matt');
  releaseRace(); await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(await racePage.locator('#status').innerText(), liveStatus); assert.equal(await racePage.locator('#username').inputValue(), 'matt');
  assert.equal(raceTraffic.filter(url => url.pathname === '/preview-data').length, 1);
  await racePage.close();
  report.checks.push('missing, wrong-MIME, wrong-format, alternate-JPEG, undersize, oversize, corrupt and stalled portraits fall back to decoded initials without external requests; a late portrait cannot overwrite an explicit live lookup');
  const missingRenderer = await context.newPage(), fallbackTraffic = [];
  missingRenderer.on('request', request => fallbackTraffic.push(new URL(request.url()).pathname));
  await missingRenderer.route('**/preview/preview.js*', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Missing optional module (test)' }));
  await missingRenderer.goto(base);
  await missingRenderer.waitForFunction(() => document.getElementById('status')?.dataset.kind === 'error');
  assert.deepEqual(fallbackTraffic.filter(path => ['/json', '/preview-data', '/card'].includes(path)), []);
  await missingRenderer.close();
  report.checks.push('bundled demo fails closed without a server card request when browser rendering is unavailable');
  await assertCleanupFailures(context, base); report.checks.push('manual shared links, malformed settings, lookup outage recovery, download-only actions, PNG downloads, canvas failure recovery and stale conversion invalidation');
  assert.deepEqual(report.errors, []); report.pass = true;
} catch (error) { report.pass = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(evidence + '/cleanup-browser-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
