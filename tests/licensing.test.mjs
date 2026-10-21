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
  const publicNotices = await readFile(new URL('public/FONT-LICENSES.txt', root));
  assert.equal(createHash('sha256').update(publicNotices).digest('hex'), '2b649e87c065b713d07c0fcd0f643382e8035b71d2ef2d023677863244a58250');
  const notices = normalized(publicNotices.toString('utf8'));
  const hashes = {
    'EBGaramond-OFL.txt': '0985066662eb755ed3683ae5482a81a9195b49ce3f7e165cc2388b3dbece7dd7',
    'Inter-OFL.txt': '5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57',
    'facultyglyphic-OFL.txt': '5a6185c9e0232792afbef890406b569471ceda95e59d1999b602a8047d54be64',
    'kumbhsans-OFL.txt': 'b7057fc68425720a92830bbd18b39f070d784a4551de7b0b7e1ad3cc6747d3fc',
    'cardo-OFL.txt': '8e28b778b6e1a7ff9ca72f4dee2d53120aa2856dc1bfd0be44307e365b0e45bb',
    'OpenSans-OFL.txt': 'fbbbcfef55318de350562559b671360de6d597112ecc5c73881b05092db89602',
  };
  const directories = {
    'assets/fonts/': ['EBGaramond-OFL.txt', 'Inter-OFL.txt'],
    'events/wordcamp-asia/fonts/': ['facultyglyphic-OFL.txt', 'kumbhsans-OFL.txt'],
    'events/wordcamp-europe/fonts/': ['cardo-OFL.txt', 'Inter-OFL.txt'],
    'events/wordcamp-india/fonts/': ['cardo-OFL.txt', 'Inter-OFL.txt'],
    'events/wordcamp-us/fonts/': ['OpenSans-OFL.txt'],
  };
  for (const [directory, expected] of Object.entries(directories)) {
    const licenses = (await readdir(new URL(directory, root))).filter(name => /OFL\.txt$/i.test(name));
    assert.deepEqual(licenses.sort(), [...expected].sort(), directory);
    for (const name of expected) {
      const original = await readFile(new URL(directory + name, root));
      assert.equal(createHash('sha256').update(original).digest('hex'), hashes[name], directory + name);
      assert.ok(notices.includes(normalized(original.toString('utf8'))), `Missing font notice: ${directory}${name}`);
    }
  }
});
