import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom/worker';
import { renderSocial } from '../shared/social.js';
import { EVENTS, ROLES } from '../shared/events.js';

const profile = { name: 'Frame Test', userName: 'frame-test' };
const doc = svg => parseHTML(svg).document;
import { EVENT_FONT_METRICS, eventInkCenter } from '../shared/event-fonts.js';
const checkCentered = svg => {
  const d = doc(svg);
  for (const [field, direction] of [['event', 1], ['role', -1]]) {
    const text = d.querySelector(`[data-field="${field}"] text`);
    const size = Number(text.getAttribute('font-size'));
    const face = EVENT_FONT_METRICS[text.getAttribute('data-face')];
    const inkCenter = eventInkCenter(text.textContent, face);
    const path = d.querySelector(`#${field}-arc`).getAttribute('d');
    const radius = Number(path.match(/ A ([\d.]+) /)[1]);
    assert.ok(Math.abs(radius + direction * inkCenter * size - 463) < 0.001, `${field}/${size}: cap band must center on ring radius 463, not its baseline`);
    assert.equal(+text.getAttribute('font-weight'), face.weight);
  }
  return d;
};

test('all catalogue frame labels center their visible uppercase cap bands', () => {
  for (const event of EVENTS) for (const role of ROLES) {
    const d = checkCentered(renderSocial(profile, { event: event.id, role: role.id, avatar: false }));
    assert.equal(d.querySelector('[data-field="event"]').textContent, event.label.toUpperCase());
    assert.equal(d.querySelector('[data-field="role"]').textContent, role.statement.toUpperCase());
  }
});

test('frame baselines use fitted sizes, including the 48px minimum', async () => {
  // Substitute only the catalogue dependency to exercise longer future labels.
  // Real fitting, SVG serialization and font metrics are unchanged; no runtime API for tests.
  const url = new URL('../shared/social.js', import.meta.url);
  const source = (await readFile(url, 'utf8')).replace("import { EVENTS, ROLES } from './events.js';", `const EVENTS = ${JSON.stringify([{ ...EVENTS[0], label: 'W'.repeat(23) }])}; const ROLES = ${JSON.stringify([{ ...ROLES[0], statement: 'W'.repeat(23) }])};`).replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`);
  const { renderSocial: withLongLabels } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const d = checkCentered(withLongLabels(profile));
  const sizes = [...d.querySelectorAll('textPath')].map(n => Number(n.parentNode.getAttribute('font-size')));
  assert.ok(sizes[0] >= 48 && sizes[0] < 56, 'event text shrank');
  assert.equal(sizes[1], 48, 'role reached the minimum');
});

// Branding intentionally changes social bytes; preserve geometry and privacy
// across every event/role/palette/visibility choice, not stale typography hashes.
test('all 1280 branded variants preserve photo geometry and privacy', () => {
  let count = 0;
  for (const layout of ['avatar', 'announcement']) for (const event of EVENTS) for (const role of ROLES) for (const palette of [{}, { foreground: '191E23', headerColor: 'FFFFFF', nameColor: 'EEEEEE', subHeaderColor: 'CCCCCC' }]) for (let mask = 0; mask < 16; mask++) {
    const flags = Object.fromEntries(['avatar', 'name', 'handle', 'eventDetails'].map((key, i) => [key, Boolean(mask & (1 << i))]));
    const d = doc(renderSocial(profile, { layout, event: event.id, role: role.id, ...palette, ...flags }));
    const photo = d.querySelector('#social-photo circle');
    assert.equal(Boolean(photo), flags.avatar);
    if (photo) { assert.equal(photo.getAttribute('cx'), '540'); assert.equal(photo.getAttribute('cy'), layout === 'avatar' ? '540' : '660'); assert.equal(photo.getAttribute('r'), layout === 'avatar' ? '400' : '300'); }
    if (layout === 'avatar') {
      const ring = d.querySelector('[data-field="ring"]');
      assert.equal(ring.getAttribute('r'), '463'); assert.equal(ring.getAttribute('stroke-width'), '126');
      assert.equal(d.querySelector('rect, [data-field="name"], [data-field="handle"], [data-field="eventDetails"]'), null);
    }
    count++;
  }
  assert.equal(count, 1280);
});
