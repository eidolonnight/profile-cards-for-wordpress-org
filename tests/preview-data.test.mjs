import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../functions/preview-data.js';
import { GET as jsonGET } from '../functions/json.js';
import { apiHeaders, getProfile, profileMaxAgeMs } from '../functions/_profile.js';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const request = query => new Request(`https://cards.test/preview-data?${query}`);
const html = (hash, extra = '') => `<header class="site-header"><h2>Synthetic Example</h2>${hash ? `<img class="avatar" src="https://secure.gravatar.com/avatar/${hash}">` : ''}${extra}</header>`;
const htmlResponse = text => new Response(text, { headers: { 'Content-Type': 'text/html' } });
const imageResponse = (body = png, type = 'image/png', headers = {}) => new Response(body, { headers: { 'Content-Type': type, ...headers } });
const headers = response => {
  for (const [name, value] of Object.entries(apiHeaders)) assert.equal(response.headers.get(name), value);
  assert.match(response.headers.get('Content-Type'), /^application\/json/);
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
};

test('preview-data strictly rejects unknown/repeated keys, malformed usernames and missing/noncanonical sizes before fetching', async () => {
  const saved = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); };
  try {
    const cases = [
      ['username=example', 'invalid_option'], ['username=example&size=', 'invalid_option'],
      ...['-1', '1', '0320', '320.0', '320%20', '1e3', '2048', 'null', '0x140'].map(size => [`username=example&size=${size}`, 'invalid_option']),
      ['size=0', 'invalid_username'],
      ...['', 'Upper', '..%2Fevil', 'https%3A%2F%2Fevil.test', '%20example', 'example%0A', 'a'.repeat(61)].map(username => [`username=${username}&size=0`, 'invalid_username']),
      ...['username=other', 'size=0', 'layout=classic', 'refresh=true', 'avatar=https%3A%2F%2Fevil.test', 'url=https%3A%2F%2Fevil.test', 'profile=x', '__proto__=x'].map(extra => [`username=example&size=0&${extra}`, 'invalid_parameter'])
    ];
    for (const [query, code] of cases) {
      const response = await GET(request(query));
      assert.equal(response.status, 400, query); headers(response);
      assert.equal((await response.json()).error.code, code, query);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = saved; }
});

test('size=0 is lazy, keeps /json profile shape, and shares profile cache across both photo sizes', async () => {
  const saved = globalThis.fetch; const calls = []; const username = 'preview-lazy'; const hash = '9'.repeat(32);
  globalThis.fetch = async (url, init) => {
    calls.push(url); assert.equal(init.redirect, 'manual'); assert.ok(init.signal instanceof AbortSignal);
    if (url.startsWith('https://profiles.wordpress.org/')) { assert.equal(init.headers.Accept, 'text/html'); return htmlResponse(html(hash)); }
    assert.equal(init.headers.Accept, 'image/png,image/jpeg,image/webp'); return imageResponse();
  };
  try {
    const hidden = await GET(request(`username=${username}&size=0`)); headers(hidden);
    const first = await hidden.json();
    assert.deepEqual(Object.keys(first).sort(), ['avatar', 'maxAgeMs', 'profile']);
    assert.deepEqual(first.avatar, { size: 0, data: null, status: 'hidden' });
    assert.equal(first.profile.userName, username);
    assert.ok(Number.isInteger(first.maxAgeMs) && first.maxAgeMs > 890000 && first.maxAgeMs <= 900000);
    assert.deepEqual(calls, [`https://profiles.wordpress.org/${username}/`]);
    assert.deepEqual(await (await jsonGET(new Request(`https://cards.test/json?username=${username}`))).json(), first.profile);
    for (const size of [320, 1024, 320, 1024, 0]) {
      const response = await GET(request(`username=${username}&size=${size}`)); headers(response); assert.equal(response.status, 200);
      const body = await response.json(); assert.deepEqual(body.profile, first.profile);
      assert.deepEqual(body.avatar, { size, data: size ? `data:image/png;base64,${Buffer.from(png).toString('base64')}` : null, status: size ? 'embedded' : 'hidden' });
      assert.ok(body.maxAgeMs <= first.maxAgeMs && body.maxAgeMs >= 0);
    }
    assert.deepEqual(calls, [`https://profiles.wordpress.org/${username}/`, `https://secure.gravatar.com/avatar/${hash}?s=320&d=mp&r=g`, `https://secure.gravatar.com/avatar/${hash}?s=1024&d=404&r=g`]);
  } finally { globalThis.fetch = saved; }
});

