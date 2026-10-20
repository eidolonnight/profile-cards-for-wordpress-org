import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom/worker';
import { queryOptions, parseProfile, getProfile, getAvatarData, DEFAULT_COLORS } from '../functions/_profile.js';
import { GET as cardGET } from '../functions/card.js';
import { FONT_CSS, FONT_STYLE_HASH } from '../functions/_fonts.js';

const controls = ['name', 'jobTitle', 'organization', 'handle', 'location', 'joined', 'userId', 'website', 'github', 'slack', 'social', 'teams'];
const options = (params = {}) => queryOptions(new Request(`https://cards.test/card?${new URLSearchParams({ username: 'fixture', ...params })}`));
const hash = 'a'.repeat(32);
const script = (value = hash) => `<script id="wporg-profiles-js-extra">var userProfileData = ${JSON.stringify({ gravatarHash: value })};\n//# sourceURL=wporg-profiles-js-extra\n</script>`;
const ld = (person = {}) => `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'Person', '@id': 'https://profiles.wordpress.org/fixture/#person', url: 'https://profiles.wordpress.org/fixture/', jobTitle: 'Director of Testing', worksFor: { name: 'Example & Co' }, ...person }] })}</script>`;
// Synthetic security/behavior fixture, not example account data.
const fixture = (extra = '', inner = '') => `<html><head>${ld()}</head><body>
<header class="site-header"><h2>Ada &amp; Example</h2>
<img class="avatar" src="https://secure.gravatar.com/avatar/${'b'.repeat(64)}">
<p class="wp-p2-jobline">Director of Testing at Example &amp; Co</p>
<p><span class="wp-p2-loc">Example City</span><span class="wp-p2-joined">joined Aug 2007</span></p>
<div class="wp-p2-links"><a href="https://profiles.wordpress.org/website-redirect/fixture">example.com <svg><path/></svg></a><a href="https://github.com/fixture">github.com/fixture</a><a href="https://make.wordpress.org/chat/">Slack: @Fixture</a></div>
<div class="wp-p2-chip-row"><span class="wp-p2-chip-label">Teams</span><span class="wp-p2-chip">Marketing</span><span class="wp-p2-chip">Meta</span><span class="wp-p2-chip">Marketing</span></div>
<div class="wp-p2-chip-row"><span class="wp-p2-chip-label">Interests</span><span class="wp-p2-chip">Not a team</span></div>${inner}</header>
<li id="user-member-since"><strong>August 18th, 2007</strong></li>
<nav data-tl-pager data-user="227158"></nav>${extra}</body></html>`;
const htmlResponse = (html) => new Response(html, { headers: { 'Content-Type': 'text/html' } });
const jsonResponse = (accounts = []) => Response.json({ entry: [{ accounts }] });
const account = (shortname, overrides = {}) => ({ shortname, verified: true, url: `https://example.test/${shortname}`, display: `Label ${shortname}`, ...overrides });

test('classic query defaults remain compatible and profile has independent defaults', () => {
  const classic = options(); const profile = options({ layout: 'profile' });
  assert.equal(classic.layout, 'classic'); assert.equal(classic.badges, true);
  assert.equal(profile.badges, true); assert.equal(profile.avatar, true); assert.equal(profile.header, true);
  assert.equal(profile.link, true); assert.equal(profile.badgeNames, true); assert.equal(profile.refresh, false);
  for (const key of controls) { assert.equal(classic[key], true); assert.equal(profile[key], true); }
  assert.deepEqual(profile.omitTeams, []); assert.deepEqual(profile.omitSocial, []);
  assert.deepEqual(DEFAULT_COLORS, { headerColor: '191E23', nameColor: '191E23', subHeaderColor: '50575E', badgeLabelColor: '23282D', foreground: 'FFFFFF', linkColor: '3858E9' });
  assert.equal(options({ linkColor: '96baff' }).linkColor, '96BAFF');
  assert.equal(options({ layout: 'profile', badges: 'true' }).badges, true);
  const hidden = options({ header: 'false', badges: 'true', link: 'true', ...Object.fromEntries(controls.map(key => [key, 'false'])) });
  for (const key of controls) assert.equal(hidden[key], false);
  assert.equal(hidden.badges, true); assert.equal(hidden.link, true);
});

