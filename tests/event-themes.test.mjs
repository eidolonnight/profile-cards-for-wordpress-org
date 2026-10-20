import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom/worker';
import { EVENT_THEMES } from '../shared/event-themes.js';
import { EVENT_FONT_CSS, EVENT_FONT_STYLE_HASH, EVENT_FONTS, measureEventText } from '../shared/event-fonts.js';
import { EVENTS, ROLES } from '../shared/events.js';
import { renderSocial } from '../shared/social.js';
import { queryOptions, DEFAULT_COLORS } from '../shared/options.js';
const profile = { name: 'Ada Example', userName: 'synthetic' };
const families = { 'asia-2027': ['Faculty Glyphic', 'Kumbh Sans'], 'europe-2027': ['Cardo', 'Inter'], 'india-2027': ['Cardo', 'Inter'], 'us-2027': ['Open Sans', 'Open Sans'] };
const expected = {
  'asia-2027': { colors: ['F4F1EA','000073','000073','302F2F','005ED6'], weights: [400,400,500], decoration: 'botanical' },
  'europe-2027': { colors: ['F9F9F9','111111','111111','636363','111111'], weights: [400,400,600], decoration: 'editorial' },
  'india-2027': { colors: ['1A1A1A','FAFAFA','FAFAFA','D4D4D4','FF8A3D'], weights: [700,400,600], decoration: 'typographic' },
  'us-2027': { colors: ['FFFFFF','0073AA','32373C','32373C','0073AA'], weights: [300,400,600], decoration: 'template' }
};
for (const event of EVENTS) test(`${event.id}: evidence-grounded palette, fonts, offline bounded rendering`, () => {
  const theme = EVENT_THEMES[event.id];
  assert.deepEqual(Object.keys(theme.colors).sort(), ['foreground','headerColor','nameColor','subHeaderColor','badgeLabelColor'].sort());
  assert.deepEqual(['foreground','headerColor','nameColor','subHeaderColor','badgeLabelColor'].map(k => theme.colors[k]), expected[event.id].colors);
  assert.deepEqual(Object.values(EVENT_FONTS[event.id]).map(f => f.weight), expected[event.id].weights);
  assert.deepEqual(event.colors, theme.colors); assert.ok(Object.isFrozen(event.colors));
  for (const value of Object.values(theme.colors)) assert.match(value, /^[A-F0-9]{6}$/);
  assert.equal(event.styleNote, theme.styleNote); assert.ok(theme.styleNote.length > 20);
  assert.equal(EVENT_FONTS[event.id].display.family, families[event.id][0]);
  assert.equal(EVENT_FONTS[event.id].body.family, families[event.id][1]);
  const options = queryOptions(new Request(`https://example.test/card?username=synthetic&layout=avatar&event=${event.id}&nameColor=ABCDEF`));
  for (const [key, value] of Object.entries(theme.colors)) assert.equal(options[key], key === 'nameColor' ? 'ABCDEF' : value);
  for (const layout of ['avatar','announcement']) for (const role of ROLES) for (const avatar of [false, true]) {
    const svg = renderSocial(profile, { event: event.id, layout, role: role.id, avatar });
    const doc = parseHTML(svg).document;
    if (layout === 'announcement') {
      assert.ok(doc.querySelector(`[data-decoration="${expected[event.id].decoration}"]`));
      const custom = parseHTML(renderSocial(profile, { event: event.id, layout, headerColor: 'abcdef' })).document;
      for (const n of custom.querySelectorAll('[data-field="event"] text')) assert.equal(n.getAttribute('fill'), '#ABCDEF');
    }
    assert.throws(() => renderSocial(profile, { event: event.id, layout, foreground: '" onload="bad' }), { code: 'invalid_color' });
    assert.equal(doc.querySelector('style').textContent, EVENT_FONT_CSS[event.id]);
    assert.equal(EVENT_FONT_STYLE_HASH[event.id], 'sha256-' + createHash('sha256').update(EVENT_FONT_CSS[event.id]).digest('base64'));
    assert.doesNotMatch(EVENT_FONT_CSS[event.id], /https?:|Garamond/);
    assert.ok(svg.length < 650000, 'bounded event-relevant font payload');
    for (const n of doc.querySelectorAll('text')) {
      const face = Object.values(EVENT_FONTS[event.id]).find(f => f.key === n.getAttribute('data-face'));
      assert.ok(face, 'selected event font');
      const field = n.closest('[data-field]').getAttribute('data-field');
      const fonts = EVENT_FONTS[event.id];
      const assigned = { avatar: fonts.display, event: fonts.display, name: fonts.display, handle: fonts.body, eventDetails: fonts.body, role: layout === 'avatar' && event.id === 'asia-2027' ? fonts.display : fonts.emphasis };
      assert.equal(face.key, assigned[field]?.key, `${event.id}/${layout}/${role.id}/${field}: correct event font for every text role`);
      const generic = ['Cardo', 'Faculty Glyphic'].includes(face.family) ? 'serif' : 'sans-serif';
      assert.equal(n.getAttribute('font-family'), `'${face.alias}', ${generic}`, 'actual SVG font-family must match its metrics, not merely data-face');
      assert.ok(measureEventText(n.textContent, +n.getAttribute('font-size'), face) <= +n.getAttribute('data-max-width') + 0.01);
      assert.equal(+n.getAttribute('font-weight'), face.weight);
    }
    assert.equal(doc.querySelector('script, foreignObject, a, image'), null);
    assert.doesNotMatch(svg, /January 1|mandala|lotus|elephant/i);
  }
});
test('event portraits preserve the existing two-MiB social-photo allowance', () => {
  // Synthetic boundary fixture, not a decodable photograph. The real fetch
  // signature/byte-budget tests own ingestion; this checks lossless rendering.
  const data = 'data:image/jpeg;base64,' + Buffer.alloc(2 * 1024 * 1024).toString('base64');
  const oversized = 'data:image/jpeg;base64,' + Buffer.alloc(2 * 1024 * 1024 + 4).toString('base64');
  for (const event of EVENTS) for (const layout of ['avatar', 'announcement']) {
    assert.ok(renderSocial(profile, { event: event.id, layout }, data).includes(`href="${data}"`), `${event.id}/${layout}: accepted social photo must remain embedded`);
    assert.ok(!renderSocial(profile, { event: event.id, layout }, oversized).includes('<image '), 'larger than the existing upstream photo budget stays rejected');
  }
});
test('non-social palettes stay unchanged and catalogue excludes heavy fonts', () => {
  const o = queryOptions(new Request('https://example.test/card?username=synthetic'));
  for (const [key, value] of Object.entries(DEFAULT_COLORS)) assert.equal(o[key], value);
  assert.doesNotMatch(JSON.stringify(EVENTS), /base64|advances|font-face|woff2/);
});
