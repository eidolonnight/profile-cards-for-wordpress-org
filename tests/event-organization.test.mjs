import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const regions = ['asia', 'europe', 'us', 'india'];
const load = path => import(new URL(path, root));
const source = path => readFile(new URL(path, root), 'utf8');

test('event directories own immutable editions, theme tokens, layout preferences and artwork', async () => {
  const { EVENTS } = await load('events/catalog.js');
  const { EVENT_THEMES, EVENT_LAYOUTS } = await load('events/themes.js');
  const { EVENT_ARTWORK } = await load('events/artwork.js');
  assert.deepEqual(EVENTS.map(event => event.id), regions.map(region => `${region}-2027`));
  assert.ok(Object.isFrozen(EVENTS));
  for (const registry of [EVENT_THEMES, EVENT_LAYOUTS, EVENT_ARTWORK]) {
    assert.ok(Object.isFrozen(registry));
    assert.deepEqual(Object.keys(registry), EVENTS.map(event => event.id));
  }
  for (const region of regions) {
    const dir = `events/wordcamp-${region}/`;
    const { editions } = await load(dir + 'event.js');
    const { theme, layout } = await load(dir + 'theme.js');
    const artwork = await load(dir + 'artwork.js');
    assert.ok(Object.isFrozen(editions));
    assert.equal(editions.length, 1);
    const edition = editions[0];
    assert.ok(Object.isFrozen(edition));
    assert.equal(edition.id, `${region}-2027`);
    assert.deepEqual(Object.keys(theme), ['colors', 'styleNote']);
    assert.ok(Object.isFrozen(theme));
    assert.ok(Object.isFrozen(theme.colors));
    assert.ok(Object.isFrozen(layout));
    assert.equal(EVENT_THEMES[edition.id], theme);
    assert.equal(EVENT_LAYOUTS[edition.id], layout);
    assert.deepEqual(EVENTS.find(event => event.id === edition.id), { ...edition, ...theme });
    for (const name of ['frameDecoration', 'announcementDecoration', 'announcementHeading']) {
      assert.equal(typeof artwork[name], 'function');
      assert.equal(EVENT_ARTWORK[edition.id][name], artwork[name]);
    }
    assert.ok(!(await readdir(new URL(dir, root))).some(name => /^20\d{2}$/.test(name)), 'editions are data, not year directories');
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
    assert.match(path, /^events\/(?:catalog\.js|themes\.js|wordcamp-[a-z]+\/(?:event|theme)\.js)$/);
    const code = await source(path);
    assert.doesNotMatch(code, /data:|base64|@font-face|<svg|<path|import\s*\(/);
    for (const [, specifier] of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      assert.ok(specifier.startsWith('.'), 'no runtime packages or remote modules');
      const url = new URL(specifier, new URL(path, root));
      await visit(url.href.slice(root.href.length));
    }
  }
  await visit('events/catalog.js');
  for (const region of regions) {
    assert.ok(visited.has(`events/wordcamp-${region}/event.js`));
    assert.ok(visited.has(`events/wordcamp-${region}/theme.js`));
  }
});

test('shared geometry has no event-specific styling branches or embedded artwork', async () => {
  const code = await source('events/social.js');
  // The existing default edition is an API invariant, not a styling branch.
  const withoutDefault = code.replace("options.event ?? 'asia-2027'", 'options.event');
  assert.doesNotMatch(withoutDefault, /(?:asia|europe|india|us)-20\d{2}|botanical|template-blue|#3DD68C|#FCC626/);
  assert.match(code, /EVENT_ARTWORK\[event\.id\]/);
  assert.match(code, /EVENT_LAYOUTS\[event\.id\]/);
});
