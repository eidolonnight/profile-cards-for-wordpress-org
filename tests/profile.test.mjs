import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { queryOptions, parseProfile, safeAvatar, boundedFetch, getProfile, getAvatarData, profileMaxAgeMs } from '../functions/_profile.js';
import { renderCard } from '../functions/_svg.js';
import { GET as jsonGET } from '../functions/json.js';
import { GET as cardGET } from '../functions/card.js';

// Deliberately synthetic test fixture, never served as example profile data.
const fixture = (username = 'fixture') => `<html><head><meta property="profile:username" content="${username}"></head><body><header class="site-header"><h2>Ada &amp; Example</h2><img class="avatar" src="https://secure.gravatar.com/avatar/${'a'.repeat(64)}?s=224"><span class="wp-p2-joined">joined Jan 2001</span></header><li id="user-member-since"><strong>January 2nd, 2001</strong></li><section class="wp-p2-badges-block"><span class="medal badge-code"><span class="mi dashicons dashicons-editor-code"></span><span class="mn">Core Contributor</span></span><span class="medal badge-marketing"><span class="mn">Marketing Team</span></span></section></body></html>`;
const options = (q = '') => queryOptions(new Request(`http://localhost/card?username=fixture${q}`));
const htmlResponse = (username) => new Response(fixture(username), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const apiResponse = (username) => Response.json({
  id: 42,
  name: 'Fallback Example',
  slug: username,
  link: `https://profiles.wordpress.org/${username}/`,
  avatar_urls: { 96: `//www.gravatar.com/avatar/${'c'.repeat(32)}?s=96&#038;r=g&#038;d=mm` },
});

test('query defaults and compatible explicit options', () => {
  assert.equal(options().avatar, true); assert.equal(options().link, false);
  const q = options('&foreground=abcdef&header=false&refresh=true');
  assert.equal(q.foreground, 'ABCDEF'); assert.equal(q.header, false); assert.equal(q.refresh, true);
});
test('reject malformed inputs, traversal, injection, repeated and unknown parameters', () => {
  for (const query of ['', '?username=../bad', '?username=%2F%2Fexample.com', '?username=UpperCase', '?username=a%20', '?username=' + 'a'.repeat(61), '?username=a&username=b', '?username=a&header=yes', '?username=a&foreground=%23abcdef', '?username=a&nameColor=ff0000%22', '?username=a&endpoint=https://example.com']) assert.throws(() => queryOptions(new Request(`https://site.test/card${query}`)));
});
test('parses real-shaped profile HTML and compatible JSON fields', () => {
  const p = parseProfile(fixture(), 'fixture', 0);
  assert.equal(p.name, 'Ada & Example'); assert.equal(p.memberSince, 'January 2nd, 2001'); assert.equal(p.fetchedAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(p.badges.map(b => b.name), ['Core Contributor', 'Marketing Team']);
  assert.equal(p.badges[0].class, 'badge-code dashicons dashicons-editor-code');
  assert.match(p.avatar, /^https:\/\/secure\.gravatar\.com\/avatar\/[a-f0-9]+\?s=320&d=mp&r=g$/);
});
test('supports legacy linked heading and new joined fallback with no badges', () => {
  const p = parseProfile('<header class="site-header"><h2><a>Example</a></h2><span class="wp-p2-joined">joined May 2020</span></header>', 'example');
  assert.equal(p.name, 'Example'); assert.equal(p.memberSince, 'May 2020'); assert.deepEqual(p.badges, []); assert.equal(p.avatar, null);
});
test('fails closed on non-profile HTML and mismatched identities', () => {
  assert.throws(() => parseProfile('<h1>Maintenance</h1>', 'fixture'), { code: 'profile_unreadable' });
  assert.throws(() => parseProfile(fixture('another'), 'fixture'), { code: 'profile_mismatch' });
});
test('restricts avatar origin and route, never trusts page-provided request URLs', () => {
  for (const value of ['http://secure.gravatar.com/avatar/' + 'a'.repeat(32), 'https://secure.gravatar.com.evil.test/avatar/' + 'a'.repeat(32), 'https://127.0.0.1/avatar/' + 'a'.repeat(32), 'https://user@secure.gravatar.com/avatar/' + 'a'.repeat(32), 'https://secure.gravatar.com:999/avatar/' + 'a'.repeat(32), 'data:image/svg+xml,hi', 'https://secure.gravatar.com/profile/abc']) assert.equal(safeAvatar(value), null);
});
test('bounded fetch maps missing, rate-limit, redirects and failed upstream', async () => {
  for (const [status, code] of [[404, 'profile_not_found'], [429, 'upstream_busy'], [302, 'upstream_unavailable'], [500, 'upstream_unavailable']]) {
    await assert.rejects(() => boundedFetch('https://profiles.wordpress.org/example/', { fetcher: async (_url, init) => { assert.equal(init.redirect, 'manual'); return new Response('error', { status, headers: status === 429 ? { 'Retry-After': '120' } : {} }); } }), error => {
      assert.equal(error.code, code);
      if (status === 429) assert.equal(error.retryAfterMs, 120000);
      return true;
    });
  }
  await assert.rejects(() => boundedFetch('https://profiles.wordpress.org/example/', { fetcher: async () => new Response('limited', { status: 429, headers: { 'Retry-After': '7200' } }) }), error => {
    assert.equal(error.code, 'upstream_busy'); assert.equal(error.retryAfterMs, 15 * 60 * 1000); return true;
  });
});
test('bounded fetch rejects oversized streamed and declared bodies', async () => {
  await assert.rejects(() => boundedFetch('https://profiles.wordpress.org/example/', { maxBytes: 2, fetcher: async () => new Response('123') }), { code: 'upstream_too_large' });
  await assert.rejects(() => boundedFetch('https://profiles.wordpress.org/example/', { maxBytes: 2, fetcher: async () => new Response('1', { headers: { 'Content-Length': '100' } }) }), { code: 'upstream_too_large' });
});
test('upstream timeouts return a useful error', async () => {
  await assert.rejects(() => boundedFetch('https://profiles.wordpress.org/example/', { timeout: 10, fetcher: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))) }), { code: 'upstream_unavailable' });
});
test('profile fetch is fixed-origin, cached, coalesced and refresh-throttled', async () => {
  let calls = 0; const now = Date.now();
  const fetcher = async (url) => { calls++; assert.equal(url, 'https://profiles.wordpress.org/cache-test/'); await new Promise(r => setTimeout(r, 5)); return htmlResponse('cache-test'); };
  await Promise.all([getProfile('cache-test', { fetcher, now }), getProfile('cache-test', { fetcher, now })]); assert.equal(calls, 1);
  await getProfile('cache-test', { fetcher, now: now + 1, refresh: true }); assert.equal(calls, 1);
  await getProfile('cache-test', { fetcher, now: now + 61000, refresh: true }); assert.equal(calls, 2);
  await getProfile('cache-test', { fetcher, now: now + 15 * 60 * 1000 }); assert.equal(calls, 2);
  await getProfile('cache-test', { fetcher, now: now + 62 * 60 * 1000 }); assert.equal(calls, 3);
});
test('avatar embeds only bounded raster data, not arbitrary SVG', async () => {
  const avatar = `https://secure.gravatar.com/avatar/${'b'.repeat(64)}`;
  assert.equal(await getAvatarData(avatar, async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })), null);
  assert.equal(await getAvatarData(avatar, async () => new Response('not png', { headers: { 'content-type': 'image/png' } })), null);
});
test('SVG is script-free, escaped, deterministic, and all badges are present', () => {
  const p = parseProfile(fixture(), 'fixture'); p.name = 'Name <script>&"'; p.badges.push({ name: '<img onerror=alert(1)>', class: '' });
  const svg = renderCard(p, options('&link=true'));
  const doc = parseHTML(svg).document;
  assert.equal(doc.querySelectorAll('script,foreignObject,img').length, 0);
  assert.ok(svg.includes('&lt;script&gt;&amp;&quot;')); assert.ok(svg.includes('&lt;img onerror=alert(1)&gt;'));
  assert.ok(svg.includes('Core Contributor')); assert.ok(svg.includes('Marketing Team'));
  assert.equal(svg, renderCard(p, options('&link=true')));
  assert.equal(doc.querySelector('a').getAttribute('href'), 'https://profiles.wordpress.org/fixture/');
});
test('all combinations of visibility flags render valid geometry and correct visibility', () => {
  const p = parseProfile(fixture(), 'fixture');
  for (const header of [true, false]) for (const badges of [true, false]) for (const avatar of [true, false]) for (const link of [true, false]) {
    const svg = renderCard(p, { ...options(), header, badges, avatar, link }); const doc = parseHTML(svg).document;
    assert.ok(Number(doc.querySelector('svg').getAttribute('height')) >= 116);
    assert.equal(svg.includes('CONTRIBUTOR BADGES'), badges); assert.equal(!!doc.querySelector('a'), link);
    if (!header) assert.equal(svg.includes('@fixture'), false);
  }
});
test('long text and badge lists expand card height without omission', () => {
  const p = parseProfile(fixture(), 'fixture'); p.name = 'Long '.repeat(40); p.badges = Array.from({ length: 80 }, (_, i) => ({ name: `Fixture badge ${i} ${'longword'.repeat(8)}`, class: '' }));
  const svg = renderCard(p, options()); assert.ok(Number(parseHTML(svg).document.querySelector('svg').getAttribute('height')) > 1000); assert.ok(svg.includes('Fixture badge 79'));
});
test('actual route exports return useful HTTP errors and correct types', async () => {
  const missing = await jsonGET(new Request('https://site.test/json')); assert.equal(missing.status, 400); assert.equal((await missing.json()).error.code, 'invalid_username');
  const invalid = await cardGET(new Request('https://site.test/card?username=fixture&nameColor=not-a-color')); assert.equal(invalid.status, 400); assert.match(invalid.headers.get('content-type'), /application\/json/);
  const savedFetch = globalThis.fetch; globalThis.fetch = async () => htmlResponse('route-test');
  try {
    const good = await jsonGET(new Request('https://site.test/json?username=route-test')); assert.equal(good.status, 200); assert.equal((await good.json()).name, 'Ada & Example');
    const card = await cardGET(new Request('https://site.test/card?username=route-test&avatar=false')); assert.equal(card.status, 200); assert.match(card.headers.get('content-type'), /^image\/svg\+xml/); assert.match(await card.text(), /Core Contributor/); assert.equal(card.headers.get('cache-control'), 'private, no-store');
  } finally { globalThis.fetch = savedFetch; }
});

