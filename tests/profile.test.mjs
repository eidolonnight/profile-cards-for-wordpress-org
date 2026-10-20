import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { queryOptions, parseProfile, safeAvatar, boundedFetch, getProfile, getAvatarData } from '../functions/_profile.js';
import { renderCard } from '../functions/_svg.js';
import { GET as jsonGET } from '../functions/json.js';
import { GET as cardGET } from '../functions/card.js';

// Deliberately synthetic test fixture, never served as example profile data.
const fixture = (username = 'fixture') => `<html><head><meta property="profile:username" content="${username}"></head><body><header class="site-header"><h2>Ada &amp; Example</h2><img class="avatar" src="https://secure.gravatar.com/avatar/${'a'.repeat(64)}?s=224"><span class="wp-p2-joined">joined Jan 2001</span></header><li id="user-member-since"><strong>January 2nd, 2001</strong></li><section class="wp-p2-badges-block"><span class="medal badge-code"><span class="mi dashicons dashicons-editor-code"></span><span class="mn">Core Contributor</span></span><span class="medal badge-marketing"><span class="mn">Marketing Team</span></span></section></body></html>`;
const options = (q = '') => queryOptions(new Request(`http://localhost/card?username=fixture${q}`));
const htmlResponse = (username) => new Response(fixture(username), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

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
    await assert.rejects(() => boundedFetch('https://profiles.wordpress.org/example/', { fetcher: async (_url, init) => { assert.equal(init.redirect, 'manual'); return new Response('error', { status }); } }), { code });
  }
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
