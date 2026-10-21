// Focused, offline raster regression. No existing dev adapter or account data.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs EVIDENCE_DIR=/outside/repo node tests/frame-centering-browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { renderSocial } from '../shared/social.js';
import { EVENTS, ROLES } from '../shared/events.js';
import { BROWSER_MODULES, browserModuleSource } from '../tools/browser-modules.mjs';
const modules = new Map(BROWSER_MODULES.map(([source, path]) => [`/${path}`, source]));

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('EVIDENCE_DIR outside hosting is required');
await mkdir(evidence, { recursive: true });
const profile = { name: 'Frame Test', userName: 'frame-test' };
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.end('<!doctype html><title>Offline frame regression</title>'); return; }
  if (!modules.has(req.url)) { res.writeHead(404).end(); return; }
  try {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(browserModuleSource(req.url.slice(1), await readFile(new URL('../' + modules.get(req.url), import.meta.url), 'utf8')));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { tolerance: { radialCenterPx: 1.25, annulus: [400, 526], target: 463, inkAlphaThreshold: 16 }, cases: [], failures: [], pageErrors: [], externalRequests: [] };
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => report.pageErrors.push(e.message));
  page.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== origin) report.externalRequests.push(req.url()); });
  await page.goto(origin);
  await page.evaluate(async () => { window.renderSocial = (await import('/preview/social.js')).renderSocial; });
  for (const event of EVENTS) for (const role of ROLES) {
    const key = `${event.id}-${role.id}`;
    const options = { layout: 'avatar', avatar: false, event: event.id, role: role.id };
    const svg = renderSocial(profile, options);
    assert.equal(await page.evaluate(({ profile, options }) => window.renderSocial(profile, options), { profile, options }), svg, 'browser/server canonical SVG');
    const result = await page.evaluate(async svg => {
      const original = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const raster = async source => {
        const image = new Image();
        const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
        try {
          image.src = url; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1080;
          const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0);
          return { pixels: c.getImageData(0, 0, 1080, 1080).data, png: canvas.toDataURL('image/png') };
        } finally { URL.revokeObjectURL(url); }
      };
      const bands = [];
      for (const field of ['event', 'role']) {
        const isolated = original.cloneNode(true);
        isolated.querySelectorAll('circle, image, [data-decoration]').forEach(n => n.remove());
        isolated.querySelector(`[data-field="${field === 'event' ? 'role' : 'event'}"]`).remove();
        const clipped = await raster(new XMLSerializer().serializeToString(isolated));
        isolated.querySelectorAll('[clip-path]').forEach(n => n.removeAttribute('clip-path'));
        const unclipped = await raster(new XMLSerializer().serializeToString(isolated));
        let min = Infinity, max = -Infinity, count = 0, clippedPixels = 0;
        for (let y = 0; y < 1080; y++) for (let x = 0; x < 1080; x++) {
          const i = (y * 1080 + x) * 4;
          if (clipped.pixels[i + 3] !== unclipped.pixels[i + 3]) clippedPixels++;
          if (clipped.pixels[i + 3] <= 16) continue;
          const r = Math.hypot(x + 0.5 - 540, y + 0.5 - 540);
          min = Math.min(min, r); max = Math.max(max, r); count++;
        }
        const text = original.querySelector(`[data-field="${field}"] text`);
        bands.push({ field, text: text.textContent, size: Number(text.getAttribute('font-size')), min, max, center: (min + max) / 2, innerGap: min - 400, outerGap: 526 - max, count, clippedPixels });
      }
      const full = await raster(svg);
      let outside = 0, inside = 0;
      for (let y = 0; y < 1080; y++) for (let x = 0; x < 1080; x++) {
        if (full.pixels[(y * 1080 + x) * 4 + 3] === 0) continue;
        const r = Math.hypot(x + 0.5 - 540, y + 0.5 - 540);
        // Exclude the one-pixel antialias fringe of the unchanged ring boundary.
        if (r < 399) inside++;
        if (r > 527) outside++;
      }
      const alpha = (x, y) => full.pixels[(y * 1080 + x) * 4 + 3];
      return { bands, inside, outside, centerAlpha: alpha(540, 540), corners: [alpha(0, 0), alpha(1079, 0), alpha(0, 1079), alpha(1079, 1079)], png: full.png };
    }, svg);
    await writeFile(`${evidence}/${key}.svg`, svg);
    await writeFile(`${evidence}/${key}.png`, Buffer.from(result.png.split(',')[1], 'base64'));
    delete result.png;
    report.cases.push({ key, ...result });
    for (const band of result.bands) {
      if (!band.count || Math.abs(band.center - 463) > report.tolerance.radialCenterPx) report.failures.push(`${key}/${band.field}: ink center ${band.center}, expected 463 ± ${report.tolerance.radialCenterPx}`);
      if (band.clippedPixels || band.min <= 400 || band.max >= 526) report.failures.push(`${key}/${band.field}: clipped ink`);
    }
    if (result.inside || result.outside || result.centerAlpha || result.corners.some(Boolean)) report.failures.push(`${key}: transparency changed`);
  }
  assert.equal(new Set(report.cases.map(c => c.key)).size, EVENTS.length * ROLES.length);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.failures, []);
  report.pass = true;
} catch (error) {
  report.pass = false; report.error = error.stack; process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, failures: report.failures, error: report.error }, null, 2));
}