test('profile throttling falls back to the public WordPress.org user endpoint and starts a cooldown', async () => {
  const calls = []; const now = 10_000_000;
  const profile = await getProfile('rate-fallback-test', { now, fetcher: async url => {
    calls.push(url);
    if (url === 'https://profiles.wordpress.org/rate-fallback-test/') return new Response('limited', { status: 429, headers: { 'Retry-After': '120' } });
    assert.equal(url, 'https://profiles.wordpress.org/wp-json/wporg/v1/users/rate-fallback-test');
    return apiResponse('rate-fallback-test');
  } });
  assert.deepEqual(calls, [
    'https://profiles.wordpress.org/rate-fallback-test/',
    'https://profiles.wordpress.org/wp-json/wporg/v1/users/rate-fallback-test',
  ]);
  assert.equal(profile.userName, 'rate-fallback-test');
  assert.equal(profile.name, 'Fallback Example');
  assert.equal(profile.userId, '42');
  assert.equal(profile.partial, true);
  assert.equal(profile.stale, undefined);
  assert.match(profile.avatar, new RegExp(`^https://www\\.gravatar\\.com/avatar/${'c'.repeat(32)}\\?s=320`));

  const cooldownCalls = [];
  const cooldownProfile = await getProfile('cooldown-fallback-test', { now: now + 1000, fetcher: async url => {
    cooldownCalls.push(url);
    assert.equal(url, 'https://profiles.wordpress.org/wp-json/wporg/v1/users/cooldown-fallback-test');
    return apiResponse('cooldown-fallback-test');
  } });
  assert.equal(cooldownProfile.partial, true);
  assert.deepEqual(cooldownCalls, ['https://profiles.wordpress.org/wp-json/wporg/v1/users/cooldown-fallback-test']);
});

