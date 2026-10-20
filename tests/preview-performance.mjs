// Measure actual option-to-decoded-preview latency; no synthetic network delays.
import assert from 'node:assert/strict';
import { assertDownloadOnlyActions } from './ui-acceptance.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_ORIGIN || 'http://127.0.0.1:4197';
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('Set EVIDENCE_DIR outside hosting.');
await mkdir(evidence, { recursive: true });
const report = { origin: base, measuredAt: new Date().toISOString(), samples: [], errors: [] };
const save = () => writeFile(evidence + '/preview-performance.json', JSON.stringify(report, null, 2) + '\n');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  // Optional local frontend override keeps before/after on the same real hosted
  // backend without publishing the candidate. Report this distinction explicitly.
  if (process.env.PREVIEW_SOURCE_DIR) {
    report.clientOverrides = [];
    for (const [routePath, file, contentType] of [['/', 'index.html', 'text/html'], ['/app.js', 'app.js', 'text/javascript']]) {
      const bytes = await readFile(path.join(process.env.PREVIEW_SOURCE_DIR, file));
      report.clientOverrides.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
      await page.route(new URL(routePath, base).href, async route => {
        const original = await route.fetch();
        await route.fulfill({ response: original, body: bytes, contentType });
      });
    }
  }
  page.on('pageerror', error => report.errors.push(error.message));
  const ready = () => page.waitForFunction(() => {
    const image = document.getElementById('card-preview');
    return !document.getElementById('exports').disabled && image.complete && image.naturalWidth > 0;
  }, null, { timeout: 45000 });
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200); report.version = response.headers()['x-spacefast-version'] || null;
  await ready();
  await assertDownloadOnlyActions(page);
  report.heading = await page.evaluate(() => {
    const el = document.querySelector('h1');
    if (!el) return null; // The page-title heading was intentionally removed.
    const css = getComputedStyle(el);
    return { text: el.textContent, fontFamily: css.fontFamily, fontSize: css.fontSize, fontWeight: css.fontWeight, lineHeight: css.lineHeight, letterSpacing: css.letterSpacing, color: css.color };
  });
  await page.locator('#username').fill('eidolonnight');
  await page.locator('#create-button').click(); await ready();
  if (!await page.locator('.palette-settings details').evaluate(el => el.open)) await page.locator('.palette-settings summary').click();
  // Also time inside the browser, excluding Playwright scrolling/actionability
  // and protocol overhead. Keep the original wall-time series for comparison.
  await page.evaluate(() => {
    const image = document.getElementById('card-preview');
    const start = event => {
      if ((event.type === 'click' && event.target.closest('#preset-light, #preset-dark')) || (event.type === 'change' && event.target.id === 'avatar')) {
        window.__previewMeasurement = { start: performance.now() };
      }
    };
    document.addEventListener('click', start, true);
    document.addEventListener('change', start, true);
    new MutationObserver(() => {
      const current = window.__previewMeasurement, src = image.getAttribute('src');
      if (!current || !src) return;
      image.decode().then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (current === window.__previewMeasurement && src === image.getAttribute('src')) current.elapsedMs = performance.now() - current.start;
      }))).catch(() => {});
    }).observe(image, { attributes: true, attributeFilter: ['src'] });
  });
  for (const layout of ['profile', 'square', 'avatar', 'announcement']) {
    if (await page.locator('#layout').inputValue() !== layout) { await page.locator('#layout').selectOption(layout); await ready(); }
    for (const action of ['dark', 'light', 'hide-avatar', 'show-avatar']) {
      const previous = await page.locator('#card-preview').getAttribute('src');
      await page.evaluate(() => performance.clearResourceTimings());
      const started = performance.now();
      if (action.endsWith('avatar')) await page.locator('#avatar').setChecked(action === 'show-avatar');
      else await page.locator('#preset-' + action).click();
      await ready();
      await page.waitForFunction(old => document.getElementById('card-preview').src !== old, previous);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const elapsedMs = performance.now() - started;
      await page.waitForFunction(() => Number.isFinite(window.__previewMeasurement?.elapsedMs));
      const interactionMs = await page.evaluate(() => window.__previewMeasurement.elapsedMs);
      const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => {
        const url = new URL(entry.name); return url.origin === location.origin && (['/json', '/card', '/events', '/preview-data'].includes(url.pathname) || url.pathname.startsWith('/preview/'));
      }).map(entry => ({ path: new URL(entry.name).pathname, durationMs: entry.duration, ttfbMs: entry.responseStart - entry.requestStart, bodyMs: entry.responseEnd - entry.responseStart, transferBytes: entry.transferSize, decodedBytes: entry.decodedBodySize })));
      report.samples.push({ layout, action, elapsedMs, interactionMs, resources });
      await save();
      console.log(JSON.stringify({ layout, action, elapsedMs: Math.round(elapsedMs), interactionMs: Math.round(interactionMs), requests: resources.length }));
    }
  }
  assert.equal(report.samples.length, 16);
  assert.deepEqual(report.errors, []);
  const sorted = report.samples.map(item => item.elapsedMs).sort((a, b) => a - b);
  const native = report.samples.map(item => item.interactionMs).sort((a, b) => a - b);
  report.summary = { samples: sorted.length, medianMs: (sorted[7] + sorted[8]) / 2, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], requests: report.samples.reduce((sum, item) => sum + item.resources.length, 0), transferredBytes: report.samples.flatMap(item => item.resources).reduce((sum, item) => sum + item.transferBytes, 0) };
  report.summary.medianInteractionMs = (native[7] + native[8]) / 2;
  report.summary.p95InteractionMs = native[Math.ceil(native.length * 0.95) - 1];
  if (process.env.EXPECT_LOCAL_RENDER === '1') assert.equal(report.summary.requests, 0, 'Warm option changes must not fetch new inputs or SVGs');
  report.pass = true;
  console.log(JSON.stringify(report.summary));
} catch (error) { report.pass = false; report.failure = error.stack; process.exitCode = 1; }
finally { await browser.close(); await save(); }
