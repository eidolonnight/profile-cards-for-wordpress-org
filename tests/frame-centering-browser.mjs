// Focused, offline raster regression. No existing dev adapter or account data.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs EVIDENCE_DIR=/outside/repo node tests/frame-centering-browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { renderSocial } from '../shared/social.js';
import { EVENTS, ROLES } from '../shared/events.js';
import { EVENT_FRAMES } from '../events/frames.js';
import { drawFrame } from '../tools/draw-event-frames.mjs';
import { eventFrameData } from './frame-artwork.mjs';
import { BROWSER_MODULES, FRAME_FILES, browserModuleSource } from '../tools/browser-modules.mjs';
const modules = new Map(BROWSER_MODULES.map(([source, path]) => [`/${path}`, source]));
// The page's own loader fetches the published PNG files, as the builder does.
const published = new Map(FRAME_FILES.map(([source, path]) => [`/${path}`, source]));

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('EVIDENCE_DIR outside hosting is required');
await mkdir(evidence, { recursive: true });
const profile = { name: 'Frame Test', userName: 'frame-test' };
// Every avatar frame is PNG artwork: its raster contract is one photo window and no
// other transparency, cropped to the inscribed circle unless square is requested.
const artwork = Object.entries(EVENT_FRAMES).flatMap(([event, frames]) => Object.keys(frames.roles).map(role => ({ event, role, photo: frames.photo })));
// The project's own interim frames are drawn offline with measurable vector lettering.
const interim = [];
for (const folder of ['wordcamp-asia', 'wordcamp-europe', 'wordcamp-india']) {
  let manifest;
  try { manifest = JSON.parse(await readFile(new URL(`../events/${folder}/frames/manifest.json`, import.meta.url), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (!/^Interim frames drawn by this project/.test(manifest.source)) continue;
  for (const [event, entry] of Object.entries(manifest.editions)) for (const [role, path] of Object.entries(entry.roles)) {
    interim.push({ event, role, png: (await readFile(new URL(`../events/${folder}/frames/${path}`, import.meta.url))).toString('base64') });
  }
}
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.end('<!doctype html><title>Offline frame regression</title>'); return; }
  const { pathname } = new URL(req.url, 'http://127.0.0.1');
  if (published.has(pathname)) {
    try { res.setHeader('Content-Type', 'image/png'); res.end(await readFile(new URL('../' + published.get(pathname), import.meta.url))); }
    catch { res.writeHead(500).end(); }
    return;
  }
  if (!modules.has(req.url)) { res.writeHead(404).end(); return; }
  try {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(browserModuleSource(req.url.slice(1), await readFile(new URL('../' + modules.get(req.url), import.meta.url), 'utf8')));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { tolerance: { radialCenterPx: 1.25, annulus: [400, 526], target: 463, inkAlphaThreshold: 16, committedDifferenceShare: 0.005 }, cases: [], failures: [], pageErrors: [], externalRequests: [] };
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => report.pageErrors.push(e.message));
  page.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== origin) report.externalRequests.push(req.url()); });
  await page.goto(origin);
  await page.evaluate(async () => { window.renderSocial = (await import('/preview/social.js')).renderSocial; });
  for (const { event, role, png } of interim) {
    const key = `${event}-${role}-lettering`;
    const svg = drawFrame(event, role);
    const result = await page.evaluate(async ({ svg, png }) => {
      const original = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const paint = async url => {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1080;
        const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0);
        return { width: image.naturalWidth, height: image.naturalHeight, pixels: c.getImageData(0, 0, 1080, 1080).data, png: canvas.toDataURL('image/png') };
      };
      const raster = async source => {
        const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
        try { return await paint(url); } finally { URL.revokeObjectURL(url); }
      };
      const bands = [];
      for (const field of ['event', 'role']) {
        const isolated = original.cloneNode(true);
        isolated.querySelectorAll('circle, [data-field="ground"], [data-decoration]').forEach(n => n.remove());
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
      // The committed PNG must be this drawing: same lettering, same photo window.
      const full = await raster(svg); const committed = await paint('data:image/png;base64,' + png);
      let different = 0;
      for (let i = 0; i < full.pixels.length; i += 4) {
        if (Math.max(Math.abs(full.pixels[i] - committed.pixels[i]), Math.abs(full.pixels[i + 1] - committed.pixels[i + 1]), Math.abs(full.pixels[i + 2] - committed.pixels[i + 2]), Math.abs(full.pixels[i + 3] - committed.pixels[i + 3])) > 48) different++;
      }
      return { bands, committedSize: [committed.width, committed.height], differentShare: different / (1080 * 1080), png: full.png };
    }, { svg, png });
    await writeFile(`${evidence}/${key}.svg`, svg);
    await writeFile(`${evidence}/${key}.png`, Buffer.from(result.png.split(',')[1], 'base64'));
    delete result.png;
    report.cases.push({ key, ...result });
    for (const band of result.bands) {
      if (!band.count || Math.abs(band.center - 463) > report.tolerance.radialCenterPx) report.failures.push(`${key}/${band.field}: ink center ${band.center}, expected 463 ± ${report.tolerance.radialCenterPx}`);
      if (band.clippedPixels || band.min <= 400 || band.max >= 526) report.failures.push(`${key}/${band.field}: clipped ink`);
    }
    if (result.committedSize[0] !== 1080 || result.committedSize[1] !== 1080) report.failures.push(`${key}: committed PNG is not 1080 px square`);
    if (result.differentShare > report.tolerance.committedDifferenceShare) report.failures.push(`${key}: committed PNG differs from the drawing in ${(result.differentShare * 100).toFixed(3)}% of pixels`);
  }
  for (const { event, role, photo } of artwork) {
    const key = `${event}-${role}`;
    const frame = eventFrameData(event, role);
    const result = await page.evaluate(async ({ profile, event, role, photo }) => {
      // The page's own loader must fetch the published PNG and deliver exactly its bytes.
      const frame = await (await import('/preview/events/frame-loader.js')).loadEventFrame(event, role);
      const swatch = document.createElement('canvas'); swatch.width = swatch.height = 64;
      const paint = swatch.getContext('2d'); paint.fillStyle = '#FF00FF'; paint.fillRect(0, 0, 64, 64);
      const portrait = swatch.toDataURL('image/png');
      // The renderer can draw the artwork alone, which exposes its own transparency.
      const overlay = window.renderSocial(profile, { layout: 'avatar', shape: 'square', avatar: false, event, role }, null, frame);
      const framed = window.renderSocial(profile, { layout: 'avatar', shape: 'square', event, role }, portrait, frame);
      const round = window.renderSocial(profile, { layout: 'avatar', event, role }, portrait, frame);
      const raster = async source => {
        const image = new Image();
        const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
        try {
          image.src = url; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1080;
          const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0);
          return { width: image.naturalWidth, height: image.naturalHeight, pixels: c.getImageData(0, 0, 1080, 1080).data, png: canvas.toDataURL('image/png') };
        } finally { URL.revokeObjectURL(url); }
      };
      const open = await raster(overlay); const filled = await raster(framed); const circle = await raster(round);
      let openOutside = 0, clear = 0, disc = 0, holes = 0, portraitPixels = 0, roundHoles = 0, roundSpill = 0, roundPortrait = 0;
      for (let y = 0; y < 1080; y++) for (let x = 0; x < 1080; x++) {
        const i = (y * 1080 + x) * 4;
        const r = Math.hypot(x + 0.5 - photo.cx, y + 0.5 - photo.cy);
        if (r > photo.r && open.pixels[i + 3] !== 255) openOutside++;
        if (r < photo.r - 4) { disc++; if (open.pixels[i + 3] === 0) clear++; }
        if (filled.pixels[i + 3] !== 255) holes++;
        if (filled.pixels[i] > 250 && filled.pixels[i + 1] < 5 && filled.pixels[i + 2] > 250) portraitPixels++;
        // Circle: opaque inside the inscribed circle, nothing outside it.
        const edge = Math.hypot(x + 0.5 - 540, y + 0.5 - 540);
        if (edge < 538.5 && circle.pixels[i + 3] !== 255) roundHoles++;
        if (edge > 541.5 && circle.pixels[i + 3] !== 0) roundSpill++;
        if (circle.pixels[i] > 250 && circle.pixels[i + 1] < 5 && circle.pixels[i + 2] > 250) roundPortrait++;
      }
      const alpha = (image, x, y) => image.pixels[(y * 1080 + x) * 4 + 3];
      const corners = image => [alpha(image, 0, 0), alpha(image, 1079, 0), alpha(image, 0, 1079), alpha(image, 1079, 1079)];
      return { frame, portrait, overlay, framed, round, size: [open.width, open.height], roundSize: [circle.width, circle.height], openOutside, clearShare: clear / disc, holes, portraitShare: portraitPixels / disc,
        roundHoles, roundSpill, roundPortraitShare: roundPortrait / disc, roundCorners: corners(circle),
        centerAlpha: alpha(open, Math.round(photo.cx), Math.round(photo.cy)), corners: corners(open), png: filled.png, overlayPng: open.png, roundPng: circle.png };
    }, { profile, event, role, photo });
    assert.equal(result.frame, frame, `${key}: browser payload`);
    assert.equal(result.overlay, renderSocial(profile, { layout: 'avatar', shape: 'square', avatar: false, event, role }, null, frame), `${key}: browser/server canonical overlay`);
    assert.equal(result.framed, renderSocial(profile, { layout: 'avatar', shape: 'square', event, role }, result.portrait, frame), `${key}: browser/server canonical square SVG`);
    assert.equal(result.round, renderSocial(profile, { layout: 'avatar', shape: 'circle', event, role }, result.portrait, frame), `${key}: circle is the default, browser/server canonical`);
    await writeFile(`${evidence}/${key}.svg`, result.round);
    await writeFile(`${evidence}/${key}.png`, Buffer.from(result.roundPng.split(',')[1], 'base64'));
    await writeFile(`${evidence}/${key}-square.svg`, result.framed);
    await writeFile(`${evidence}/${key}-square.png`, Buffer.from(result.png.split(',')[1], 'base64'));
    await writeFile(`${evidence}/${key}-overlay.png`, Buffer.from(result.overlayPng.split(',')[1], 'base64'));
    for (const name of ['frame', 'portrait', 'overlay', 'framed', 'round', 'png', 'overlayPng', 'roundPng']) delete result[name];
    report.cases.push({ key, ...result });
    if (result.size[0] !== 1080 || result.size[1] !== 1080 || result.roundSize[0] !== 1080 || result.roundSize[1] !== 1080) report.failures.push(`${key}: native size changed`);
    if (result.openOutside || result.corners.some(value => value !== 255)) report.failures.push(`${key}: artwork is not opaque outside the photo window`);
    if (result.centerAlpha !== 0 || result.clearShare < 0.4) report.failures.push(`${key}: photo window is not open`);
    if (result.holes) report.failures.push(`${key}: ${result.holes} pixels are not covered by photo or artwork`);
    if (result.portraitShare < 0.4) report.failures.push(`${key}: photo is not visible through the window`);
    if (result.roundHoles || result.roundSpill || result.roundCorners.some(Boolean)) report.failures.push(`${key}: circle is not exactly the inscribed circle (${result.roundHoles} holes, ${result.roundSpill} outside)`);
    if (result.roundPortraitShare < 0.4) report.failures.push(`${key}: photo is not visible in the circle`);
  }
  assert.equal(artwork.length, EVENTS.length * ROLES.length, 'every edition has artwork for every role');
  assert.equal(new Set(report.cases.map(c => c.key)).size, interim.length + artwork.length);
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