test('fallback throttling suppresses both profile endpoints for its retry interval', async () => {
  const calls = []; const now = 12_000_000;
  await getProfile('cooldown-seed-test', { now, fetcher: async url => {
    calls.push(url);
    if (url === 'https://profiles.wordpress.org/cooldown-seed-test/') return new Response('limited', { status: 429, headers: { 'Retry-After': '10' } });
    return apiResponse('cooldown-seed-test');
  } });
  await assert.rejects(
    getProfile('cooldown-extend-test', { now: now + 1000, fetcher: async url => {
      calls.push(url);
      assert.equal(url, 'https://profiles.wordpress.org/wp-json/wporg/v1/users/cooldown-extend-test');
      return new Response('limited', { status: 429, headers: { 'Retry-After': '120' } });
    } }),
    error => error.code === 'upstream_busy' && error.retryAfterMs === 120000,
  );
  await assert.rejects(
    getProfile('cooldown-proof-test', { now: now + 11000, fetcher: async url => {
      calls.push(url);
      throw new Error(`unexpected request during fallback cooldown: ${url}`);
    } }),
    error => error.code === 'upstream_busy' && error.retryAfterMs === 110000,
  );
  assert.equal(calls.includes('https://profiles.wordpress.org/cooldown-proof-test/'), false);
  assert.equal(calls.includes('https://profiles.wordpress.org/wp-json/wporg/v1/users/cooldown-proof-test'), false);
});