test('preview-data embeds only validated PNG, JPEG or WebP data at each allowed size', async () => {
  const saved = globalThis.fetch;
  try {
    const formats = [['image/png', png], ['image/jpeg', new Uint8Array([255, 216, 255, 224])], ['image/webp', new TextEncoder().encode('RIFF0000WEBP')]];
    for (const [index, [type, bytes]] of formats.entries()) for (const size of [320, 1024]) {
      const hash = (50 + index).toString(16).padStart(32, '0');
      globalThis.fetch = async url => url.startsWith('https://profiles.wordpress.org/') ? htmlResponse(html(hash)) : imageResponse(bytes, type);
      const response = await GET(request(`username=preview-format-${index}-${size}&size=${size}`)); assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).avatar, { size, data: `data:${type};base64,${Buffer.from(bytes).toString('base64')}`, status: 'embedded' });
    }
  } finally { globalThis.fetch = saved; }
});

test('missing or untrusted page avatar URLs produce initials without photo fetch', async () => {
  const saved = globalThis.fetch;
  try {
    for (const [index, avatar] of ['', 'https://evil.test/avatar/' + 'a'.repeat(32), 'http://127.0.0.1/private', 'data:image/png;base64,AAAA'].entries()) {
      const calls = [];
      globalThis.fetch = async url => { calls.push(url); return htmlResponse(html(null, avatar ? `<img class="avatar" src="${avatar}">` : '')); };
      const response = await GET(request(`username=preview-unsafe-${index}&size=1024`));
      assert.deepEqual((await response.json()).avatar, { size: 1024, data: null, status: 'initials' });
      assert.deepEqual(calls, [`https://profiles.wordpress.org/preview-unsafe-${index}/`]);
    }
  } finally { globalThis.fetch = saved; }
});

test('photo redirects, errors, bad signatures and declared/streamed oversize data fall back within existing budgets', async () => {
  const saved = globalThis.fetch;
  try {
    for (const size of [320, 1024]) {
      const limit = size === 320 ? 256 * 1024 : 2 * 1024 * 1024;
      const cases = [
        () => new Response('', { status: 404 }),
        () => new Response('', { status: 302, headers: { Location: 'https://evil.test/' } }),
        () => imageResponse('<svg/>', 'image/svg+xml'),
        () => imageResponse('not a png'),
        () => imageResponse(png, 'image/jpeg'),
        () => imageResponse(png, 'image/png', { 'Content-Length': String(limit + 1) }),
        () => imageResponse(new Uint8Array(limit + 1)),
        () => { throw new Error('network failed'); }
      ];
      for (const [index, response] of cases.entries()) {
        const calls = []; const hash = (100 + index).toString(16).padStart(32, '0');
        globalThis.fetch = async (url, init) => { calls.push(url); assert.equal(init.redirect, 'manual'); return url.startsWith('https://profiles.wordpress.org/') ? htmlResponse(html(hash)) : response(); };
        const result = await GET(request(`username=preview-bad-photo-${size}-${index}&size=${size}`)); headers(result); assert.equal(result.status, 200);
        assert.deepEqual((await result.json()).avatar, { size, data: null, status: 'initials' });
        assert.equal(calls.length, 2);
        assert.ok(calls[1].startsWith('https://secure.gravatar.com/avatar/'));
      }
    }
  } finally { globalThis.fetch = saved; }
});

