import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { BROWSER_MODULES, EVENT_MODULES, browserModuleSource } from '../tools/browser-modules.mjs';

const revision = 'a'.repeat(64);
test('browser module aliases cover event sources and preserve existing entry URLs', () => {
  assert.equal(new Set(BROWSER_MODULES.map(([from]) => from)).size, BROWSER_MODULES.length);
  assert.equal(new Set(BROWSER_MODULES.map(([, to]) => to)).size, BROWSER_MODULES.length);
  for (const event of ['asia', 'europe', 'india', 'us']) {
    for (const file of ['event.js', 'theme.js', 'artwork.js']) assert.ok(EVENT_MODULES.includes(`events/wordcamp-${event}/${file}`));
  }
  for (const name of ['preview', 'options', 'svg', 'social', 'fonts', 'events', 'event-themes', 'event-fonts']) assert.ok(BROWSER_MODULES.some(([from, to]) => from === `shared/${name}.js` && to === `preview/${name}.js`));
  assert.ok(BROWSER_MODULES.every(([path]) => path.endsWith('.js') && !path.includes('/fonts/')));
});
test('all imports and re-exports resolve within the explicit versioned browser graph', async () => {
  const destinations = new Set(BROWSER_MODULES.map(([, to]) => to));
  for (const [from, to] of BROWSER_MODULES) {
    const original = await readFile(new URL('../' + from, import.meta.url), 'utf8');
    for (const version of ['', revision]) {
      const output = browserModuleSource(to, original, version);
      for (const match of output.matchAll(/^(?:import|export)\s+[^;]+?\s+from\s+(['"])([^'"]+)\1/gm)) {
        const [path, query] = match[2].split('?');
        assert.equal(query, version ? `v=${version}` : undefined, `${to}: revision`);
        assert.ok(destinations.has(posix.normalize(posix.join(posix.dirname(to), path))), `${to}: ${path}`);
      }
    }
  }
});
test('relocated imports and re-exports use aliases without changing other bytes', () => {
  const source = "// preserve\nexport { EVENTS } from '../events/catalog.js';\n";
  assert.equal(browserModuleSource('preview/events.js', source, revision), `// preserve\nexport { EVENTS } from './events/catalog.js?v=${revision}';\n`);
  assert.equal(browserModuleSource('preview/events/social.js', "import { xml } from '../shared/svg.js';\n"), "import { xml } from '../svg.js';\n");
  assert.throws(() => browserModuleSource('preview/events.js', "export * from '../events/private.js';"), /not allowlisted/);
  assert.throws(() => browserModuleSource('preview/missing.js', ''), /not allowlisted/);
  assert.throws(() => browserModuleSource('preview/events.js', '', 'bad-revision'), /revision/);
});