test('new booleans, layout and colors are strict, repeated and unknown queries stay rejected', () => {
  for (const key of controls) assert.throws(() => options({ [key]: 'yes' }), { code: 'invalid_option' });
  for (const layout of ['', 'PROFILE', 'other', '../profile']) assert.throws(() => options({ layout }), { code: 'invalid_option' });
  for (const linkColor of ['', '#3858E9', '3858E9;', 'blue']) assert.throws(() => options({ linkColor }), { code: 'invalid_color' });
  for (const suffix of ['layout=profile&layout=classic', 'name=true&name=false', 'omitSocial=x&omitSocial=y', 'unknown=true']) {
    assert.throws(() => queryOptions(new Request(`https://cards.test/card?username=fixture&${suffix}`)), { code: 'invalid_parameter' });
  }
});

test('omission lists trim and deduplicate, enforce count/length/control/key limits', () => {
  const q = options({ omitTeams: ' Meta ,Marketing,Meta', omitSocial: ' twitter ,github,twitter' });
  assert.deepEqual(q.omitTeams, ['Meta', 'Marketing']); assert.deepEqual(q.omitSocial, ['twitter', 'github']);
  for (const key of ['omitTeams', 'omitSocial']) {
    for (const value of ['', ' ', ',Meta', 'Meta,', 'Meta,,Other', 'foo\nbar', 'foo\tbar', 'foo\0bar', 'foo\u007fbar', 'foo\u0085bar', Array(41).fill('a').join(','), 'a'.repeat(2001)]) {
      assert.throws(() => options({ [key]: value }), { code: 'invalid_option' }, `${key}: ${JSON.stringify(value)}`);
    }
  }
  assert.throws(() => options({ omitTeams: 'a'.repeat(81) }), { code: 'invalid_option' });
  assert.equal(options({ omitTeams: 'a'.repeat(80) }).omitTeams[0].length, 80);
  assert.equal(options({ omitTeams: Array.from({ length: 40 }, (_, i) => `Team ${i}`).join(',') }).omitTeams.length, 40);
  for (const value of ['Twitter', 'a/b', 'a_b', 'a b', 'https://example.test', '<script>', 'a'.repeat(41)]) assert.throws(() => options({ omitSocial: value }), { code: 'invalid_option' });
  assert.deepEqual(options({ omitTeams: '<script>,https://127.0.0.1/' }).omitTeams, ['<script>', 'https://127.0.0.1/']); // comparison-only text
});

test('parses independent header fields without changing existing profile fields', () => {
  const p = parseProfile(fixture(), 'fixture', 0);
  assert.equal(p.jobTitle, 'Director of Testing'); assert.equal(p.organization, 'Example & Co');
  assert.equal(p.jobLine, 'Director of Testing at Example & Co'); assert.equal(p.location, 'Example City');
  assert.equal(p.joined, 'Aug 2007'); assert.equal(p.memberSince, 'August 18th, 2007'); assert.equal(p.userId, '227158');
  assert.deepEqual(p.website, { label: 'example.com', url: 'https://profiles.wordpress.org/website-redirect/fixture' });
  assert.deepEqual(p.github, { label: 'github.com/fixture', url: 'https://github.com/fixture' });
  assert.equal(p.slack, '@Fixture'); assert.deepEqual(p.teams, ['Marketing', 'Meta']);
  assert.deepEqual(p.social, []); assert.equal(p.socialUnavailable, false);
  assert.equal(p.name, 'Ada & Example'); assert.equal(p.userName, 'fixture'); assert.equal(p.profileUrl, 'https://profiles.wordpress.org/fixture/');
  assert.equal(p.fetchedAt, '1970-01-01T00:00:00.000Z'); assert.deepEqual(p.badges, []);
  assert.equal(Object.hasOwn(p, 'gravatarHash'), false); assert.equal(Object.getOwnPropertySymbols(p).length, 0);
});

test('minimal legacy profiles have explicit empty optional fields', () => {
  const p = parseProfile('<header class="site-header"><h2>Example</h2></header>', 'example');
  for (const key of ['jobTitle', 'organization', 'jobLine', 'location', 'joined', 'slack']) assert.equal(p[key], '');
  for (const key of ['userId', 'website', 'github']) assert.equal(p[key], null);
  assert.deepEqual(p.social, []); assert.deepEqual(p.teams, []); assert.equal(p.socialUnavailable, false);
});

test('JSON-LD matches the exact Person identity, never a different graph person', () => {
  for (const person of [{ '@id': 'https://profiles.wordpress.org/another/#person' }, { '@type': 'Organization' }, { url: 'https://evil.test/fixture/' }]) {
    const html = fixture().replace(ld(), ld({ jobTitle: 'Wrong', worksFor: { name: 'Wrong' }, ...person }));
    const p = parseProfile(html, 'fixture'); assert.equal(p.jobTitle, 'Director of Testing'); assert.equal(p.organization, 'Example & Co');
  }
  const structured = parseProfile(fixture().replace(ld(), ld({ '@type': ['Person'], jobTitle: 'Actual at Title', worksFor: { name: 'Actual at Organization' } })), 'fixture');
  assert.equal(structured.jobTitle, 'Actual at Title'); assert.equal(structured.organization, 'Actual at Organization');
});

