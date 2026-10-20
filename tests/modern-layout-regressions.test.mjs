import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { renderCard, measureText } from '../shared/svg.js';
import { queryOptions } from '../shared/options.js';

const fixture = () => ({ userName: 'fixture', name: 'Ada Example', jobTitle: 'Engineer', organization: 'Example Org', location: 'Example City', joined: 'Jan 2001', teams: ['Core', 'Meta'], badges: [{ name: 'Core Contributor', class: 'badge-code' }], social: [{ key: 'github', url: 'https://github.com/fixture' }] });
const doc = (layout, options = {}, profile = fixture()) => parseHTML(renderCard(profile, { layout, ...options })).document;
const n = (el, key) => Number(el.getAttribute(key));
const position = el => el.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);

for (const layout of ['profile', 'square']) {
  test(`${layout}: social immediately follows identity and precedes teams and badges`, () => {
    const d = doc(layout, { link: true, social: true, badges: true });
    const fields = [...d.querySelectorAll('[data-field]')].map(el => el.getAttribute('data-field')).filter(key => key !== 'avatar');
    assert.deepEqual(fields, ['name', 'jobLine', 'handle', 'link', 'location', 'joined', 'social', 'teams', 'badges']);
    const social = d.querySelector('[data-social]');
    const [, sy] = position(social);
    const joined = d.querySelector('[data-field="joined"] text');
    const team = d.querySelector('[data-team] rect');
    assert.ok(sy > n(joined, 'y'));
    assert.ok(sy + 44 < n(team, 'y'));
    assert.ok(n(team, 'y') + n(team, 'height') < n(d.querySelector('[data-badge]'), 'data-y'));
  });

  test(`${layout}: each social row aligns with copy after filtering, including partial rows`, () => {
    for (const count of [0, 1, 5, 11, 12, 23, 40]) {
      const p = fixture();
      p.social = Array.from({ length: count }, (_, i) => ({ key: `service-${i}`, url: `https://example.test/${i}` }));
      p.social.unshift({ key: 'invalid', url: 'javascript:evil()' }, { key: 'omitted', url: 'https://example.test/omitted' }, { key: 'unverified', url: 'https://example.test/unverified', verified: false });
      if (count) p.social.push({ key: 'duplicate', url: 'https://example.test/0' });
      const d = doc(layout, { social: true, omitSocial: ['omitted'] }, p);
      const links = [...d.querySelectorAll('[data-social]')];
      assert.equal(links.length, count);
      const rows = new Map();
      for (const link of links) {
        const [x, y] = position(link);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(x);
      }
      let previousY;
      for (const [y, xs] of rows) {
        if (previousY !== undefined) near(y - previousY, 56);
        previousY = y;
        if (layout === 'square') near((xs[0] + xs.at(-1) + 44) / 2, 320);
        else near(xs[0], 0);
        xs.slice(1).forEach((x, i) => near(x - xs[i], 56));
        assert.ok(xs.at(-1) + 44 <= (layout === 'square' ? 640 : 1236));
      }
    }
  });
}

for (const badgeNames of [true, false]) {
  test(`square: fixed three-column badge rows, complete labels=${badgeNames}, tallest-cell spacing`, () => {
    for (const count of [1, 2, 3, 8, 41]) {
      const p = fixture();
      p.badges = Array.from({ length: count }, (_, i) => ({ name: i % 3 === 1 ? `Badge ${i} ${'Long label 界😀W '.repeat(9).trim()}` : `Badge ${i}`, class: '' }));
      const d = doc('square', { badges: true, badgeNames }, p);
      const badges = [...d.querySelectorAll('[data-badge]')];
      assert.equal(badges.length, count);
      const cellWidth = (640 - 24) / 3;
      for (let i = 0; i < count; i += 3) {
        const row = badges.slice(i, i + 3);
        const y = n(row[0], 'data-y');
        row.forEach((badge, col) => {
          near(n(badge, 'data-x'), col * (cellWidth + 12));
          near(n(badge, 'data-y'), y);
          assert.ok(n(badge, 'data-width') <= cellWidth);
          assert.ok(n(badge, 'data-x') + n(badge, 'data-width') <= 640);
          const texts = [...badge.querySelectorAll('text')];
          if (badgeNames) {
            assert.equal(texts.map(t => t.textContent).join('').replaceAll(' ', ''), p.badges[i + col].name.replaceAll(' ', ''));
            for (const text of texts) {
              assert.ok(measureText(text.textContent, n(text, 'font-size')) <= n(text, 'data-max-width'));
              assert.ok(n(text, 'y') <= n(badge, 'data-height'));
            }
          } else assert.equal(texts.length, 0);
        });
        if (badges[i + 3]) near(n(badges[i + 3], 'data-y'), y + Math.max(...row.map(b => n(b, 'data-height'))) + 12);
      }
      const root = d.querySelector('svg');
      for (const key of ['width', 'height']) assert.equal(root.getAttribute(key), '720');
      assert.equal(root.getAttribute('viewBox'), '0 0 720 720');
      const content = d.querySelector('[data-square-content]');
      assert.ok(Math.max(...badges.map(b => n(b, 'data-y') + n(b, 'data-height'))) < n(content, 'data-content-height'));
      assert.ok(n(content, 'data-content-height') * n(content, 'data-scale') <= 720.000001);
    }
  });
}

test('modern default badge labels are visible in direct and parsed renderer calls', () => {
  for (const layout of ['profile', 'square']) {
    for (const options of [{}, queryOptions(new Request(`https://example.test/card?username=fixture&layout=${layout}`))]) {
      const d = doc(layout, options);
      assert.ok(d.querySelector('[data-badge] text'));
      assert.ok(d.querySelector('[data-field="social"]'));
      assert.ok(d.querySelector('[data-field="link"]'));
    }
  }
});

test('classic and WordCamp parsed defaults are unchanged and refresh never defaults on', () => {
  for (const layout of ['classic', 'avatar', 'announcement']) {
    const o = queryOptions(new Request(`https://example.test/card?username=fixture&layout=${layout}`));
    assert.equal(o.badges, layout === 'classic');
    assert.equal(o.link, false);
    assert.equal(o.badgeNames, false);
    assert.equal(o.social, true);
    assert.equal(o.refresh, false);
    if (layout !== 'classic') assert.equal(o.eventDetails, true);
  }
});

test('landscape avatar remains content-driven, badges do not resize it, avatar-only fallback survives', () => {
  const onlyAvatar = { name: false, jobTitle: false, organization: false, handle: false, location: false, joined: false, teams: false, badges: false, link: false, social: false };
  const avatarSize = d => n(d.querySelector('[data-field="avatar"] clipPath circle'), 'r') * 2;
  const reduced = doc('profile', { ...onlyAvatar, name: true });
  assert.equal(avatarSize(reduced), 90);
  assert.equal(avatarSize(doc('profile', onlyAvatar)), 320);
  const p = fixture(); p.teams = Array.from({ length: 40 }, (_, i) => `Team ${i} ${'Words '.repeat(15).trim()}`);
  const full = doc('profile', {}, p);
  assert.ok(avatarSize(full) > avatarSize(reduced));
  assert.equal(avatarSize(full), n(full.querySelector('[data-profile-text]'), 'data-text-height'));
  assert.equal(avatarSize(full), avatarSize(doc('profile', { badges: false }, p)));
  assert.equal(full.querySelectorAll('[data-team]').length, 40);
  assert.ok(n(full.querySelector('svg'), 'width') > n(full.querySelector('svg'), 'height'));
});