test('profile upstream failures remain bounded with useful private errors', async () => {
  const saved = globalThis.fetch;
  const cases = [
    [() => new Response('', { status: 404 }), 404, 'profile_not_found'],
    [() => new Response('', { status: 429 }), 503, 'upstream_busy'],
    [() => new Response('', { status: 302, headers: { Location: 'https://evil.test' } }), 502, 'upstream_unavailable'],
    [() => new Response('', { status: 500 }), 502, 'upstream_unavailable'],
    [() => new Response('bad', { headers: { 'Content-Type': 'text/plain' } }), 502, 'profile_unreadable'],
    [() => htmlResponse('<h1>Maintenance</h1>'), 502, 'profile_unreadable'],
    [() => new Response('x', { headers: { 'Content-Length': '1048577', 'Content-Type': 'text/html' } }), 502, 'upstream_too_large'],
    [() => htmlResponse('x'.repeat(1048577)), 502, 'upstream_too_large'],
    [() => { throw new Error('network failed'); }, 502, 'upstream_unavailable']
  ];
  try {
    for (const [index, [response, status, code]] of cases.entries()) {
      let calls = 0; globalThis.fetch = async () => { calls++; return response(); };
      const result = await GET(request(`username=preview-upstream-${index}&size=0`));
      assert.equal(result.status, status); headers(result); assert.equal((await result.json()).error.code, code); assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = saved; }
});

test('freshness is remaining server-relative TTL, accounts for photo latency, clamps and revalidates expiry', async () => {
  const savedFetch = globalThis.fetch; const savedNow = Date.now; let now = 1800000000000; let profileCalls = 0;
  Date.now = () => now;
  globalThis.fetch = async url => {
    if (url.startsWith('https://profiles.wordpress.org/')) { profileCalls++; return htmlResponse(html('b'.repeat(32))); }
    now += 2500; return imageResponse();
  };
  try {
    const first = await (await GET(request('username=preview-expiry&size=0'))).json(); assert.equal(first.maxAgeMs, 900000);
    now += 600000;
    const second = await (await GET(request('username=preview-expiry&size=320'))).json(); assert.equal(second.maxAgeMs, 297500); assert.equal(profileCalls, 1);
    now += 297500;
    const third = await (await GET(request('username=preview-expiry&size=0'))).json(); assert.equal(third.maxAgeMs, 900000); assert.equal(profileCalls, 2);
    assert.notEqual(third.profile.fetchedAt, first.profile.fetchedAt);
    const p = { fetchedAt: new Date(now).toISOString() };
    assert.equal(profileMaxAgeMs(p, now - 1), 900000);
    assert.equal(profileMaxAgeMs(p, now + 900001), 0);
    assert.equal(profileMaxAgeMs(p, now + 0.5), 899999);
    assert.equal(profileMaxAgeMs({ fetchedAt: 'invalid' }, now), 0);
  } finally { globalThis.fetch = savedFetch; Date.now = savedNow; }
});

test('preview-data shares the eight-profile pending limit and coalesces identical lookups', async () => {
  const saved = globalThis.fetch; const releases = []; let calls = 0;
  globalThis.fetch = () => { calls++; return new Promise(resolve => releases.push(() => resolve(htmlResponse(html(null))))); };
  const pending = [];
  try {
    for (let i = 0; i < 8; i++) pending.push(GET(request(`username=preview-pending-${i}&size=0`)));
    pending.push(GET(request('username=preview-pending-0&size=0')));
    const busy = await GET(request('username=preview-pending-extra&size=0'));
    assert.equal(busy.status, 503); assert.equal((await busy.json()).error.code, 'busy'); assert.equal(calls, 8);
  } finally {
    releases.forEach(release => release());
    const results = await Promise.all(pending); globalThis.fetch = saved;
    for (const response of results) assert.equal(response.status, 200);
  }
});

test('preview-data reuses the eight-photo pending limit and fails excess photos to initials', async () => {
  const saved = globalThis.fetch; const releases = []; const pending = [];
  try {
    for (let i = 0; i < 9; i++) await getProfile(`preview-photo-pending-${i}`, { fetcher: async () => htmlResponse(html((200 + i).toString(16).padStart(32, '0'))) });
    globalThis.fetch = () => new Promise(resolve => releases.push(() => resolve(imageResponse())));
    for (let i = 0; i < 8; i++) pending.push(GET(request(`username=preview-photo-pending-${i}&size=320`)));
    const excess = await GET(request('username=preview-photo-pending-8&size=320'));
    assert.equal(excess.status, 200); assert.equal((await excess.json()).avatar.status, 'initials'); assert.equal(releases.length, 8);
  } finally {
    releases.forEach(release => release());
    const results = await Promise.all(pending); globalThis.fetch = saved;
    for (const response of results) assert.equal((await response.json()).avatar.status, 'embedded');
  }
});
