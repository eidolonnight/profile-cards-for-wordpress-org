import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, cp, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { EVENT_MODULES, BROWSER_MODULES, browserModuleSource } from '../tools/browser-modules.mjs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
const script = fileURLToPath(new URL('../tools/stage.mjs', import.meta.url));
const temp = () => mkdtemp(join(tmpdir(), 'profile-card-stage-test-'));
const run = (home, target, entry = script, releaseRoot = '') => spawnSync(process.execPath, [entry, target], { encoding: 'utf8', env: { ...process.env, HOME: home, PROFILE_CARDS_RELEASES_DIR: releaseRoot } });
const source = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stripRevision = text => text.replace(/\?v=[a-f0-9]{64}/g, '');
const sourcePath = path => path.startsWith('preview/') ? new Map(BROWSER_MODULES.map(([source, target]) => [target, source])).get(path)
  : path === 'create.html' ? 'public/index.html'
  : path.startsWith('functions/') || path.startsWith('shared/') || path.startsWith('events/') || ['sf.jsonc', 'LICENSE'].includes(path) ? path : `public/${path}`;
async function stage(home, name, entry = script) {
  const release = join(home, 'echion/projects/wp-profile-cards/releases', name);
  const root = join(release, 'site'); const result = run(home, root, entry);
  assert.equal(result.status, 0, result.stderr);
  return { root, release, output: JSON.parse(result.stdout) };
}
async function snapshot(directory) {
  const paths = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)).sort();
  return Promise.all(paths.map(async path => [path, sha256(await readFile(path))]));
}

