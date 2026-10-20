import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const expectedTeamSlug = process.env.EXPECTED_TEAM_SLUG;
const expectedTeamId = process.env.EXPECTED_TEAM_ID;
if (!expectedTeamSlug || !expectedTeamId) throw new Error('EXPECTED_TEAM_SLUG and EXPECTED_TEAM_ID required.');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const release = process.env.RELEASE_DIR; if (!release) throw new Error('RELEASE_DIR required.');
const accessPolicy = process.env.HOSTED_ACCESS_POLICY || 'private';
assert.ok(['private', 'public-live/private-immutable'].includes(accessPolicy), 'Unknown hosted access policy.');
const publicLive = accessPolicy === 'public-live/private-immutable';
let assetRevision = null;
try { assetRevision = JSON.parse(await readFile(release + '/asset-revision.json', 'utf8')).revision; assert.match(assetRevision, /^[0-9a-f]{64}$/); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const assetURL = path => {
  const url = new URL('/' + path, base);
  if (assetRevision && /\.(?:js|css)$/.test(path)) url.searchParams.set('v', assetRevision);
  return url.href;
};
let accessURL;
if (!publicLive) {
  const receipt = JSON.parse(await readFile(release + '/test-access.json', 'utf8')).data;
  accessURL = receipt.open?.url || receipt.access?.url;
  if (!accessURL) throw new Error('The saved receipt has no documented access URL.');
}
const space = JSON.parse(await readFile(release + '/space-readback.json', 'utf8')).data;
const runtime = JSON.parse(await readFile(release + '/runtime-readback.json', 'utf8')).data;
const version = JSON.parse(await readFile(release + '/version-readback.json', 'utf8')).data;
assert.equal(space.teamSlug, expectedTeamSlug); assert.equal(space.teamId, expectedTeamId);
assert.equal(space.channels.live.versionId, version.id); assert.equal(runtime.liveVersionId, version.id); assert.equal(version.status, 'ready');
const base = space.liveUrl.replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'], headless: true });
const evidence = release + '/hosted'; await mkdir(evidence, { recursive: true, mode: 0o700 });
const report = { origin: base, version: version.id, accessPolicy, assetRevision, anonymous: [], immutableAnonymous: [], runtime: [], sourceDenied: [], hashes: [], checks: [] };
const accessPaths = ['/', '/create', '/json?username=eidolonnight', '/card?username=eidolonnight', '/events', '/preview-data?username=eidolonnight&size=0', '/preview/preview.js', '/preview/fonts.js'];
try {
  const anonymous = await browser.newContext();
  for (const path of accessPaths) {
    const response = await anonymous.request.get(base + path, { maxRedirects: 0 }); report.anonymous.push({ path, status: response.status() });
    assert.equal(response.status(), publicLive ? 200 : 403, 'Unexpected anonymous access: ' + path);
    if (publicLive && ['/', '/create'].includes(path)) assert.equal(response.headers()['x-spacefast-version'], version.id);
  }
  if (publicLive) {
    const immutable = new URL(version.immutableUrl);
    assert.equal(immutable.protocol, 'https:'); assert.notEqual(immutable.origin, new URL(base).origin);
    for (const path of accessPaths) {
      const response = await anonymous.request.get(new URL(path, immutable).href, { maxRedirects: 0 });
      report.immutableAnonymous.push({ path, status: response.status() });
      assert.equal(response.status(), 403, 'Immutable version access was broadened: ' + path);
    }
  }
  await anonymous.close();
  const context = await browser.newContext({ acceptDownloads: true, ...(!publicLive && process.env.BROWSER_STATE ? { storageState: process.env.BROWSER_STATE } : {}) }); const page = await context.newPage();
  if (!publicLive && !process.env.BROWSER_STATE) {
    try { await page.goto(accessURL, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch { throw new Error('Private author handoff navigation failed; URL redacted.'); }
  }
  const document = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).origin, new URL(base).origin); assert.equal(document.status(), 200); assert.equal(document.headers()['x-spacefast-version'], version.id);
  if (!publicLive) { await context.storageState({ path: release + '/browser-state.json' }); await chmod(release + '/browser-state.json', 0o600); }
  report.documentHeaders = Object.fromEntries(Object.entries(document.headers()).filter(([key]) => ['content-type', 'x-spacefast-version', 'x-robots-tag', 'x-content-type-options', 'referrer-policy'].includes(key)));
  const catalog = JSON.parse(await readFile(release + '/files-served-readback.json', 'utf8')).data.files;
  for (const file of catalog) {
    const response = await context.request.get(assetURL(file.path)); const bytes = await response.body(); assert.equal(response.status(), 200);
    if (assetRevision && /\.(?:js|css)$/.test(file.path)) assert.equal(response.headers()['x-spacefast-version'], version.id, 'Versioned browser asset must be current: ' + file.path);
    const digest = createHash('sha256').update(bytes).digest('hex'); report.hashes.push({ path: file.path, match: digest === file.sha256, digest });
    if (file.path.endsWith('.html')) await writeFile(evidence + '/' + file.path, bytes);
    assert.equal(digest, file.sha256, 'Served catalog hash mismatch: ' + file.path);
  }
  for (const path of ['/package.json', '/package-lock.json', '/sf.jsonc', '/functions/_profile.js', '/functions/preview-data.js', '/tests/profile.test.mjs', '/tools/serve.mjs']) {
    const response = await context.request.get(base + path); report.sourceDenied.push({ path, status: response.status() }); assert.equal(response.status(), 404, 'Source path exposed: ' + path);
  }
  for (const [path, expected] of [['/json?username=eidolonnight', 200], ['/card?username=eidolonnight', 200], ['/preview-data?username=eidolonnight&size=320', 200], ['/preview-data?username=eidolonnight&size=1024', 200], ['/preview-data?username=eidolonnight&size=0', 200], ['/preview-data?username=eidolonnight', 400], ['/preview-data?username=eidolonnight&size=2048', 400], ['/json', 400], ['/card?username=../bad', 406], ['/card?username=eidolonnight&nameColor=bad', 400], ['/json?username=wp-card-missing-test-267801010000', 404]]) {
    const response = await context.request.get(base + path, { timeout: 45000 }); const text = await response.text();
    const item = { path, status: response.status(), contentType: response.headers()['content-type'], avatar: response.headers()['x-profile-avatar'] || null };
    if (response.status() !== expected) { try { item.error = JSON.parse(text).error; } catch { item.error = 'Non-JSON response'; } }
    report.runtime.push(item); assert.equal(response.status(), expected, 'Unexpected runtime response: ' + path);
    if (expected === 200 && path.startsWith('/json')) { const profile = JSON.parse(text); assert.equal(profile.name, 'Nicholas Garofalo'); report.badges = profile.badges.length; await writeFile(evidence + '/profile.json', text); }
    if (expected === 200 && path.startsWith('/card')) { assert.ok(text.startsWith('<svg')); assert.ok(text.includes('data:image/')); await writeFile(evidence + '/card.svg', text); }
    if (expected === 200 && path.startsWith('/preview-data')) {
      const data = JSON.parse(text), size = Number(new URL(path, base).searchParams.get('size'));
      assert.equal(data.profile.userName, 'eidolonnight'); assert.equal(data.avatar.size, size);
      assert.ok(Number.isInteger(data.maxAgeMs) && data.maxAgeMs >= 0 && data.maxAgeMs <= 900000);
      assert.equal(data.avatar.status, size ? 'embedded' : 'hidden');
      if (size) assert.match(data.avatar.data, /^data:image\/(png|jpeg|webp);base64,/); else assert.equal(data.avatar.data, null);
      // The handler emits private, no-store; hosted Functions responses expose
      // no-store, which still forbids storage by both shared and private caches.
      item.cacheControl = response.headers()['cache-control'];
      assert.equal(item.cacheControl, 'no-store');
    }
  }
  await context.close(); report.pass = true;
} catch (error) { report.pass = false; report.failure = error.message.replace(/https?:\/\/\S+/g, '[URL redacted]'); }
finally { await browser.close(); await writeFile(evidence + '/hosted-report.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); console.log(JSON.stringify(report, null, 2)); }
if (!report.pass) process.exitCode = 1;
