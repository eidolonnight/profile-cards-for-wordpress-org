import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom/worker';
import { renderSocial } from '../shared/social.js';
import { EVENTS, ROLES } from '../shared/events.js';
import { EVENT_FRAMES } from '../events/frames.js';
import { eventFrameData } from './frame-artwork.mjs';
import { drawFrame } from '../tools/draw-event-frames.mjs';
// Avatar frames are PNG artwork that carries its own lettering. The measured vector
// labels below belong to the project's interim frames, drawn offline by the tool.

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

test('all drawn interim frame labels center their visible uppercase cap bands', () => {
  for (const event of EVENTS) for (const role of ROLES) {
    const d = checkCentered(drawFrame(event.id, role.id));
    assert.equal(d.querySelector('[data-field="event"]').textContent, event.label.toUpperCase());
    assert.equal(d.querySelector('[data-field="role"]').textContent, role.statement.toUpperCase());
    // Opaque to every edge with one round photo window; nothing personal is drawn.
    assert.match(d.querySelector('[data-field="ground"]').getAttribute('d'), /^M 0 0 H 1080 V 1080 H 0 Z M 140 540 A 400 400 /);
    assert.equal(d.querySelector('image, [data-field="avatar"], [data-field="name"], [data-field="handle"]'), null);
  }
  assert.throws(() => drawFrame('asia-1999', 'attendee'), /Unknown edition or role/);
  assert.throws(() => drawFrame(EVENTS[0].id, 'keynote'), /Unknown edition or role/);
});

test('frame baselines use fitted sizes, including the 48px minimum', async () => {
  // Substitute only the catalogue dependency to exercise longer future labels.
  // Real fitting, SVG serialization and font metrics are unchanged; no runtime API for tests.
  const url = new URL('../tools/draw-event-frames.mjs', import.meta.url);
  const original = await readFile(url, 'utf8');
  const catalog = "import { EVENTS, ROLES } from '../events/catalog.js';";
  assert.ok(original.includes(catalog));
  const source = original.replace(catalog, `const EVENTS = ${JSON.stringify([{ ...EVENTS[1], label: 'W'.repeat(23) }])}; const ROLES = ${JSON.stringify([{ ...ROLES[0], statement: 'W'.repeat(23) }])};`).replace(/from '(\.{1,2}\/[^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`);
  const { drawFrame: withLongLabels } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const d = checkCentered(withLongLabels(EVENTS[1].id, ROLES[0].id));
  const sizes = [...d.querySelectorAll('textPath')].map(n => Number(n.parentNode.getAttribute('font-size')));
  assert.ok(sizes[0] >= 48 && sizes[0] < 56, 'event text shrank');
  assert.equal(sizes[1], 48, 'role reached the minimum');
});

// Branding intentionally changes social bytes; preserve geometry and privacy
// across every event/role/palette/visibility choice, not stale typography hashes.
test('all 1728 branded variants preserve photo geometry and privacy', () => {
  let count = 0;
  for (const layout of ['avatar', 'announcement']) for (const event of EVENTS) for (const role of ROLES) for (const palette of [{}, { foreground: '191E23', headerColor: 'FFFFFF', nameColor: 'EEEEEE', subHeaderColor: 'CCCCCC' }]) for (let mask = 0; mask < 16; mask++) for (const shape of layout === 'avatar' ? ['circle', 'square'] : [null]) {
    const flags = Object.fromEntries(['avatar', 'name', 'handle', 'eventDetails'].map((key, i) => [key, Boolean(mask & (1 << i))]));
    const artwork = layout === 'avatar';
    const frame = artwork ? eventFrameData(event.id, role.id) : null;
    const d = doc(renderSocial(profile, { layout, event: event.id, role: role.id, ...(shape ? { shape } : {}), ...palette, ...flags }, null, frame));
    const photo = d.querySelector('#social-photo circle');
    assert.equal(Boolean(photo), flags.avatar);
    const area = artwork ? EVENT_FRAMES[event.id].photo : { cx: 540, cy: 660, r: 300 };
    if (photo) for (const key of ['cx', 'cy', 'r']) assert.equal(photo.getAttribute(key), String(area[key]));
    if (artwork) {
      // The photo circle must reach under the artwork on every side of the canvas.
      assert.ok(area.cx - area.r > 0 && area.cy - area.r > 0 && area.cx + area.r < 1080 && area.cy + area.r < 1080);
      assert.equal(d.querySelector('image[data-field="frame"]').getAttribute('href'), frame);
      assert.equal(d.querySelector('rect, text, [data-field="ring"], [data-field="name"], [data-field="handle"], [data-field="eventDetails"]'), flags.avatar ? d.querySelector('[data-field="avatar"] text') : null, 'only the initials fallback draws text');
      // Circle crops photo and artwork together to the inscribed circle; square crops nothing.
      const crop = d.querySelector('#social-shape circle');
      assert.equal(d.documentElement.getAttribute('data-shape'), shape);
      assert.equal(Boolean(crop), shape === 'circle');
      if (crop) {
        assert.deepEqual(['cx', 'cy', 'r'].map(key => crop.getAttribute(key)), ['540', '540', '540']);
        assert.equal(d.querySelector('image[data-field="frame"]').parentNode.getAttribute('clip-path'), 'url(#social-shape)');
        if (photo) assert.equal(d.querySelector('[data-field="avatar"]').parentNode.getAttribute('clip-path'), 'url(#social-shape)');
      } else assert.equal(d.querySelector('[clip-path="url(#social-shape)"]'), null);
    } else assert.equal(d.documentElement.hasAttribute('data-shape'), false);
    count++;
  }
  assert.equal(count, 1728);
});
