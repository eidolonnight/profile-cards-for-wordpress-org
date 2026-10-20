import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');
// Upstream notices sometimes vary only in trailing spaces or literal \n escapes.
const normalized = value => value.replace(/\\n/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trim();

test('project declares GPL-2.0-or-later with the unmodified official GPL v2 text', async () => {
  const pkg = JSON.parse(await text('package.json'));
  const lock = JSON.parse(await text('package-lock.json'));
  assert.equal(pkg.license, 'GPL-2.0-or-later');
  assert.equal(lock.packages[''].license, pkg.license);
  assert.equal(pkg.private, true, 'source sharing is not permission to publish an npm package');
  const license = await readFile(new URL('LICENSE', root));
  assert.equal(createHash('sha256').update(license).digest('hex'), 'edaef632cbb643e4e7a221717a6c441a4c1a7c918e6e4d56debc3d8739b233f6');
  assert.match(await text('README.md'), /GPL-2\.0-or-later/);
  const scope = await text('LICENSING.md');
  assert.match(scope, /either version 2 of the License, or/);
  assert.match(scope, /any later version/);
  assert.match(scope, /OFL-1\.1/);
});

test('all installed locked production dependencies retain their original license notices', async () => {
  const lock = JSON.parse(await text('package-lock.json'));
  const notices = normalized(await text('public/THIRD-PARTY-NOTICES.txt'));
  for (const [path, info] of Object.entries(lock.packages)) {
    if (!path) continue;
    assert.ok(['MIT', 'ISC', 'BSD-2-Clause'].includes(info.license), `Review license compatibility before changing this allowlist: ${path}`);
    const installed = JSON.parse(await text(`${path}/package.json`));
    assert.equal(installed.version, info.version, path);
    const licenses = (await readdir(new URL(`${path}/`, root))).filter(name => /^(license(?:\.(?:txt|md))?|copying)$/i.test(name));
    assert.ok(licenses.length > 0, `No installed license: ${path}`);
    for (const name of licenses) assert.ok(notices.includes(normalized(await text(`${path}/${name}`))), `Missing license notice: ${path}/${name}`);
  }
});

test('all bundled font-family copyright and OFL terms are preserved in public notices', async () => {
  const notices = normalized(await text('public/FONT-LICENSES.txt'));
  const licenses = (await readdir(new URL('assets/fonts/', root))).filter(name => /OFL\.txt$/i.test(name));
  assert.ok(licenses.length > 0);
  for (const name of licenses) assert.ok(notices.includes(normalized(await text(`assets/fonts/${name}`))), `Missing font notice: ${name}`);
});
