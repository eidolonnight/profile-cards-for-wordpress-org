import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { renderCard, measureText } from '../functions/_svg.js';
import { queryOptions } from '../functions/_profile.js';
import { FONT_CSS } from '../functions/_fonts.js';
const profile = { userName: 'fixture', name: 'Ada Example', memberSince: 'January 2001', profileUrl: 'https://profiles.wordpress.org/fixture/', badges: Array.from({ length: 11 }, (_, i) => ({ name: `Badge ${i}`, class: '' })) };
const parse = (options = {}, data = profile) => parseHTML(renderCard(data, { layout: 'square', ...options }, 'data:image/png;base64,AAAA')).document;

test('Square uses a native stacked composition, not an inset legacy rectangle', () => {
  const d = parse();
  assert.equal(d.querySelector('svg').getAttribute('viewBox'), '0 0 720 720');
  assert.equal(d.querySelectorAll('rect').length, 1);
  assert.equal(d.querySelector('[data-square-content] > rect'), null);
  assert.equal(d.querySelector('style').textContent, FONT_CSS);
  const image = d.querySelector('image');
  assert.equal(Number(image.getAttribute('x')) + Number(image.getAttribute('width')) / 2, 360);
  assert.ok(Number(image.getAttribute('height')) >= 100);
  const name = d.querySelector('[data-field="name"] text');
  assert.equal(name.getAttribute('text-anchor'), 'middle');
  assert.ok(Number(name.getAttribute('y')) > Number(image.getAttribute('y')) + Number(image.getAttribute('height')));
  assert.equal(d.querySelectorAll('[data-square-badge]').length, profile.badges.length);
});

test('Square name and badges disappear from accessibility metadata when omitted', () => {
  const d = parse({ header: false, avatar: false, badges: false, link: true });
  assert.doesNotMatch(d.querySelector('title').textContent + d.querySelector('desc').textContent, /Ada Example|11 badges/);
  assert.equal(d.querySelector('[data-field="name"],image,[data-square-badge]'), null);
});

test('Square retains hostile and long content inside measured text columns', () => {
  const p = { ...profile, name: '界😀W'.repeat(60), memberSince: '界'.repeat(90), badges: [{ name: 'Ｗ界'.repeat(100), class: '' }, { name: 'W'.repeat(100), class: '' }] };
  const d = parse({ link: true }, p);
  const texts = [...d.querySelectorAll('text[data-max-width]')];
  assert.ok(texts.length > 10);
  for (const text of texts) {
    const face = text.getAttribute('font-weight') === '600' ? 'sansBold' : 'sans';
    assert.ok(measureText(text.textContent, Number(text.getAttribute('font-size')), face) <= Number(text.getAttribute('data-max-width')), text.textContent);
  }
  assert.equal([...d.querySelectorAll('[data-field="name"] text')].map(el => el.textContent).join(''), p.name);
});

test('Landscape link follows secondary text color unless explicitly customized', () => {
  for (const color of ['50575E', 'C3C4C7']) {
    const options = queryOptions(new Request(`https://local.test/card?username=fixture&layout=profile&link=true&subHeaderColor=${color}`));
    assert.equal(options.linkColor, color);
    const d = parseHTML(renderCard(profile, options)).document;
    assert.equal(d.querySelector('[data-field="link"] text').getAttribute('fill'), '#'+color);
    const direct = parseHTML(renderCard(profile, { layout: 'profile', link: true, subHeaderColor: color })).document;
    assert.equal(direct.querySelector('[data-field="link"] text').getAttribute('fill'), '#'+color);
  }
  const custom = queryOptions(new Request('https://local.test/card?username=fixture&layout=profile&link=true&linkColor=123ABC'));
  assert.equal(custom.linkColor, '123ABC');
});
