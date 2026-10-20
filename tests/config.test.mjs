import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Hosted ownership checks must be explicit and portable, never tied to a private account.
test('hosted verification requires an explicit team identity before loading browser tooling', async () => {
  const script = fileURLToPath(new URL('./hosted.mjs', import.meta.url));
  for (const [slug, id] of [['', ''], ['example-team', ''], ['', 'example-team-id']]) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, EXPECTED_TEAM_SLUG: slug, EXPECTED_TEAM_ID: id },
      encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /EXPECTED_TEAM_SLUG and EXPECTED_TEAM_ID required/);
  }
  const source = await readFile(script, 'utf8');
  assert.match(source, /assert\.equal\(space\.teamSlug, expectedTeamSlug\)/);
  assert.match(source, /assert\.equal\(space\.teamId, expectedTeamId\)/);
});

test('hosted security headers use the supported single-wildcard matcher', async () => {
  const config = JSON.parse(await readFile(new URL('../sf.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.headers, [{ source: '/*', headers: [
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ] }]);
});
