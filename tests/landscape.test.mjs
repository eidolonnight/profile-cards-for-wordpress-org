import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseHTML } from 'linkedom/worker';
import { renderCard, measureText } from '../functions/_svg.js';
import { FONT_CSS } from '../functions/_fonts.js';

// Entirely synthetic; category names reflect public class vocabulary, not live data.
const classes = ['editor-code', 'networking', 'admin-page', 'format-status', 'camera', 'video-alt2', 'tickets'];
const fixture = () => ({ userName: 'fixture', name: 'Ada Example', memberSince: 'January 2001', joined: 'Jan 2001', profileUrl: 'https://profiles.wordpress.org/fixture/', jobTitle: 'Engineer', organization: 'Example', location: 'Example City', teams: ['Core', 'Community'], badges: Array.from({ length: 11 }, (_, i) => ({ name: `Badge ${i}`, class: `medal dashicons dashicons-${classes[i % classes.length]}` })) });
const doc = (options = {}, p = fixture(), avatar = null) => parseHTML(renderCard(p, { layout: 'profile', ...options }, avatar)).document;
const number = (el, key) => Number(el.getAttribute(key));
const noText = { name: false, jobTitle: false, organization: false, handle: false, location: false, joined: false, teams: false };
const assertXML = svg => {
  const result = spawnSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E; E.fromstring(sys.stdin.read())'], { input: svg, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};

test('Landscape has eleven small accessible graphical badges in one horizontal row', () => {
  const d = doc({ badges: true, badgeNames: false, badgeLabelColor: '123ABC' });
  const icons = [...d.querySelectorAll('[data-field="badges"]')];
  assert.equal(icons.length, 11);
  assert.equal(d.querySelectorAll('[data-field="badges"] text').length, 0);
  assert.ok(!d.querySelector('svg').textContent.includes('CONTRIBUTOR BADGES'));
  assert.equal(new Set(icons.map(el => el.getAttribute('data-y'))).size, 1);
  icons.forEach((icon, i) => {
    assert.equal(icon.getAttribute('data-badge'), `Badge ${i}`);
    assert.equal(icon.getAttribute('aria-label'), `Badge ${i}`);
    assert.equal(icon.querySelector('title').textContent, `Badge ${i}`);
    assert.ok(icon.querySelector('path'));
    assert.equal(icon.getAttribute('color'), '#123ABC');
    assert.equal(number(icon, 'data-size'), 40);
    assert.equal(number(icon, 'data-x'), i * 52);
  });
  assert.equal(new Set(icons.slice(0, 7).map(el => el.querySelector('path').getAttribute('d'))).size, 7);
});

test('Landscape retains extreme badge counts, wraps within copy width, and has an original fallback', () => {
  const p = fixture(); p.badges = Array.from({ length: 101 }, (_, i) => ({ name: `Unknown ${i}`, class: 'unknown' }));
  const d = doc({ header: false, badges: true }, p);
  const icons = [...d.querySelectorAll('[data-badge]')];
  assert.equal(icons.length, 101); assert.ok(new Set(icons.map(el => el.getAttribute('data-y'))).size > 1);
  icons.forEach(icon => { assert.ok(icon.querySelector('path')); assert.ok(number(icon, 'data-x') + 40 <= 1620); });
  assert.equal(doc({ header: false, badges: true, link: false, social: false }, { ...p, badges: [] }).querySelectorAll('[data-field]').length, 0);
});

test('Landscape avatar matches measured selected text and inline link, excluding badges', () => {
  for (const options of [{}, { ...noText, name: true }, { ...noText, handle: true }, { badges: true, link: true }]) {
    const d = doc(options); const copy = d.querySelector('[data-profile-text]');
    const h = number(copy, 'data-text-height'); const circle = d.querySelector('[data-field="avatar"] clipPath circle');
    assert.ok(h > 0); assert.equal(number(circle, 'r') * 2, h); assert.equal(number(circle, 'cy') - h / 2, 84);
    assert.ok(!copy.querySelector('[data-field="badges"]'));
    if (options.link) assert.ok(copy.querySelector('[data-field="link"]'));
    assert.equal(d.querySelector('svg').getAttribute('width'), '1708');
    assert.equal(copy.getAttribute('transform'), `translate(${44 + h + 64} 84)`);
  }
  const full = number(doc().querySelector('[data-profile-text]'), 'data-text-height');
  const nameOnly = number(doc({ ...noText, name: true, link: false, social: false }).querySelector('[data-profile-text]'), 'data-text-height');
  assert.equal(nameOnly, 90); assert.ok(full > nameOnly);
  assert.equal(number(doc({ ...noText, link: false, social: false }).querySelector('[data-field="avatar"] clipPath circle'), 'r'), 160);
  const image = doc({}, fixture(), 'data:image/png;base64,AAAA').querySelector('image');
  assert.equal(number(image, 'height'), full); assert.equal(number(image, 'width'), full);
});

test('Landscape long Unicode text and forty teams expand horizontally, never overlap or disappear', () => {
  const p = fixture(); p.name = '長い😀名前'.repeat(40); p.location = 'WideLocation'.repeat(30);
  p.teams = Array.from({ length: 40 }, (_, i) => `Team ${i} ${'Words '.repeat(15).trim()}`);
  const d = doc({ badges: true, link: true }, p); const svg = d.querySelector('svg'); const copy = d.querySelector('[data-profile-text]');
  const h = number(copy, 'data-text-height'); const width = number(svg, 'width');
  assert.equal(d.querySelectorAll('[data-team]').length, 40); assert.ok(width > 1708); assert.ok(width > number(svg, 'height'));
  assert.equal(number(d.querySelector('[data-field="avatar"] clipPath circle'), 'r') * 2, h);
  assert.ok(44 + h + 64 + 1236 + 44 <= width);
  assert.equal([...copy.querySelectorAll('[data-field="name"] text')].map(n => n.textContent).join(''), p.name);
  for (const text of copy.querySelectorAll('text')) {
    const face = text.getAttribute('font-family').includes('Garamond') ? 'serif' : text.getAttribute('font-family').includes('mono') ? 'mono' : text.getAttribute('font-weight') === '600' ? 'sansBold' : 'sans';
    assert.ok(number(text, 'x') + measureText(text.textContent, number(text, 'font-size'), face) <= 1236, text.textContent);
    assert.ok(number(text, 'y') <= h);
  }
  assertXML(renderCard(p, { layout: 'profile', badges: true }));
});

test('Landscape link defaults on, is independently optional and fixed-origin, and invalid usernames fail closed', () => {
  const p = { ...fixture(), profileUrl: 'javascript:alert(1)' };
  assert.equal(doc({}, p).querySelectorAll('[data-field="link"]').length, 1);
  assert.equal(doc({ link: false }, p).querySelectorAll('a,[data-field="link"]').length, 0);
  const d = doc({ header: false, link: true, badges: false, social: false }, p);
  assert.equal(d.querySelectorAll('a').length, 1); assert.equal(d.querySelectorAll('[data-field]').length, 1);
  assert.equal(d.querySelector('a').getAttribute('href'), 'https://profiles.wp.org/fixture/');
  assert.equal(d.querySelector('a').textContent, 'profiles.wp.org/fixture/');
  assert.ok(!d.querySelector('desc').textContent.includes('Empty'));
  for (const userName of ['../bad', '//evil.test', 'Uppercase', 'a\n', 'x" onclick="bad', 'a'.repeat(61)]) assert.equal(doc({ header: false, link: true }, { ...p, userName }).querySelectorAll('a').length, 0);
});

test('Landscape badge attributes and Unicode stay inert and embedded fonts are untouched', () => {
  const p = fixture(); p.badges = [{ name: '😀 <script>&"\uFFFE\uD800', class: 'dashicons-camera" onload="bad' }];
  const svg = renderCard(p, { layout: 'profile', badges: true, link: true }, 'https://evil.test/picture.png'); const d = parseHTML(svg).document;
  assert.equal(d.querySelectorAll('script,foreignObject,image,[onload]').length, 0);
  assert.equal(d.querySelector('[data-badge]').getAttribute('data-badge'), '😀 <script>&"');
  assert.equal(d.querySelector('style').textContent, FONT_CSS); assert.ok(!svg.includes('evil.test')); assertXML(svg);
});

test('Square is truly 720 by 720, centered and scaled only as necessary, retaining all content', () => {
  for (const count of [0, 11, 80]) {
    const p = fixture(); p.badges = Array.from({ length: count }, (_, i) => ({ name: `Badge ${i} ${'longword'.repeat(8)}`, class: '' }));
    const d = doc({ layout: 'square', link: true, foreground: '191E23' }, p); const svg = d.querySelector('svg');
    assert.equal(svg.getAttribute('data-layout'), 'square'); assert.equal(svg.getAttribute('width'), '720'); assert.equal(svg.getAttribute('height'), '720');
    assert.equal(svg.getAttribute('viewBox'), '0 0 720 720');
    const bg = d.querySelector('svg > rect'); assert.equal(bg.getAttribute('fill'), '#191E23'); assert.equal(bg.getAttribute('width'), '720'); assert.equal(bg.getAttribute('height'), '720');
    const body = d.querySelector('[data-square-content]'); const scale = number(body, 'data-scale'); const height = number(body, 'data-content-height');
    assert.ok(scale > 0 && scale <= 1); assert.equal(scale, Math.min(1, 720 / height));
    assert.equal(body.getAttribute('transform'), `translate(${(720 - 720 * scale) / 2} ${(720 - height * scale) / 2}) scale(${scale})`);
    assert.ok(d.querySelector('a')); if (count) assert.ok(svg.textContent.includes(`Badge ${count - 1}`));
    assertXML(renderCard(p, { layout: 'square' }));
  }
});

test('Square preserves all visibility toggles, palettes, safe links, Unicode, and raster-only avatars', () => {
  for (const header of [true, false]) for (const avatar of [true, false]) for (const badges of [true, false]) for (const link of [true, false]) {
    const d = doc({ layout: 'square', header, avatar, badges, link, nameColor: '123456', badgeLabelColor: 'ABCDEF' }, { ...fixture(), profileUrl: 'javascript:alert(1)' }, 'data:image/png;base64,AAAA');
    assert.equal(d.querySelectorAll('image').length, Number(header && avatar)); assert.equal(d.querySelectorAll('a').length, Number(link));
    assert.equal(d.querySelector('svg').textContent.includes('CONTRIBUTOR BADGES'), badges);
    assert.equal([...d.querySelectorAll('text')].some(n => n.textContent.includes('@fixture')), header);
    if (header) assert.equal([...d.querySelectorAll('text')].find(n => n.textContent === 'Ada Example').getAttribute('fill'), '#123456');
    if (link) assert.equal(d.querySelector('a').getAttribute('href'), 'https://profiles.wp.org/fixture/');
  }
  const svg = renderCard({ ...fixture(), name: '😀 <script>\uFFFE\uD800' }, { layout: 'square' }, 'data:image/svg+xml;base64,AAAA');
  assertXML(svg); assert.equal(parseHTML(svg).document.querySelectorAll('script,foreignObject,image').length, 0);
});

test('Square wraps wide Unicode and wide Latin glyphs within each compact text column', () => {
  const p = { ...fixture(), name: '界😀W'.repeat(60), memberSince: '界'.repeat(90), badges: [{ name: 'Ｗ界'.repeat(100), class: '' }, { name: 'W'.repeat(100), class: '' }] };
  const svg = renderCard(p, { layout: 'square' }); const d = parseHTML(svg).document;
  for (const text of d.querySelectorAll('text[data-max-width]')) {
    const face = text.getAttribute('font-weight') === '600' ? 'sansBold' : 'sans';
    assert.ok(measureText(text.textContent, number(text, 'font-size'), face) <= number(text, 'data-max-width'), text.textContent);
  }
  assert.equal([...d.querySelectorAll('[data-field="name"] text')].map(n => n.textContent).join(''), p.name);
  assertXML(svg);
});

test('Missing layout and explicit classic remain byte-for-byte baseline compatible', () => {
  const p = { userName: 'fixture', name: 'Ada Example', memberSince: 'January 2001', profileUrl: 'https://profiles.wordpress.org/fixture/', badges: [{ name: 'Core Contributor', class: 'dashicons-editor-code' }] };
  const cases = [[{}, '9098fd1cb154a36359fd8c5d943a53f6ee6a43fb98574904bdd52a2cdac2cdff'], [{ layout: 'classic', header: false, badges: false, avatar: false, link: true }, 'b06ef76e556415124e6528df367116050164d927374bf3595852df959a83452f'], [{ layout: 'classic', foreground: '191E23', badgeLabelColor: 'FFFFFF' }, 'ac68ab96b68c73bad4c373a5255aa9414835d881e863f38e9d1469b7e48f5b8f']];
  for (const [options, hash] of cases) assert.equal(createHash('sha256').update(renderCard(p, options)).digest('hex'), hash);
  assert.equal(renderCard(p), renderCard(p, { layout: 'classic' }));
});
