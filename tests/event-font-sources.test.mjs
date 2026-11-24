import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fonts from '../events/fonts.js';
import * as compatibility from '../shared/event-fonts.js';

const root = new URL('../', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const read = path => readFile(new URL(path, root));
const selections = {
  asia: ['faculty-glyphic-400', 'kumbh-sans-400', 'kumbh-sans-400'],
  europe: ['cardo-400', 'inter-400', 'inter-600'],
  india: ['cardo-700', 'inter-400', 'inter-600'],
};
// Original provenance records, including URL, bytes and reuse caveats.
const provenanceHashes = {
  asia: '8e25eb36c2f7ac630e9f8c5cbe8da49f3f6647df79790d528bca32ab7b5a3653',
  europe: '9d85eaf4b7eff92c4297ea48089c8053443056b5b928d64ec8a03de60c8bed7f',
  india: 'd5bf951f2f7e013cbeb76a01356874dd70e9be51d0082e7f5291b2a3fbe66243',
};
const licenses = {
  asia: ['facultyglyphic-OFL.txt', 'kumbhsans-OFL.txt'],
  europe: ['cardo-OFL.txt', 'Inter-OFL.txt'],
  india: ['cardo-OFL.txt', 'Inter-OFL.txt'],
};

test('each event owns its exact pinned sources, provenance and edition selections', async () => {
  for (const [event, keys] of Object.entries(selections)) {
    const directory = `events/wordcamp-${event}/fonts/`;
    const manifest = JSON.parse(await read(directory + 'manifest.json'));
    assert.deepEqual(Object.keys(manifest), ['editions', 'assets']);
    assert.deepEqual(manifest.editions, { [`${event}-2027`]: keys });
    assert.equal(sha(JSON.stringify(manifest.assets)), provenanceHashes[event], event);
    const files = ['manifest.json', ...licenses[event]];
    for (const asset of manifest.assets) {
      assert.match(asset.path, /^[\w-]+\.woff2$/);
      const data = await read(directory + asset.path);
      assert.equal(data.length, asset.bytes);
      assert.equal(sha(data), asset.sha256);
      files.push(asset.path);
      for (const weight of asset.weights) {
        const key = `${asset.family.toLowerCase().replaceAll(' ', '-')}-${weight}`;
        assert.equal(fonts.EVENT_FONT_METRICS[key].asset, asset.path);
      }
    }
    assert.deepEqual((await readdir(new URL(directory, root))).sort(), files.sort());
    assert.deepEqual(Object.values(fonts.EVENT_FONTS[`${event}-2027`]).map(face => face.key), keys);
  }
  const base = await readdir(new URL('assets/fonts/', root));
  assert.ok(!base.includes('event-provenance.json'));
  assert.ok(!base.some(name => /^(Cardo-|Faculty-|Kumbh-|cardo-|facultyglyphic-|kumbhsans-)/.test(name)));
  for (const event of ['europe', 'india']) {
    for (const name of ['Inter-latin.woff2', 'Inter-OFL.txt']) {
      assert.deepEqual(await read(`events/wordcamp-${event}/fonts/${name}`), await read(`assets/fonts/${name}`));
    }
  }
});

test('base font inputs, generator and generated module stay byte-identical', async () => {
  const unchanged = {
    'assets/fonts/EBGaramond-OFL.txt': '0985066662eb755ed3683ae5482a81a9195b49ce3f7e165cc2388b3dbece7dd7',
    'assets/fonts/EBGaramond-latin.woff2': '6bca857ff2832e3d5cceb8b4376f3f1f9df403491e1e2500ecdab2242b191464',
    'assets/fonts/Inter-OFL.txt': '5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57',
    'assets/fonts/Inter-latin.woff2': 'fc4951f0824bd067d107592ae2dc5f1309da1ad69a90c13a7158d7fcb99dc805',
    'assets/fonts/provenance.json': '455abbb34b428be1c0ca1e329ef2808f0136c4f4e1300c529cff5d3ff4d36056',
    'shared/fonts.js': 'f10954f825f8e2939730309f86cf9546b5c91b6298df7e5e50d0a64fd8bef2aa',
    'tools/build-fonts.py': 'a22897920f72be9587dbea5237f3da270cdc74cf09ad4ea82f21f815ad047d47',
  };
  for (const [path, hash] of Object.entries(unchanged)) assert.equal(sha(await read(path)), hash, path);
});

test('font exports, key ordering, CSS and CSP hashes match the pinned baseline', () => {
  const hashes = {
    EVENT_FONTS: 'e42fb61d66fc16fbcee0779afcd454b1021a7fd8b80c48422b2e1ea498ad46fd',
    EVENT_FONT_CSS: '1f2b97d5363c6f164abd1eabfcc5559f7a219b0d17e2aec3ee8f66d9fb65d212',
    EVENT_FONT_METRICS: '1b245e1e925f8f1ae5f9fac56351bda4f9e50b7d254a318d033563bfbfd985e7',
    EVENT_FONT_STYLE_HASH: 'aae36b3206e4321c22cb5f1d183ebae8e8e96c8079015348f0380cbca9abd516',
  };
  assert.deepEqual(Object.keys(compatibility), Object.keys(fonts));
  for (const key of Object.keys(fonts)) assert.equal(compatibility[key], fonts[key], key);
  for (const [key, hash] of Object.entries(hashes)) assert.equal(sha(JSON.stringify(fonts[key])), hash, key);
  for (const [edition, css] of Object.entries(fonts.EVENT_FONT_CSS)) {
    assert.equal(fonts.EVENT_FONT_STYLE_HASH[edition], 'sha256-' + createHash('sha256').update(css).digest('base64'));
  }
});

test('generator rejects conflicting duplicates, corrupt copies and nonlocal selections', async t => {
  const script = fileURLToPath(new URL('tools/build-event-fonts.py', root));
  const cases = [
    ['identical Inter copies deduplicate', null, null],
    ['conflicting asset metadata', m => { m.assets[1].note += ' conflicting'; }, /Conflicting asset definition/],
    ['conflicting face definition', m => { m.assets[0].family = 'Inter'; m.assets[0].weights = [400]; }, /Conflicting face definition/],
    ['nonlocal selection', m => { m.editions['india-2027'][0] = 'faculty-glyphic-400'; }, /three local faces/],
    ['duplicate edition', m => { m.editions['asia-2027'] = m.editions['india-2027']; }, /Duplicate edition definition/],
    ['escaping path', m => { m.assets[0].path = '../Cardo-700.woff2'; }, /Non-local font path/],
    ['corrupt duplicate bytes', null, /Font bytes\/hash mismatch/],
  ];
  for (const [name, mutate, error] of cases) await t.test(name, async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'event-font-sources-'));
    try {
      for (const event of Object.keys(selections)) {
        await cp(new URL(`events/wordcamp-${event}/fonts/`, root), join(fixture, 'events', `wordcamp-${event}`, 'fonts'), { recursive: true });
      }
      const manifestPath = join(fixture, 'events/wordcamp-india/fonts/manifest.json');
      if (mutate) {
        const manifest = JSON.parse(await readFile(manifestPath));
        mutate(manifest);
        await writeFile(manifestPath, JSON.stringify(manifest));
      }
      if (name === 'corrupt duplicate bytes') await writeFile(join(fixture, 'events/wordcamp-india/fonts/Inter-latin.woff2'), 'corrupt');
      // -S excludes site-packages: routine npm tests/builds need no fontTools.
      const result = spawnSync('python3', ['-B', '-S', '-c', 'import runpy,sys; from pathlib import Path; inputs,selections=runpy.run_path(sys.argv[1])["load_sources"](Path(sys.argv[2])); assert len(inputs)==5; assert len(selections)==3', script, fixture], { encoding: 'utf8' });
      assert.ifError(result.error);
      if (error) {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, error);
      } else assert.equal(result.status, 0, result.stderr);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