test('stage versions every browser asset edge without changing canonical sources or backend copies', async () => {
  const home = await temp();
  const before = await Promise.all(['public', 'shared', 'functions', 'events'].map(path => snapshot(join(source, path))));
  const { root, release, output } = await stage(home, 'cache-edges');
  // Assert the regression directly, before looking for the new metadata file.
  const index = await readFile(join(root, 'index.html'), 'utf8');
  assert.match(index, /src="\/app\.js\?v=[a-f0-9]{64}"/);
  const metadata = JSON.parse(await readFile(join(release, 'asset-revision.json')));
  const { revision } = metadata;
  assert.match(revision, /^[a-f0-9]{64}$/);
  assert.equal(output.assetRevision, revision);
  assert.equal(output.revisionManifest, join(release, 'asset-revision.json'));
  for (const name of ['index.html', 'create.html']) {
    const html = await readFile(join(root, name), 'utf8');
    const references = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css|png|ico)(?:\?[^" ]*)?)"/g)].map(match => match[1]);
    assert.deepEqual(references.sort(), ['app.js', 'styles.css', 'theme.js', 'site-logo.png', 'favicon.png', 'site-favicon.ico'].map(name => `/${name}?v=${revision}`).sort());
    assert.equal(stripRevision(html), await readFile(join(source, 'public/index.html'), 'utf8'));
  }
  const app = await readFile(join(root, 'app.js'), 'utf8');
  const references = [...app.matchAll(/(['"])(\/(?:background\.js|preview\/preview\.js)(?:\?[^'"]*)?)\1/g)].map(match => match[2]);
  assert.deepEqual(references, [`/background.js?v=${revision}`, `/preview/preview.js?v=${revision}`, `/preview/preview.js?v=${revision}`]);
  assert.ok(app.includes(`fetch('/preview/preview.js?v=${revision}', { method: 'HEAD'`));
  assert.equal(stripRevision(app), await readFile(join(source, 'public/app.js'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(release, 'source-manifest.json')));
  let imports = 0;
  for (const item of manifest) {
    const bytes = await readFile(join(root, item.path));
    assert.equal(bytes.length, item.bytes, item.path);
    assert.equal(sha256(bytes), item.sha256, item.path);
    if (item.path === 'robots.txt') continue;
    const original = await readFile(join(source, sourcePath(item.path)));
    if (item.path.startsWith('preview/')) {
      const text = bytes.toString();
      for (const match of text.matchAll(/^(?:import|export)\s+[^;]+?\s+from\s+(['"])([^'"]+)\1/gm)) {
        imports++;
        assert.match(match[2], new RegExp(`^\\.{1,2}/[a-z/-]+\\.js\\?v=${revision}$`));
        assert.ok(manifest.some(entry => entry.path === posix.normalize(posix.join(posix.dirname(item.path), match[2].split('?')[0]))));
      }
      assert.equal(text, browserModuleSource(item.path, original.toString(), revision), item.path);
    } else if (!['index.html', 'create.html', 'app.js'].includes(item.path)) {
      assert.deepEqual(bytes, original, item.path);
    }
  }
  const expectedImports = (await Promise.all(BROWSER_MODULES.map(async ([from]) => [...(await readFile(join(source, from), 'utf8')).matchAll(/^(?:import|export)\s+[^;]+?\s+from\s+(['"])([^'"]+)\1/gm)].length))).reduce((sum, count) => sum + count, 0);
  assert.equal(imports, expectedImports); assert.ok(imports > 0);
  assert.deepEqual(await Promise.all(['public', 'shared', 'functions', 'events'].map(path => snapshot(join(source, path)))), before);
  assert.equal(manifest.length, 36 + EVENT_MODULES.length * 2);
  const stagedPaths = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(root.length + 1)).sort();
  assert.deepEqual(stagedPaths, manifest.map(item => item.path).sort());
  assert.equal(manifest.some(item => item.path === 'asset-revision.json'), false);
  const expectedSources = [...new Set([...manifest.filter(item => item.path !== 'robots.txt').map(item => sourcePath(item.path)), 'package.json', 'package-lock.json'])].sort();
  assert.deepEqual(metadata.sources.map(item => item.path), expectedSources);
  const hash = createHash('sha256');
  for (const item of metadata.sources) {
    const bytes = await readFile(join(source, item.path));
    assert.equal(item.bytes, bytes.length, item.path);
    assert.equal(item.sha256, sha256(bytes), item.path);
    assert.deepEqual(item.outputs, manifest.filter(entry => entry.path !== 'robots.txt' && sourcePath(entry.path) === item.path).map(entry => entry.path).sort());
    hash.update(item.path).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  }
  assert.equal(revision, hash.digest('hex'));
});

test('asset revision is deterministic and changes for canonical content in an isolated fixture', async () => {
  const home = await temp(); const fixture = join(home, 'source');
  await mkdir(join(fixture, 'tools'), { recursive: true });
  for (const path of ['public', 'shared', 'functions', 'events', 'sf.jsonc', 'LICENSE', 'package.json', 'package-lock.json', 'tools/stage.mjs', 'tools/browser-modules.mjs']) {
    await cp(join(source, path), join(fixture, path), { recursive: true });
  }
  const entry = join(fixture, 'tools/stage.mjs');
  const first = await stage(home, 'stable-01', entry);
  const second = await stage(home, 'stable-02', entry);
  assert.match(first.output.assetRevision, /^[a-f0-9]{64}$/);
  assert.equal(second.output.assetRevision, first.output.assetRevision);
  assert.equal((await stage(home, 'canonical-01')).output.assetRevision, first.output.assetRevision);
  for (const name of ['asset-revision.json', 'source-manifest.json']) {
    assert.deepEqual(await readFile(join(first.release, name)), await readFile(join(second.release, name)));
  }
  // No timestamps, release names, absolute source paths, or non-allowlisted files enter the key.
  await writeFile(join(fixture, 'unlisted.txt'), 'not a release input');
  assert.equal((await stage(home, 'stable-03', entry)).output.assetRevision, first.output.assetRevision);
  for (const [index, path] of ['public/styles.css', 'public/favicon.png', 'shared/options.js', 'functions/card.js', 'package.json', 'events/wordcamp-asia/theme.js', 'events/wordcamp-europe/artwork.js', 'events/wordcamp-india/event.js', 'events/fonts.js'].entries()) {
    const target = join(fixture, path); const original = await readFile(target);
    await writeFile(target, Buffer.concat([original, Buffer.from('\n')]));
    const changed = await stage(home, `changed-0${index}`, entry);
    assert.notEqual(changed.output.assetRevision, first.output.assetRevision, path);
    await writeFile(target, original);
  }
  assert.equal((await stage(home, 'restored-01', entry)).output.assetRevision, first.output.assetRevision);
  // Source symlinks remain forbidden, and failure creates no release.
  const { unlink } = await import('node:fs/promises');
  await unlink(join(fixture, 'public/theme.js'));
  await symlink(join(source, 'public/theme.js'), join(fixture, 'public/theme.js'));
  const refused = run(home, join(home, 'echion/projects/wp-profile-cards/releases/symlink-01/site'), entry);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Not a regular non-symlink source file/);
  await assert.rejects(readdir(join(home, 'echion/projects/wp-profile-cards/releases/symlink-01')), { code: 'ENOENT' });
});
test('stage has exact manifest hashes, no dependency metadata, and refuses an existing release', async () => {
  const home = await temp(); const release = join(home, 'echion/projects/wp-profile-cards/releases/release-01'); const root = join(release, 'site');
  assert.equal(run(home, root).status, 0);
  const manifest = JSON.parse(await readFile(join(release, 'source-manifest.json')));
  assert.deepEqual(manifest.map(x => x.path).sort(), ['index.html', 'app.js', 'theme.js', 'background.js', 'styles.css', 'site-logo.png', 'favicon.png', 'site-favicon.ico', 'create.html', 'THIRD-PARTY-NOTICES.txt', 'FONT-LICENSES.txt', 'LICENSE', 'sf.jsonc', 'functions/_fonts.js', 'functions/_profile.js', 'functions/_svg.js', 'functions/json.js', 'functions/card.js', 'functions/_events.js', 'functions/_social.js', 'functions/events.js', 'functions/preview-data.js', 'preview/preview.js', 'preview/options.js', 'preview/svg.js', 'preview/social.js', 'preview/fonts.js', 'preview/events.js', 'preview/event-fonts.js', 'preview/event-themes.js', 'shared/options.js', 'shared/svg.js', 'shared/social.js', 'shared/fonts.js', 'shared/events.js', 'robots.txt', ...EVENT_MODULES, ...EVENT_MODULES.map(path => `preview/${path}`)].sort());
  assert.equal(manifest.some(x => /package|test|README|manifest|provenance|\.(woff2|ttf)$/.test(x.path)), false);
  for (const item of manifest) assert.equal(createHash('sha256').update(await readFile(join(root, item.path))).digest('hex'), item.sha256);
  for (const name of ['options.js', 'svg.js', 'social.js', 'fonts.js', 'events.js']) {
    const revision = JSON.parse(await readFile(join(release, 'asset-revision.json'))).revision;
    assert.equal(await readFile(join(root, 'preview', name), 'utf8'), browserModuleSource(`preview/${name}`, await readFile(join(root, 'shared', name), 'utf8'), revision), name);
  }
  await writeFile(join(release, 'sentinel'), 'keep'); assert.notEqual(run(home, root).status, 0); assert.equal(await readFile(join(release, 'sentinel'), 'utf8'), 'keep');
  assert.notEqual(run(home, home).status, 0); assert.notEqual(run(home, join(release, 'nested/site')).status, 0);
});
test('stage refuses symlinked releases parents without touching their destination', async () => {
  const home = await temp(); const parent = join(home, 'echion/projects/wp-profile-cards'); const outside = join(home, 'untouched');
  await mkdir(parent, { recursive: true }); await mkdir(outside); await writeFile(join(outside, 'sentinel'), 'keep'); await symlink(outside, join(parent, 'releases'));
  assert.notEqual(run(home, join(parent, 'releases/release-01/site')).status, 0); assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'keep');
});

test('an explicit releases root is portable, exclusive and cannot overlap source or home', async () => {
  const home = await temp(); const base = join(home, 'portable-releases');
  const root = join(base, 'release-01/site');
  const result = run(home, root, script, base);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).stage, root);
  assert.equal(await readFile(join(root, 'LICENSE'), 'utf8'), await readFile(join(source, 'LICENSE'), 'utf8'));
  await writeFile(join(base, 'release-01/sentinel'), 'keep');
  assert.notEqual(run(home, root, script, base).status, 0);
  assert.equal(await readFile(join(base, 'release-01/sentinel'), 'utf8'), 'keep');
  for (const forbidden of [source, join(source, 'release-test-forbidden'), join(source, '..'), home, '/']) {
    const rejected = run(home, join(forbidden, 'must-not-exist/site'), script, forbidden);
    assert.notEqual(rejected.status, 0, forbidden);
    assert.match(rejected.stderr, /Releases root/, forbidden);
  }
  assert.notEqual(run(home, root, script, 'relative/releases').status, 0);
  const linked = join(home, 'linked-releases'); await symlink(base, linked);
  assert.notEqual(run(home, join(linked, 'release-02/site'), script, linked).status, 0);
  await assert.rejects(readdir(join(base, 'release-02')), { code: 'ENOENT' });
  assert.notEqual(run(home, join(home, 'elsewhere/release-02/site'), script, base).status, 0);
});

test('local adapter serves exactly the shared allowlist and preview-data route without exposing server files', async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../tools/serve.mjs', import.meta.url))], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit'); let diagnostics = '';
  child.stderr.on('data', data => { diagnostics += data; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local adapter startup timed out: ' + diagnostics)), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Local adapter exited: ' + diagnostics)); });
      child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    });
    const origin = `http://127.0.0.1:${port}`;
    for (const [source, name] of BROWSER_MODULES) {
      const response = await fetch(`${origin}/${name}`);
      assert.equal(response.status, 200); assert.match(response.headers.get('Content-Type'), /^text\/javascript/);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(await response.text(), browserModuleSource(name, await readFile(new URL(`../${source}`, import.meta.url), 'utf8')), name);
      const head = await fetch(`${origin}/${name}`, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    }
    const backgroundResponse = await fetch(`${origin}/background.js`);
    assert.equal(backgroundResponse.status, 200);
    assert.match(backgroundResponse.headers.get('Content-Type'), /^text\/javascript/);
    assert.equal(await backgroundResponse.text(), await readFile(new URL('../public/background.js', import.meta.url), 'utf8'));
    for (const name of ['site-logo.png', 'favicon.png', 'site-favicon.ico']) {
      const response = await fetch(`${origin}/${name}?v=test`);
      assert.equal(response.status, 200, name);
      assert.equal(response.headers.get('Content-Type'), name.endsWith('.ico') ? 'image/x-icon' : 'image/png');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(`../public/${name}`, import.meta.url)));
      const head = await fetch(`${origin}/${name}`, { method: 'HEAD' });
      assert.equal(head.status, 200); assert.equal(await head.text(), '');
    }
    for (const from of ['shared', 'preview']) {
      for (const suffix of ['', 'missing.js', 'preview.js/extra', '../functions/_profile.js', '%2e%2e/functions/_profile.js', '%2f..%2ffunctions%2f_profile.js']) assert.equal((await fetch(`${origin}/${from}/${suffix}`)).status, 404);
    }
    const licenseResponse = await fetch(`${origin}/LICENSE`);
    assert.equal(licenseResponse.status, 200);
    assert.match(licenseResponse.headers.get('Content-Type'), /^text\/plain/);
    assert.equal(await licenseResponse.text(), await readFile(new URL('../LICENSE', import.meta.url), 'utf8'));
    const licenseHead = await fetch(`${origin}/LICENSE`, { method: 'HEAD' });
    assert.equal(licenseHead.status, 200); assert.equal(await licenseHead.text(), '');
    for (const path of ['/AGENTS.md', '/CLAUDE.md', '/docs/event-themes.md', '/.gitignore', '/.env', '/functions/_profile.js', '/functions/preview-data.js', '/package.json', '/shared/options.js', '/shared/fonts.js', '/events/README.md', '/events/fonts.js', '/events/wordcamp-asia/theme.js', '/preview/events/README.md', '/preview/events/wordcamp-asia/fonts/manifest.json', '/preview/events/wordcamp-asia/fonts/Faculty-Glyphic-400.woff2', '/preview/events/wordcamp-asia/README.md']) assert.equal((await fetch(origin + path)).status, 404, path);
    const invalid = await fetch(`${origin}/preview-data?size=0`); assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.code, 'invalid_username');
    assert.equal((await fetch(`${origin}/preview-data?username=example&size=0`, { method: 'POST' })).status, 405);
  } finally { child.kill(); await exited; }
});
