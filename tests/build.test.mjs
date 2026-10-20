import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'profile-cards-build-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const project = join(base, 'project');
  const temporary = join(base, 'temporary');
  await mkdir(project); await mkdir(temporary); await mkdir(join(project, 'tools'));
  for (const path of ['public', 'shared', 'functions', 'LICENSE', 'sf.jsonc', 'package.json', 'package-lock.json', 'tools/stage.mjs']) {
    await cp(join(source, path), join(project, path), { recursive: true });
  }
  try { await cp(join(source, 'tools/build.mjs'), join(project, 'tools/build.mjs')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = { ...process.env, TMPDIR: temporary, PROFILE_CARDS_RELEASES_DIR: join(base, 'must-not-use') };
  const run = () => spawnSync(process.execPath, [join(project, 'tools/build.mjs')], { cwd: base, env, encoding: 'utf8', timeout: 30000 });
  return { base, project, temporary, env, run };
}
async function inventory(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Promise.all(entries.filter(entry => entry.isFile()).map(async entry => {
    const path = join(entry.parentPath, entry.name); const bytes = await readFile(path);
    return { path: relative(root, path), bytes: bytes.length, sha256: digest(bytes) };
  }));
}
const sorted = entries => entries.toSorted((a, b) => a.path.localeCompare(b.path));

test('repository build explicitly installs dependencies, tests first and selects runtime output', async () => {
  const pkg = JSON.parse(await readFile(join(source, 'package.json')));
  const config = JSON.parse(await readFile(join(source, 'sf.jsonc')));
  assert.equal(pkg.scripts.build, 'node --test --test-concurrency=1 tests/*.test.mjs && node tools/build.mjs');
  assert.deepEqual(config.build, {
    rootDirectory: '.', installDirectory: '.',
    installCommand: 'npm ci --ignore-scripts --no-audit --no-fund',
    buildCommand: 'npm run build', outputDirectory: 'dist', timeoutSeconds: 900,
  });
});

test('repository build matches immutable staging exactly and excludes source-only files', async t => {
  const { base, project, temporary, env, run } = await fixture(t);
  for (const path of ['.env', 'README.md', 'public/unlisted.txt']) await writeFile(join(project, path), 'must not publish');
  const before = await inventory(project);
  const result = run(); assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.outputDirectory, 'dist'); assert.equal(output.files, 35);
  assert.match(output.assetRevision, /^[a-f0-9]{64}$/);
  const releases = join(base, 'comparison'); const release = join(releases, 'release-01');
  const staged = spawnSync(process.execPath, [join(project, 'tools/stage.mjs'), join(release, 'site')], {
    env: { ...env, PROFILE_CARDS_RELEASES_DIR: releases }, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(staged.status, 0, staged.stderr);
  const manifest = JSON.parse(await readFile(join(release, 'source-manifest.json')));
  assert.deepEqual(sorted(await inventory(join(project, 'dist'))), sorted(manifest));
  assert.equal(output.assetRevision, JSON.parse(staged.stdout).assetRevision);
  assert.deepEqual(sorted((await inventory(project)).filter(item => !item.path.startsWith('dist/'))), sorted(before));
  assert.deepEqual(await readdir(temporary), []);
  await assert.rejects(lstat(join(base, 'must-not-use')), { code: 'ENOENT' });
});

test('repository build refuses existing output files, directories and symlinks without changing them', async t => {
  const { base, project, temporary, run } = await fixture(t);
  const output = join(project, 'dist'); const outside = join(base, 'untouched');
  await mkdir(outside); await writeFile(join(outside, 'sentinel'), 'keep');
  for (const kind of ['directory', 'file', 'symlink', 'broken-symlink']) {
    if (kind === 'directory') { await mkdir(output); await writeFile(join(output, 'sentinel'), 'keep'); }
    else if (kind === 'file') await writeFile(output, 'keep');
    else await symlink(kind === 'symlink' ? outside : join(base, 'missing'), output);
    const result = run(); assert.notEqual(result.status, 0, kind);
    assert.match(result.stderr, /Build output already exists/, kind);
    assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'keep');
    if (kind === 'directory') assert.equal(await readFile(join(output, 'sentinel'), 'utf8'), 'keep');
    else if (kind === 'file') assert.equal(await readFile(output, 'utf8'), 'keep');
    else assert.equal((await lstat(output)).isSymbolicLink(), true);
    await rm(output, { recursive: true, force: true });
  }
  assert.deepEqual(await readdir(temporary), []);
});

test('repository build retains source-symlink rejection and removes only its own failed output', async t => {
  const { project, temporary, run } = await fixture(t);
  await unlink(join(project, 'public/theme.js'));
  await symlink(join(source, 'public/theme.js'), join(project, 'public/theme.js'));
  const result = run(); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Not a regular non-symlink source file/);
  await assert.rejects(lstat(join(project, 'dist')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(temporary), []);
});

test('repository build does not bypass external-stage guards when TMPDIR is inside the project', async t => {
  const { project, env } = await fixture(t);
  const temporary = join(project, 'unsafe-temp'); await mkdir(temporary);
  const result = spawnSync(process.execPath, [join(project, 'tools/build.mjs')], {
    env: { ...env, TMPDIR: temporary }, encoding: 'utf8', timeout: 30000,
  });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Releases root must be outside source/);
  await assert.rejects(lstat(join(project, 'dist')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(temporary), []);
});
