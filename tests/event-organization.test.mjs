import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const regions = ['asia', 'europe', 'india'];
// Editions whose social card is drawn here. WordCamp Asia's is made from its frame artwork.
const drawn = ['europe', 'india'];
const load = path => import(new URL(path, root));
const source = path => readFile(new URL(path, root), 'utf8');

test('event directories own immutable editions, theme tokens and artwork', async () => {
  const { EVENTS } = await load('events/catalog.js');
  const themes = await load('events/themes.js');
  const { EVENT_THEMES } = themes;
  const { EVENT_ARTWORK } = await load('events/artwork.js');
  const { EVENT_FRAMES } = await load('events/frames.js');
  assert.deepEqual(EVENTS.map(event => event.id), regions.map(region => `${region}-2027`));
  assert.ok(Object.isFrozen(EVENTS));
  assert.deepEqual(Object.keys(themes), ['EVENT_THEMES']);
  assert.ok(Object.isFrozen(EVENT_THEMES)); assert.ok(Object.isFrozen(EVENT_ARTWORK));
  assert.deepEqual(Object.keys(EVENT_THEMES), regions.map(region => `${region}-2027`));
  assert.deepEqual(Object.keys(EVENT_ARTWORK), drawn.map(region => `${region}-2027`));
  assert.deepEqual((await readdir(new URL('events/', root))).filter(name => name.startsWith('wordcamp-')).sort(), regions.map(region => `wordcamp-${region}`).sort(), 'no event folder without an edition');
  for (const region of regions) {
    const dir = `events/wordcamp-${region}/`;
    const { editions } = await load(dir + 'event.js');
    const module = await load(dir + 'theme.js');
    const { theme } = module;
    assert.deepEqual(Object.keys(module), ['theme']);
    assert.ok(Object.isFrozen(editions));
    assert.deepEqual(Object.keys(theme), ['colors', 'styleNote']);
    assert.ok(Object.isFrozen(theme));
    assert.ok(Object.isFrozen(theme.colors));
    assert.equal(EVENT_THEMES[`${region}-2027`], theme);
    const files = await readdir(new URL(dir, root));
    // A drawn design exists exactly where something is drawn from it.
    assert.equal(files.includes('artwork.js'), drawn.includes(region), `${region}: artwork.js`);
    if (drawn.includes(region)) {
      const artwork = await load(dir + 'artwork.js');
      assert.deepEqual(Object.keys(artwork).sort(), ['announcementDecoration', 'announcementHeading', 'frameDecoration']);
      for (const name of Object.keys(artwork)) {
        assert.equal(typeof artwork[name], 'function');
        assert.equal(EVENT_ARTWORK[`${region}-2027`][name], artwork[name]);
      }
    }
    assert.equal(editions.length, 1);
    const edition = editions[0];
    assert.ok(Object.isFrozen(edition));
    assert.equal(edition.id, `${region}-2027`);
    // Editions with avatar-frame artwork also list the roles it covers, and say when
    // that artwork has the bands a social card is made from.
    const roles = EVENT_FRAMES[edition.id].roles;
    const banded = Object.values(roles).every(role => role.band);
    assert.equal(banded, !drawn.includes(region), `${region}: a social card is drawn or made from frames, never both`);
    assert.deepEqual(EVENTS.find(event => event.id === edition.id), { ...edition, ...theme, frameRoles: Object.keys(roles), ...(banded ? { frameCard: true } : {}) });
    assert.equal(Object.hasOwn(edition, 'frameCard'), false, 'frameCard follows the artwork; it is not set by hand');
    assert.ok(!files.some(name => /^20\d{2}$/.test(name)), 'editions are data, not year directories');
  }
});

test('compatibility modules explicitly re-export canonical events modules', async () => {
  for (const [oldPath, newPath, names] of [
    ['shared/events.js', 'events/catalog.js', ['EVENTS', 'ROLES']],
    ['shared/event-themes.js', 'events/themes.js', ['EVENT_THEMES']],
    ['shared/social.js', 'events/social.js', ['renderSocial', 'socialStyleHash']]
  ]) {
    const oldModule = await load(oldPath);
    const canonical = await load(newPath);
    assert.deepEqual(Object.keys(oldModule).sort(), [...names].sort());
    for (const name of names) assert.equal(oldModule[name], canonical[name]);
    const code = await source(oldPath);
    assert.match(code, /export\s*\{[^}]+\}\s*from\s*['"]\.\.\/events\//);
    assert.doesNotMatch(code, /export\s*\*|function\s|Object\.freeze/);
  }
});

test('catalog dependency graph contains only lightweight metadata and theme modules', async () => {
  const visited = new Set();
  async function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    assert.match(path, /^events\/(?:catalog\.js|themes\.js|frames\.js|wordcamp-[a-z]+\/(?:event|theme)\.js)$/);
    const code = await source(path);
    assert.doesNotMatch(code, /data:|base64|@font-face|<svg|<path|import\s*\(/);
    for (const [, specifier] of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      assert.ok(specifier.startsWith('.'), 'no runtime packages or remote modules');
      const url = new URL(specifier, new URL(path, root));
      await visit(url.href.slice(root.href.length));
    }
  }
  await visit('events/catalog.js');
  assert.ok(visited.has('events/frames.js'), 'frame metadata only; payload modules stay outside the catalog');
  for (const region of regions) {
    assert.ok(visited.has(`events/wordcamp-${region}/event.js`));
    assert.ok(visited.has(`events/wordcamp-${region}/theme.js`));
  }
});

test('shared geometry has no event-specific styling branches or embedded artwork', async () => {
  const code = await source('events/social.js');
  // The existing default edition is an API invariant, not a styling branch.
  const withoutDefault = code.replace("options.event ?? 'asia-2027'", 'options.event');
  assert.doesNotMatch(withoutDefault, /(?:asia|europe|india|us)-20\d{2}|botanical|#3DD68C|#FCC626/);
  assert.match(code, /EVENT_ARTWORK\[event\.id\]/);
});