test('malformed and executable JSON-LD is inert and falls back to the jobline', () => {
  globalThis.__profileExecuted = false;
  try {
    for (const payload of ['{broken', 'globalThis.__profileExecuted = true', '{"@graph":{}}', '{"@graph":[null,5,"x"]}', '{"@graph":[]}']) {
      const p = parseProfile(fixture().replace(ld(), `<script type="application/ld+json">${payload}</script>`), 'fixture');
      assert.equal(p.jobTitle, 'Director of Testing'); assert.equal(p.organization, 'Example & Co');
      assert.equal(globalThis.__profileExecuted, false);
    }
    for (const person of [{ jobTitle: null }, { worksFor: null }, { jobTitle: {}, worksFor: [] }]) {
      const p = parseProfile(fixture().replace(ld(), ld(person)), 'fixture');
      assert.equal(p.jobTitle, 'Director of Testing'); assert.equal(p.organization, 'Example & Co');
    }
  } finally { delete globalThis.__profileExecuted; }
});

test('display links reject JavaScript/data/credentials/relative/control URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', '//evil.test/x', '/relative', 'https://user:password@example.test/', 'https://example.test/&#10;x']) {
    const p = parseProfile(`<header class="site-header"><h2>Example</h2><div class="wp-p2-links"><a href="${url}">Unsafe</a></div><ul id="user-social-media-accounts"><li><a href="${url}" data-verified="true" aria-label="twitter">Unsafe</a></li></ul></header>`, 'example');
    assert.equal(p.website, null); assert.deepEqual(p.social, []);
  }
  const p = parseProfile(fixture().replace('https://github.com/fixture', 'javascript:alert(1)').replace('https://make.wordpress.org/chat/', 'data:text/html,slack'), 'fixture');
  assert.equal(p.github, null); assert.equal(p.slack, '');
});

test('public JSON social links require explicit verification and provider filtering', () => {
  const inner = `<ul id="user-social-media-accounts"><li><a data-shortname="twitter" data-verified="true" aria-label="Twitter" href="https://twitter.com/fixture">X</a></li><li><a aria-label="facebook" href="https://facebook.com/fixture">Unverified</a></li><li><a data-verified="true" aria-label="wordpress" href="https://wordpress.com/">Excluded</a></li></ul>`;
  assert.deepEqual(parseProfile(fixture('', inner), 'fixture').social, [{ key: 'twitter', label: 'Twitter', url: 'https://twitter.com/fixture' }]);
});

test('only numeric user IDs are exposed', () => {
  for (const id of ['0', '-1', '1.5', '1e3', '227158&#10;', 'x', '1'.repeat(21)]) {
    assert.equal(parseProfile(fixture().replace('data-user="227158"', `data-user="${id}"`), 'fixture').userId, null);
  }
});

test('no Gravatar request occurs without a hash, even when an avatar exists', async () => {
  const urls = [];
  const p = await getProfile('no-social-hash', { fetcher: async url => { urls.push(url); return htmlResponse(fixture()); } });
  assert.deepEqual(urls, ['https://profiles.wordpress.org/no-social-hash/']); assert.equal(p.socialUnavailable, false);
});

test('strict hash JSON accepts 32/64 lowercase hex at a fixed origin, never avatar or website URLs', async () => {
  for (const length of [32, 64]) {
    const value = 'c'.repeat(length); const urls = [];
    const p = await getProfile(`social-hash-${length}`, { fetcher: async (url, init) => {
      urls.push(url); assert.equal(init.redirect, 'manual'); assert.ok(init.signal instanceof AbortSignal);
      if (urls.length === 1) return htmlResponse(fixture(script(value)));
      assert.equal(init.headers.Accept, 'application/json'); return jsonResponse([account('twitter')]);
    } });
    assert.deepEqual(urls, [`https://profiles.wordpress.org/social-hash-${length}/`, `https://en.gravatar.com/${value}.json`]);
    assert.equal(p.socialUnavailable, false); assert.equal(p.social[0].key, 'twitter');
    assert.equal(Object.hasOwn(p, 'gravatarHash'), false); assert.equal(JSON.stringify(p).includes(value), false);
  }
});

