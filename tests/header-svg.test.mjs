import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseHTML } from 'linkedom/worker';
import { renderCard, measureText } from '../functions/_svg.js';
import { FONT_CSS, FONT_STYLE_HASH } from '../functions/_fonts.js';

// Synthetic security/layout fixture only; never used as application example data.
const profile = () => ({ userName: 'fixture', name: 'Ada Example', avatar: null, memberSince: 'January 2nd, 2001', joined: 'Jan 2001', profileUrl: 'https://profiles.wordpress.org/fixture/', jobTitle: 'Release Engineer', organization: 'Example Org', jobLine: 'Release Engineer at Example Org', location: 'Example City', userId: '12345', website: { label: 'example.test', url: 'https://example.test/' }, github: { label: 'github.com/fixture', url: 'https://github.com/fixture' }, slack: '@fixture-slack', teams: ['Community', 'Marketing', 'Meta'], social: [{ key: 'twitter', label: 'X / Twitter', url: 'https://x.com/fixture' }, { key: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/fixture' }, { key: 'flickr', label: 'Flickr', url: 'https://flickr.com/people/fixture' }, { key: 'facebook', label: 'Facebook', url: 'https://facebook.com/fixture' }], badges: [{ name: 'Fixture Contributor', class: '' }] });
const card = (options = {}, p = profile()) => renderCard(p, { layout: 'profile', ...options });
const doc = (options = {}, p) => parseHTML(card(options, p)).document;
const field = (document, key) => document.querySelectorAll(`[data-field="${key}"]`);

test('profile header has expected typography, public fields, pills and embedded fonts', () => {
  const d = doc(); const svg = d.querySelector('svg');
  const textHeight = Number(d.querySelector('[data-profile-text]').getAttribute('data-text-height'));
  assert.equal(Number(svg.getAttribute('width')), Math.max(1708, 44 + textHeight + 64 + 1236 + 44, Number(svg.getAttribute('height')) + 1)); assert.equal(svg.getAttribute('data-layout'), 'profile');
  for (const key of ['avatar', 'name', 'jobLine', 'handle', 'location', 'joined', 'teams']) assert.ok(field(d, key).length, key);
  assert.equal(d.querySelectorAll('[data-team]').length, 3); assert.equal(d.querySelectorAll('[data-social]').length, 6);
  assert.equal(field(d, 'badges').length, 1); assert.equal(field(d, 'link').length, 1);
  assert.equal(d.querySelector('style').textContent, FONT_CSS);
  assert.equal(FONT_STYLE_HASH, 'sha256-' + createHash('sha256').update(FONT_CSS).digest('base64'));
  assert.match(d.querySelector('[data-field="name"] text').getAttribute('font-family'), /Card Garamond/);
  assert.ok(measureText('MMMM', 30) > measureText('iiii', 30));
});
test('every component can be independently omitted without removing unrelated fields', () => {
  for (const key of ['avatar', 'name', 'handle', 'location', 'joined', 'teams']) {
    const d = doc({ [key]: false }); assert.equal(field(d, key).length, 0, key);
    if (key !== 'name') assert.ok(field(d, 'name').length, key + ' must not hide name');
  }
  assert.ok(!card({ name: false }).includes('Ada Example'));
  assert.equal(doc({ jobTitle: false }).querySelector('[data-field="jobLine"]').textContent, 'Example Org');
  assert.equal(doc({ organization: false }).querySelector('[data-field="jobLine"]').textContent, 'Release Engineer');
  assert.equal(field(doc({ organization: false, jobTitle: false }), 'jobLine').length, 0);
});
test('specific teams can be omitted and missing data adds no filler', () => {
  const d = doc({ omitTeams: ['Marketing'], omitSocial: ['twitter', 'flickr'] });
  assert.deepEqual([...d.querySelectorAll('[data-team]')].map(n => n.getAttribute('data-team')), ['Community', 'Meta']);
  assert.deepEqual([...d.querySelectorAll('[data-social]')].map(n => n.getAttribute('data-social')), ['website', 'github', 'linkedin', 'facebook']);
  const p = { ...profile(), jobTitle: '', organization: '', jobLine: '', location: '', joined: '', memberSince: '', userId: null, website: null, github: null, slack: '', social: [], teams: [] };
  const missing = doc({}, p);
  for (const key of ['jobLine', 'location', 'joined', 'teams']) assert.equal(field(missing, key).length, 0, key);
  assert.ok(!card({}, p).includes('undefined'));
});
test('master visibility and all-hidden states do not expose omitted profile text', () => {
  const d = doc({ header: false });
  for (const key of ['avatar', 'name', 'jobLine', 'handle', 'location', 'joined', 'teams']) assert.equal(field(d, key).length, 0);
  for (const key of ['badges', 'link', 'social']) assert.ok(field(d, key).length, 'Independent default: ' + key);
  assert.ok(!card({ header: false }).includes('Ada Example'));
  const allHidden = Object.fromEntries(['avatar', 'name', 'jobTitle', 'organization', 'handle', 'location', 'joined', 'teams', 'badges', 'link', 'social'].map(k => [k, false]));
  const empty = doc(allHidden); assert.equal(empty.querySelectorAll('[data-field]').length, 0); assert.equal(empty.querySelector('svg').getAttribute('height'), '168');
  assert.ok(field(doc({ header: false, badges: true, link: true }), 'badges').length); assert.equal(field(doc({ header: false, badges: true, link: true }), 'link').length, 1);
});
test('light and dark colors reach actual card output without overriding custom colors', () => {
  for (const [foreground, nameColor, subHeaderColor, linkColor] of [['FFFFFF', '191E23', '50575E', '3858E9'], ['191E23', 'F6F7F7', 'C3C4C7', '96BAFF']]) {
    const d = doc({ foreground, nameColor, subHeaderColor, linkColor });
    assert.equal(d.querySelector('svg > rect').getAttribute('fill'), '#' + foreground);
    assert.equal(d.querySelector('[data-field="name"] text').getAttribute('fill'), '#' + nameColor);
    assert.equal(d.querySelector('[data-field="location"] text').getAttribute('fill'), '#' + subHeaderColor);
  }
});
test('new fields escape XML and reject executable links or non-raster avatars', () => {
  const p = profile(); p.name = 'Name <script>&\"\uFFFE'; p.jobTitle = '<img onerror=alert(1)>'; p.teams.push('<foreignObject>'); p.website.url = 'javascript:alert(1)'; p.github.url = 'data:text/html,hi'; p.social.push({ key: 'unsafe', label: '<script>', url: 'javascript:alert(1)' });
  const svg = renderCard(p, { layout: 'profile' }, 'data:image/svg+xml;base64,PHN2Zz4='); const d = parseHTML(svg).document;
  assert.equal(d.querySelectorAll('script,foreignObject,image,img').length, 0); assert.equal(field(d, 'website').length, 0); assert.equal(field(d, 'github').length, 0);
  assert.ok(!svg.includes('javascript:')); assert.ok(!svg.includes('data:text/html')); assert.ok(svg.includes('&lt;script&gt;&amp;&quot;'));
  const parsed = spawnSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E; E.fromstring(sys.stdin.read())'], { input: svg, encoding: 'utf8' }); assert.equal(parsed.status, 0, parsed.stderr);
});
test('long fields and large pill sets wrap rather than being truncated', () => {
  const p = profile(); p.name = 'Long Header Name '.repeat(12); p.location = 'WideLocation'.repeat(25); p.teams = Array.from({ length: 40 }, (_, i) => `Team ${i} ${'Words '.repeat(10).trim()}`);
  const d = doc({}, p); assert.equal(d.querySelectorAll('[data-team]').length, 40); assert.ok(Number(d.querySelector('svg').getAttribute('height')) > 1000); assert.ok(d.querySelector('[data-team="' + p.teams.at(-1) + '"]'));
  const visible = [...d.querySelectorAll('[data-field="name"] text')].map(n => n.textContent).join(' '); assert.equal(visible, p.name.trim());
});
test('legacy card URLs still select the original renderer', () => {
  const p = profile(); const a = renderCard(p, {}); const b = renderCard(p, { layout: 'classic' });
  assert.equal(a, b); assert.equal(parseHTML(a).document.querySelector('svg').getAttribute('width'), '720'); assert.ok(a.includes('CONTRIBUTOR BADGES')); assert.ok(!a.includes('data-layout="profile"'));
});
test('Landscape keeps user ID/slack removed, with independent profile and social links', () => {
  const p = profile();
  const d = doc({ userId: true, website: true, github: true, slack: true, social: true, link: true }, p);
  assert.equal(d.querySelectorAll('[data-field="userId"],[data-field="website"],[data-field="github"],[data-field="slack"]').length, 0);
  assert.equal(d.querySelectorAll('a').length, 7);
  assert.equal(d.querySelectorAll('[data-social]').length, 6);
  assert.equal(d.querySelector('[data-field="link"] a').getAttribute('href'), 'https://profiles.wp.org/fixture/');
  const visible = [...d.querySelectorAll('text,title,desc')].map(el => el.textContent).join(' ');
  for (const value of [p.userId, p.website.label, p.github.label, p.slack]) assert.ok(!visible.includes(value), value);
  const textHeight = Number(d.querySelector('[data-profile-text]').getAttribute('data-text-height'));
  assert.equal(Number(d.querySelector('[data-field="avatar"] clipPath circle').getAttribute('r')) * 2, textHeight);
  assert.ok(parseHTML(renderCard(p, { layout: 'classic', link: true })).document.querySelector('a'), 'classic profile link remains supported');
});