test('profile throttling serves a bounded stale full-profile cache before degrading to basic data', async () => {
  const calls = []; const now = 20_000_000;
  const fetcher = async url => {
    calls.push(url);
    assert.equal(url, 'https://profiles.wordpress.org/stale-profile-test/');
    return calls.length === 1 ? htmlResponse('stale-profile-test') : new Response('limited', { status: 429, headers: { 'Retry-After': '60' } });
  };
  const fresh = await getProfile('stale-profile-test', { now, fetcher });
  const stale = await getProfile('stale-profile-test', { now: now + 3600001, fetcher });
  assert.equal(fresh.name, 'Ada & Example');
  assert.equal(fresh.stale, undefined);
  assert.equal(stale.name, fresh.name);
  assert.equal(stale.fetchedAt, fresh.fetchedAt);
  assert.equal(stale.stale, true);
  assert.equal(stale.partial, undefined);
  assert.equal(profileMaxAgeMs(stale, now + 3600001), 300000);
  assert.deepEqual(calls, ['https://profiles.wordpress.org/stale-profile-test/', 'https://profiles.wordpress.org/stale-profile-test/']);
});

test('stale full profiles expire at the absolute 24-hour boundary even after degraded recaching', async () => {
  const calls = []; const now = 200_000_000; const window = 24 * 60 * 60 * 1000;
  const fetcher = async url => {
    calls.push(url);
    if (url.endsWith('/wp-json/wporg/v1/users/stale-boundary-test')) return apiResponse('stale-boundary-test');
    assert.equal(url, 'https://profiles.wordpress.org/stale-boundary-test/');
    return calls.length === 1 ? htmlResponse('stale-boundary-test') : new Response('limited', { status: 429, headers: { 'Retry-After': '60' } });
  };
  const fresh = await getProfile('stale-boundary-test', { now, fetcher });
  const firstStale = await getProfile('stale-boundary-test', { now: now + 3600001, fetcher });
  assert.equal(firstStale.stale, true);
  const nearBoundary = await getProfile('stale-boundary-test', { now: now + window - 1000, fetcher });
  assert.equal(nearBoundary.stale, true);
  assert.equal(profileMaxAgeMs(nearBoundary, now + window - 1000), 1000);
  assert.equal(profileMaxAgeMs(nearBoundary, now + window), 0);
  const atBoundary = await getProfile('stale-boundary-test', { now: now + window, fetcher });
  assert.equal(atBoundary.stale, undefined);
  assert.equal(atBoundary.partial, true);
  assert.equal(atBoundary.name, 'Fallback Example');
  assert.deepEqual(calls, [
    'https://profiles.wordpress.org/stale-boundary-test/',
    'https://profiles.wordpress.org/stale-boundary-test/',
    'https://profiles.wordpress.org/stale-boundary-test/',
    'https://profiles.wordpress.org/wp-json/wporg/v1/users/stale-boundary-test',
  ]);
  // Clear the synthetic cooldown so later tests can use their own clocks.
  await getProfile('stale-boundary-reset', { now: now + window + 60001, fetcher: async () => htmlResponse('stale-boundary-reset') });
  assert.equal(fresh.fetchedAt, firstStale.fetchedAt);
});

