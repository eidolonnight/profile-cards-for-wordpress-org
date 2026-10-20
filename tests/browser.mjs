import assert from 'node:assert/strict';
import { cardURLFromControls, selectPalette, assertInitialDemo, assertDownloadedPNG, assertCleanupFailures } from './ui-acceptance.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_ORIGIN || 'http://127.0.0.1:4197';
const cardLayout = process.env.CARD_LAYOUT || 'classic';
if (!['classic', 'square'].includes(cardLayout)) throw new Error('CARD_LAYOUT must be classic or square.');
const evidence = process.env.EVIDENCE_DIR;
if (!evidence) throw new Error('Set EVIDENCE_DIR outside the publish root.');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, ...(process.env.BROWSER_STATE ? { storageState: process.env.BROWSER_STATE } : {}) });
const page = await context.newPage();
const errors = []; const requests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (new URL(r.url()).origin !== new URL(base).origin && /^https?:/.test(r.url())) requests.push(new URL(r.url()).origin); });
const report = { origin: base, checks: [], errors, externalOrigins: requests };
const ready = async () => { await page.waitForFunction(() => !document.getElementById('exports').disabled && document.getElementById('card-preview').complete && document.getElementById('card-preview').naturalWidth > 0, null, { timeout: 40000 }); };
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
const check = name => report.checks.push(name);
try {
  const response = await page.goto(base, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200); report.version = response.headers()['x-spacefast-version'] || null;
  await assertInitialDemo(page); check('live matt demo is labeled while username stays blank');
  await page.locator('#layout').selectOption(cardLayout); check(`${cardLayout} layout remains available`);
  if (cardLayout === 'square') assert.equal(await page.locator('#layout option:checked').innerText(), 'Vertical card');
  await page.locator('#username').fill('eidolonnight'); await page.locator('#create-button').click(); await ready();
  const api = await context.request.get(base + '/json?username=eidolonnight'); assert.equal(api.status(), 200); const profile = await api.json(); assert.equal(profile.userName, 'eidolonnight'); assert.equal(profile.name, 'Nicholas Garofalo'); report.badges = profile.badges.length; check('live profile JSON and decoded card preview');
  const popupReady = context.waitForEvent('page'); await page.locator('#open-preview').click(); const popup = await popupReady; await popup.waitForLoadState(); assert.ok(popup.url().startsWith('blob:')); assert.ok((await popup.locator('svg').textContent()).includes('Nicholas Garofalo')); await popup.close(); check('full-size preview opens the real card for mobile inspection');
  await page.screenshot({ path: evidence + '/desktop.png', fullPage: true }); await noOverflow();
  const download = async (id, extension, filename = 'download' + extension) => {
    const wait = page.waitForEvent('download'); await page.locator(id).click(); const item = await wait; assert.ok(item.suggestedFilename().endsWith(extension));
    const path = evidence + '/' + filename; await item.saveAs(path); const bytes = await readFile(path); assert.ok(bytes.length > 100); return bytes;
  };
  const svg = await download('#download-svg', '.svg'); assert.ok(svg.toString().includes('data:image/')); assert.ok(!svg.toString().includes('<foreignObject')); for (const b of profile.badges) assert.ok(svg.toString().includes(b.name.replaceAll('&', '&amp;'))); check('SVG download contains the real embedded avatar and every badge');
  const png = await download('#download-png', '.png'); assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(png.readUInt32BE(16), 1440); report.png = { bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: createHash('sha256').update(png).digest('hex') }; check('actual canvas PNG download');
  if (cardLayout === 'square') {
    assert.equal(png.readUInt32BE(20), 1440);
    assert.ok(svg.toString().includes('data-layout="square"'));
    const dimensions = await page.locator('#card-preview').evaluate(image => [image.naturalWidth, image.naturalHeight]);
    assert.deepEqual(dimensions, [720, 720]); check('Square exports are truly 1:1 in SVG and PNG');
    const direct = await context.newPage();
    const response = await direct.goto(base+'/card?username=eidolonnight&layout=square');
    assert.equal(response.status(), 200); assert.match(response.headers()['content-security-policy'], /font-src data:/);
    await direct.evaluate(() => document.fonts.ready);
    const geometry = await direct.evaluate(() => {
      const fonts = [...document.fonts].map(f => ({ family:f.family, status:f.status }));
      const bounds = [...document.querySelectorAll('text')].map(el => { const b=el.getBBox(), m=el.getCTM(); const a=new DOMPoint(b.x,b.y).matrixTransform(m),z=new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(m); return { text:el.textContent,x:a.x,y:a.y,right:z.x,bottom:z.y }; });
      return { fonts, bounds };
    });
    assert.ok(geometry.fonts.some(f => f.family.includes('Card Inter') && f.status === 'loaded'));
    assert.ok(geometry.bounds.every(b => b.x>=0 && b.y>=0 && b.right<=720 && b.bottom<=720));
    report.squareGeometry = geometry; await direct.close(); check('Square loads its embedded font under real CSP and every text box fits');
  }
  await assertDownloadedPNG(page, png); check('download contains a real PNG with dimensions and pixels matching the preview');
  await selectPalette(page, 'dark'); await ready(); const darkURL = await cardURLFromControls(page); assert.equal(new URL(darkURL).searchParams.get('foreground'), '191E23'); const darkCard = await context.request.get(darkURL); assert.equal(darkCard.status(), 200); const darkSource = await page.locator('#card-preview').evaluate(image => fetch(image.src).then(response => response.text())); assert.equal(createHash('sha256').update(await darkCard.text()).digest('hex'), createHash('sha256').update(darkSource).digest('hex')); check('dark palette preview matches the explicit canonical card URL');
  if (cardLayout === 'square') await download('#download-png', '.png', 'square-dark.png');
  await page.locator('#badges').uncheck(); await ready(); const noBadgesURL = await cardURLFromControls(page); assert.equal(new URL(noBadgesURL).searchParams.get('badges'), 'false'); const hiddenCard = await context.request.get(noBadgesURL); assert.ok(!(await hiddenCard.text()).includes('CONTRIBUTOR BADGES')); check('display options change actual card output');
  const builderURL = new URL(noBadgesURL); builderURL.pathname = '/create'; await page.goto(builderURL.href); assert.equal(await page.locator('#badges').isChecked(), false); assert.equal(await page.locator('#foreground').inputValue(), '#191e23'); assert.equal(await page.locator('#username').inputValue(), 'eidolonnight'); await page.locator('#create-button').click(); await ready(); check('builder URL restores settings and regenerates');
  await page.locator('#badges').check(); await selectPalette(page, 'light'); await ready();
  for (const width of [768, 390, 320]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(); await page.screenshot({ path: evidence + `/mobile-${width}.png`, fullPage: true }); } check('no overflow at 1440, 768, 390 and 320 widths');
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (process.env.AXE_PATH) { await page.addScriptTag({ path: process.env.AXE_PATH }); const result = await page.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })); report.accessibility = result.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target) })); assert.deepEqual(report.accessibility, []); check('axe WCAG A/AA audit'); }
  await page.locator('#username').fill('another-name'); assert.equal(await page.locator('#exports').evaluate(el => el.disabled), true); assert.equal(await page.locator('#card-preview').isHidden(), true); check('changing username invalidates old exports');
  // Explicitly synthetic network failure: verifies UI error behavior without claiming a real outage.
  await page.route('**/json?username=another-name', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { code: 'test_outage', message: 'Simulated upstream outage for browser test.' } }) })); await page.locator('#create-button').click(); await page.waitForFunction(() => document.getElementById('status').dataset.kind === 'error'); assert.equal(await page.locator('#exports').evaluate(el => el.disabled), true); assert.ok((await page.locator('#status').innerText()).includes('Simulated upstream')); check('simulated upstream error is explicit and does not leave old downloads');
  await assertCleanupFailures(context, base); check('demo failures, malformed/manual shared URLs, download-only actions, canvas failures and stale PNG downloads recover safely');
  assert.deepEqual(errors, []); assert.deepEqual([...new Set(requests)], []); check('no page errors or off-origin app requests');
  report.pass = true;
} catch (error) { report.pass = false; report.failure = error.message; throw error; }
finally { await writeFile(evidence + '/browser-report.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify(report, null, 2)); }