test('invalid hash lengths/case/URLs and executable script cannot trigger social requests', async () => {
  globalThis.__profileExecuted = false;
  const payloads = [
    ...['a'.repeat(31), 'a'.repeat(33), 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(32), hash + '\n', '../evil', 'https://127.0.0.1/', null, {}].map(value => script(value)),
    `<script id="wporg-profiles-js-extra">var userProfileData = {gravatarHash:"${hash}"};</script>`,
    `<script id="wporg-profiles-js-extra">var userProfileData = {"gravatarHash":(globalThis.__profileExecuted=true)};</script>`,
    `<script id="wporg-profiles-js-extra">globalThis.__profileExecuted=true;var userProfileData={"gravatarHash":"${hash}"};</script>`,
    `<script id="wporg-profiles-js-extra">var userProfileData={"gravatarHash":"${hash}"};globalThis.__profileExecuted=true;</script>`
  ];
  try {
    for (const [i, payload] of payloads.entries()) {
      const urls = []; const p = await getProfile(`invalid-social-${i}`, { fetcher: async url => { urls.push(url); return htmlResponse(fixture(payload)); } });
      assert.equal(urls.length, 1); assert.equal(p.socialUnavailable, true); assert.equal(p.name, 'Ada & Example');
    }
    assert.equal(globalThis.__profileExecuted, false);
  } finally { delete globalThis.__profileExecuted; }
});

test('Gravatar accounts require verified=true, safe URLs and supported keys; duplicates collapse', async () => {
  const accounts = [account('twitter'), account('twitter'), account('github', { verified: 'true' }), account('facebook', { verified: false }), account('bad-js', { url: 'javascript:alert(1)' }), account('bad-data', { url: 'data:text/html,hi' }), account('bad-auth', { url: 'https://u:p@example.test/' }), account('bad\n'), account('UpperCase'), account('linkedin', { display: null }), ...['wordpress', 'blogger', 'yahoo', 'foursquare', 'tripit', 'goodreads'].map(key => account(key)), null, {}];
  const p = await getProfile('filtered-social', { fetcher: async url => url.startsWith('https://profiles.wordpress.org/') ? htmlResponse(fixture(script())) : jsonResponse(accounts) });
  assert.deepEqual(p.social, [{ key: 'twitter', label: 'Label twitter', url: 'https://example.test/twitter' }, { key: 'linkedin', label: 'linkedin', url: 'https://example.test/linkedin' }]);
});

test('social network/JSON/status/type/size failures preserve the profile and flag degradation', async () => {
  const failures = [
    () => { throw new Error('offline'); },
    () => new Response('', { status: 302, headers: { Location: 'https://127.0.0.1/private' } }),
    () => new Response('', { status: 404 }),
    () => new Response('', { status: 429 }),
    () => new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }),
    () => Response.json({ entry: [] }),
    () => Response.json({ entry: [{ accounts: {} }] }),
    () => new Response('x', { headers: { 'Content-Type': 'application/json', 'Content-Length': String(256 * 1024 + 1) } }),
    () => new Response('x'.repeat(256 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } })
  ];
  for (const [i, failure] of failures.entries()) {
    let calls = 0;
    const p = await getProfile(`social-failure-${i}`, { fetcher: async url => { calls++; return url.startsWith('https://profiles.wordpress.org/') ? htmlResponse(fixture(script())) : failure(); } });
    assert.equal(calls, 2); assert.equal(p.socialUnavailable, true); assert.deepEqual(p.social, []); assert.equal(p.name, 'Ada & Example');
  }
});

test('social timeout aborts within its bound and preserves the profile', async () => {
  let aborted = false; const start = Date.now();
  const p = await getProfile('social-timeout', { fetcher: async (url, { signal }) => {
    if (url.startsWith('https://profiles.wordpress.org/')) return htmlResponse(fixture(script()));
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true }));
  } });
  assert.equal(aborted, true); assert.equal(p.socialUnavailable, true); assert.ok(Date.now() - start < 6500);
});

test('social enrichment shares profile coalescing, TTL and refresh throttling', async () => {
  let calls = 0; const now = Date.now();
  const fetcher = async url => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return url.startsWith('https://profiles.wordpress.org/') ? htmlResponse(fixture(script())) : jsonResponse([account('twitter')]); };
  const [a, b] = await Promise.all([getProfile('social-cache', { fetcher, now }), getProfile('social-cache', { fetcher, now })]);
  assert.equal(a, b); assert.equal(calls, 2);
  assert.equal(await getProfile('social-cache', { fetcher, now: now + 1, refresh: true }), a); assert.equal(calls, 2);
  await getProfile('social-cache', { fetcher, now: now + 61000, refresh: true }); assert.equal(calls, 4);
  await getProfile('social-cache', { fetcher, now: now + 61001 }); assert.equal(calls, 4);
});

