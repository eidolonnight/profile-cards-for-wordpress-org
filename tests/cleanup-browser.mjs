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
  assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
  await assertInitialDemo(page); report.checks.push('real matt demo, blank username, branding, removed controls and export ordering');
  const waiting = page.waitForEvent('download'); await page.locator('#download-png').click(); const download = await waiting;
  assert.equal(download.suggestedFilename(), 'matt-profile.png');
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
    assert.deepEqual(report.accessibility, []); report.checks.push('demo state axe WCAG A/AA');
  }
  await assertCleanupFailures(context, base); report.checks.push('manual shared links, malformed settings, demo outage recovery, download-only actions, PNG downloads, canvas failure recovery and stale conversion invalidation');
  assert.deepEqual(report.errors, []); report.pass = true;
} catch (error) { report.pass = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(evidence + '/cleanup-browser-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