test('expired partial data is refreshed from the basic endpoint instead of entering the stale full-profile window', async () => {
  const calls = []; const now = 30_000_000;
  const fetcher = async url => {
    calls.push(url);
    if (url.endsWith('/partial-refresh-test/')) return new Response('limited', { status: 429, headers: { 'Retry-After': '60' } });
    assert.equal(url, 'https://profiles.wordpress.org/wp-json/wporg/v1/users/partial-refresh-test');
    return apiResponse('partial-refresh-test');
  };
  const first = await getProfile('partial-refresh-test', { now, fetcher });
  const refreshed = await getProfile('partial-refresh-test', { now: now + 300001, fetcher });
  assert.equal(first.partial, true);
  assert.equal(refreshed.partial, true);
  assert.equal(refreshed.stale, undefined);
  assert.deepEqual(calls, [
    'https://profiles.wordpress.org/partial-refresh-test/',
    'https://profiles.wordpress.org/wp-json/wporg/v1/users/partial-refresh-test',
    'https://profiles.wordpress.org/partial-refresh-test/',
    'https://profiles.wordpress.org/wp-json/wporg/v1/users/partial-refresh-test',
  ]);
});

test('a concurrent profile success does not erase a newer isolate cooldown', async () => {
  const now = 40_000_000;
  let releaseSuccess;
  const delayed = new Promise(resolve => { releaseSuccess = resolve; });
  const success = getProfile('concurrent-success-test', { now, fetcher: async url => {
    assert.equal(url, 'https://profiles.wordpress.org/concurrent-success-test/');
    return delayed;
  } });
  await Promise.resolve();
  const throttled = await getProfile('concurrent-throttle-test', { now: now + 1, fetcher: async url => {
    if (url === 'https://profiles.wordpress.org/concurrent-throttle-test/') return new Response('limited', { status: 429, headers: { 'Retry-After': '120' } });
    assert.equal(url, 'https://profiles.wordpress.org/wp-json/wporg/v1/users/concurrent-throttle-test');
    return apiResponse('concurrent-throttle-test');
  } });
  assert.equal(throttled.partial, true);
  releaseSuccess(htmlResponse('concurrent-success-test'));
  assert.equal((await success).name, 'Ada & Example');

  const calls = [];
  const proof = await getProfile('concurrent-proof-test', { now: now + 1000, fetcher: async url => {
    calls.push(url);
    assert.equal(url, 'https://profiles.wordpress.org/wp-json/wporg/v1/users/concurrent-proof-test');
    return apiResponse('concurrent-proof-test');
  } });
  assert.equal(proof.partial, true);
  assert.deepEqual(calls, ['https://profiles.wordpress.org/wp-json/wporg/v1/users/concurrent-proof-test']);
});

test('route preserves the longest upstream retry delay when neither full nor basic data is available', async () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response('limited', { status: 429, headers: { 'Retry-After': url.includes('/wp-json/') ? '30' : '120' } });
  try {
    const response = await jsonGET(new Request('https://site.test/json?username=route-rate-test'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '120');
    assert.equal((await response.json()).error.code, 'upstream_busy');
  } finally { globalThis.fetch = savedFetch; }
});