test('social failures are cached rather than retried on every card request', async () => {
  let calls = 0; const now = Date.now();
  const fetcher = async url => { calls++; if (url.startsWith('https://profiles.wordpress.org/')) return htmlResponse(fixture(script())); throw new Error('offline'); };
  const p = await getProfile('social-failure-cache', { fetcher, now });
  assert.equal(p.socialUnavailable, true); assert.equal(await getProfile('social-failure-cache', { fetcher, now: now + 1 }), p); assert.equal(calls, 2);
});

test('avatar handling never requests social account or website URLs', async () => {
  let calls = 0; const fetcher = async () => { calls++; throw new Error('must not fetch'); };
  for (const url of ['https://www.gravatar.com/' + hash + '.json', 'https://profiles.wordpress.org/website-redirect/fixture', 'https://github.com/fixture', 'https://127.0.0.1/']) assert.equal(await getAvatarData(url, fetcher), null);
  assert.equal(calls, 0);
});

test('card route keeps avatar fetch gated by both avatar and header', async () => {
  const saved = globalThis.fetch;
  try {
    for (const [i, flags] of [{ header: 'false', avatar: 'true' }, { header: 'true', avatar: 'false' }].entries()) {
      const calls = []; const username = `route-header-${i}`;
      globalThis.fetch = async url => { calls.push(url); return htmlResponse(fixture()); };
      const response = await cardGET(new Request(`https://cards.test/card?${new URLSearchParams({ username, layout: 'profile', ...flags })}`));
      assert.equal(response.status, 200); assert.equal(response.headers.get('X-Profile-Avatar'), 'hidden');
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.deepEqual(calls, [`https://profiles.wordpress.org/${username}/`]);
    }
  } finally { globalThis.fetch = saved; }
});

test('profile CSP authorizes only the exact embedded font stylesheet; classic is unchanged', async () => {
  assert.equal(FONT_STYLE_HASH, `sha256-${createHash('sha256').update(FONT_CSS).digest('base64')}`);
  const saved = globalThis.fetch;
  globalThis.fetch = async () => htmlResponse(fixture());
  try {
    for (const layout of ['classic', 'profile']) {
      const response = await cardGET(new Request(`https://cards.test/card?username=route-csp-${layout}&layout=${layout}&avatar=false`));
      assert.equal(response.status, 200);
      const expected = layout === 'profile'
        ? `default-src 'none'; img-src data:; font-src data:; style-src '${FONT_STYLE_HASH}'; base-uri 'none'; frame-ancestors 'none'`
        : "default-src 'none'; img-src data:; style-src 'none'; base-uri 'none'; frame-ancestors 'none'";
      assert.equal(response.headers.get('Content-Security-Policy'), expected);
      assert.ok(!expected.includes('unsafe-inline')); assert.ok(!expected.includes('https:'));
      const doc = parseHTML(await response.text()).document;
      if (layout === 'profile') assert.equal(doc.querySelector('style')?.textContent, FONT_CSS);
      else assert.equal(doc.querySelector('style'), null);
    }
  } finally { globalThis.fetch = saved; }
});

// Optional real-source acceptance check, without making the unit suite depend on
// a personal scratch path or a live network. Set this to the captured public HTML.
if (process.env.WP_PROFILE_HTML_FIXTURE) test('captured public eidolonnight HTML has the verified live header fields', () => {
  const p = parseProfile(readFileSync(process.env.WP_PROFILE_HTML_FIXTURE, 'utf8'), 'eidolonnight');
  assert.equal(p.name, 'Nicholas Garofalo'); assert.equal(p.jobTitle, 'Director of Marketing'); assert.equal(p.organization, 'Automattic');
  assert.equal(p.jobLine, 'Director of Marketing at Automattic'); assert.equal(p.location, 'Batavia, NY'); assert.equal(p.joined, 'Aug 2007'); assert.equal(p.userId, '227158');
  assert.deepEqual(p.website, { label: 'nicholasgarofalo.com', url: 'https://profiles.wordpress.org/website-redirect/eidolonnight' });
  assert.deepEqual(p.github, { label: 'github.com/eidolonnight', url: 'https://github.com/eidolonnight' });
  assert.equal(p.slack, '@EidolonNight'); assert.deepEqual(p.teams, ['Community', 'Marketing', 'Meta', 'Photos', 'Support', 'TV']);
  assert.equal(p.socialUnavailable, false); assert.equal(p.memberSince, 'August 18th, 2007'); assert.ok(p.badges.length > 0);
});
