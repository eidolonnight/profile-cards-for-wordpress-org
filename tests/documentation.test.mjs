import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const regions = ['asia', 'europe', 'india'];

test('human README stays short and explains organizer updates through agent PRs', async () => {
  const readme = await readFile(new URL('README.md', root), 'utf8');
  assert.ok(readme.trim().split(/\s+/).length <= 350, 'Keep operational details in agent/reference docs');
  assert.match(readme, /## Update your event's theme/);
  for (const region of regions) assert.ok(readme.includes(`events/wordcamp-${region}/`));
  for (const entry of ['theme.js', 'artwork.js', 'fonts/', 'event.js', 'AGENTS.md', 'events/README.md']) assert.ok(readme.includes(entry));
  assert.match(readme, /pull request/); assert.match(readme, /before-and-after previews/);
  assert.doesNotMatch(readme, /npm |node --|python3 |\/card\?|\/json\?|## (?:Run|Test|Routes|Formats|Deployment)/i);
});

test('avatar-frame PNG sizes are stated wherever someone sending frames reads, and match what the validator enforces', async () => {
  const tool = await readFile(new URL('tools/build-event-frames.mjs', root), 'utf8');
  const [, min, max] = tool.match(/^const MIN_SIZE = (\d+), MAX_SIZE = (\d+);$/m);
  const [, output] = tool.match(/^const OUTPUT_SIZE = (\d+);$/m);
  assert.match(tool, /^const MAX_FRAME_BYTES = 1024 \* 1024;$/m);
  assert.equal(min, output, 'the recommended size is the size people download');
  for (const path of ['README.md', 'events/README.md', ...regions.map(region => `events/wordcamp-${region}/README.md`)]) {
    const text = await readFile(new URL(path, root), 'utf8');
    for (const size of [`${min} × ${min} px`, `${max} × ${max} px`, '1 MiB']) assert.ok(text.includes(size), `${path}: say "${size}"`);
    assert.match(text, /same size for every role/i, `${path}: one size across roles`);
  }
  const guide = await readFile(new URL('events/README.md', root), 'utf8');
  assert.ok(guide.includes('1,048,576 bytes'), 'the guide gives the exact byte limit');
  assert.match(guide, /\| Canvas \| Square, from 1080 × 1080 px to 2048 × 2048 px \| 1080 × 1080 px \|/);
});

test('human, agent, event and licensing guides link to existing local targets', async () => {
  const documents = ['README.md', 'AGENTS.md', 'LICENSING.md', 'docs/technical-reference.md', 'events/README.md', 'events/FONTS.md', ...regions.map(region => `events/wordcamp-${region}/README.md`)];
  for (const path of documents) {
    const document = new URL(path, root);
    const text = await readFile(document, 'utf8');
    for (const [, href] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(href)) continue;
      const target = new URL(href.split('#')[0], document);
      assert.ok(target.href.startsWith(root.href), `${path}: local link escapes project`);
      await assert.doesNotReject(stat(target), `${path}: broken link ${href}`);
    }
    assert.doesNotMatch(text, /docs\/event-themes\.md|assets\/fonts\/event-provenance\.json|assets\/fonts\/EVENT-FONTS\.md/);
  }
});
