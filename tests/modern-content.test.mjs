import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { renderCard, measureText } from '../shared/svg.js';
import { queryOptions } from '../shared/options.js';
import { renderPreview } from '../shared/preview.js';
import { renderCard as serverCard } from '../functions/_svg.js';
import { parseProfile } from '../functions/_profile.js';

const fixture = () => ({ userName: 'fixture', name: 'Ada Example', jobTitle: 'Engineer', organization: 'Example Org', location: 'Example City', joined: 'Jan 2001', teams: ['Core', 'Meta'], badges: [{ name: 'Core Contributor', class: 'badge-code dashicons-editor-code' }, { name: 'WordCamp Organizer', class: 'badge-organizer dashicons-tickets' }, { name: 'Photo Contributor', class: 'badge-photo-contributor dashicons-camera' }], website: { url: 'https://example.test/' }, github: { url: 'https://github.com/fixture' }, social: [{ key: 'twitter', label: 'Wrong label', url: 'https://x.com/fixture' }, { key: 'linkedin', label: 'Also wrong', url: 'https://linkedin.com/in/fixture' }, { key: 'unknown', label: 'Unknown Platform', url: 'https://unknown.test/fixture' }] });
const doc = (layout, options = {}, profile = fixture()) => parseHTML(renderCard(profile, { layout, ...options })).document;
const field = (d, key) => d.querySelector(`[data-field="${key}"]`);

for (const layout of ['profile', 'square']) {
  test(`${layout}: modern query defaults and strict new booleans`, () => {
    const q = suffix => queryOptions(new Request(`https://example.test/card?username=fixture&layout=${layout}${suffix}`));
    for (const key of ['header', 'avatar', 'name', 'jobTitle', 'organization', 'handle', 'location', 'joined', 'teams', 'badges', 'link', 'badgeNames', 'social']) {
      assert.equal(q('')[key], true, key);
      assert.equal(q(`&${key}=false`)[key], false, key);
    }
    assert.equal(q('').refresh, false);
    assert.equal(q('&badgeNames=true&social=true').badgeNames, true);
    for (const value of ['1', '', 'yes', 'TRUE']) assert.throws(() => q('&badgeNames='+value));
    assert.throws(() => q('&badgeNames=true&badgeNames=false'));
  });
  test(`${layout}: every selected field and omission works independently`, () => {
    const full = doc(layout);
    for (const key of ['name', 'handle', 'jobLine', 'location', 'joined', 'teams', 'avatar', 'badges', 'link', 'social']) assert.ok(field(full, key), key);
    for (const key of ['name', 'handle', 'location', 'joined', 'teams', 'avatar', 'badges', 'link', 'social']) assert.equal(field(doc(layout, { badges: true, link: true, social: true, [key]: false }), key), null, key);
    assert.equal(field(doc(layout, { jobTitle: false }), 'jobLine').textContent, 'Example Org');
    assert.equal(field(doc(layout, { organization: false }), 'jobLine').textContent, 'Engineer');
    assert.equal(field(doc(layout, { organization: false, jobTitle: false }), 'jobLine'), null);
    assert.deepEqual([...doc(layout, { omitTeams: ['Meta'] }).querySelectorAll('[data-team]')].map(n => n.getAttribute('data-team')), ['Core']);
  });
  test(`${layout}: short profile link is adjacent to handle, precedes location/teams/badges and ignores upstream URL`, () => {
    const d = doc(layout, { link: true, badges: true }, { ...fixture(), profileUrl: 'javascript:evil()' });
    const link = field(d, 'link');
    assert.equal(link.querySelector('a').getAttribute('href'), 'https://profiles.wp.org/fixture/');
    assert.equal(link.textContent, 'profiles.wp.org/fixture/');
    const fields = [...d.querySelectorAll('[data-field]')].map(n => n.getAttribute('data-field'));
    assert.ok(fields.indexOf('handle') < fields.indexOf('link')); assert.ok(fields.indexOf('link') < fields.indexOf('location'));
    assert.equal(field(doc(layout, { header: false, badges: false, link: true }), 'link').textContent, 'profiles.wp.org/fixture/');
    for (const userName of ['../bad', 'a\n', 'Uppercase', 'a'.repeat(61)]) assert.equal(field(doc(layout, { link: true }, { ...fixture(), userName }), 'link'), null);
  });
  test(`${layout}: links follow secondary colors unless explicitly overridden`, () => {
    const lum = hex => hex.match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const [subHeaderColor, foreground] of [['50575E', 'FFFFFF'], ['C3C4C7', '191E23'], ['223344', 'FFFFFF']]) {
      for (const explicit of [false, true]) {
        const expected = explicit ? '123456' : subHeaderColor;
        const options = { link: true, subHeaderColor, foreground, ...(explicit ? { linkColor: expected } : {}) };
        const query = queryOptions(new Request(`https://example.test/card?username=fixture&layout=${layout}&${new URLSearchParams(options)}`));
        assert.equal(query.linkColor, expected);
        for (const input of [options, query]) assert.equal(field(doc(layout, input), 'link').querySelector('text').getAttribute('fill'), '#' + expected);
        if (!explicit) assert.ok(contrast(expected, foreground) >= 4.5);
      }
    }
  });
  test(`${layout}: badge names add complete wrapped text beside colored icons`, () => {
    const hidden = doc(layout, { badges: true, badgeNames: false }); assert.equal(hidden.querySelectorAll('[data-badge] text').length, 0);
    const d = doc(layout, { badges: true, badgeNames: true });
    assert.deepEqual([...d.querySelectorAll('[data-badge]')].map(n => n.getAttribute('data-badge-color')), ['CD0000', 'F7AD43', 'CB00F0']);
    for (const badge of d.querySelectorAll('[data-badge]')) {
      assert.ok(badge.querySelector('path')); assert.equal([...badge.querySelectorAll('text')].map(n => n.textContent).join(' '), badge.getAttribute('data-badge'));
      assert.equal(badge.getAttribute('aria-label'), badge.getAttribute('data-badge'));
    }
  });
  test(`${layout}: safe social icons keep exact platform names and destinations`, () => {
    assert.equal(doc(layout, { social: false }).querySelectorAll('[data-social]').length, 0);
    const d = doc(layout, { social: true }); const links = [...d.querySelectorAll('[data-social]')];
    assert.deepEqual(links.map(n => n.getAttribute('data-social')), ['website', 'github', 'twitter', 'linkedin', 'unknown']);
    assert.match(links[2].getAttribute('aria-label'), /X \/ Twitter/); assert.match(links[3].getAttribute('aria-label'), /LinkedIn/);
    assert.equal(links[4].getAttribute('data-icon'), 'link');
    for (const link of links) { assert.ok(link.querySelector('path')); assert.ok(link.querySelector('title')); assert.equal(link.querySelector('text'), null); assert.equal(link.querySelector('[aria-hidden]').getAttribute('aria-hidden'), 'true'); assert.equal(link.getAttribute('rel'), 'noopener noreferrer'); }
    assert.deepEqual([...doc(layout, { social: true, omitSocial: ['website', 'twitter', 'unknown'] }).querySelectorAll('[data-social]')].map(n => n.getAttribute('data-social')), ['github', 'linkedin']);
  });
  test(`${layout}: renderer rejects unsafe links and explicit unverified records without fetching`, () => {
    const p = fixture(); p.website = { url: 'javascript:evil()' }; p.github = { url: 'https://name:pass@example.test/' };
    p.social = ['javascript:evil()', 'data:text/html,evil', '//example.test/', 'https://name@example.test', 'https://example.test/\nhi', 'https://example.test/%0ahi', 'https://example.test/\u007fhi'].map((url, i) => ({ key: 'bad-'+i, url }));
    p.social.push({ key: 'twitter', url: 'https://x.com/fixture', verified: false });
    assert.equal(doc(layout, { social: true, link: false }, p).querySelectorAll('a').length, 0);
    p.social = [{ key: 'unknown', label: '<script>&"', url: 'https://example.test/?a=1&b=2' }];
    const d = doc(layout, { social: true, link: false }, p); assert.equal(d.querySelectorAll('script,foreignObject,[onload]').length, 0); assert.equal(d.querySelector('a').getAttribute('href'), 'https://example.test/?a=1&b=2');
  });
  test(`${layout}: canonical preview/server parity and no link fetches with all modern extras`, () => {
    const fetcher = globalThis.fetch; let calls = 0;
    globalThis.fetch = () => { calls++; throw new Error('Renderer must not fetch URLs'); };
    try {
      const query = `username=fixture&layout=${layout}&badges=true&badgeNames=true&social=true&link=true&omitTeams=Meta&omitSocial=unknown`;
      const options = queryOptions(new Request(`https://example.test/card?${query}`));
      assert.ok(renderPreview(fixture(), query) === serverCard(fixture(), options));
      assert.equal(calls, 0);
    } finally { globalThis.fetch = fetcher; }
  });
  test(`${layout}: parser verification survives rendering, independent social works without header`, () => {
    const p = parseProfile('<header class="site-header"><h2>Ada Example</h2><ul id="user-social-media-accounts"><li><a data-verified="true" data-shortname="twitter" href="https://x.com/fixture">Verified</a></li><li><a data-shortname="facebook" href="https://facebook.com/fixture">Unverified</a></li></ul></header>', 'fixture');
    const d = doc(layout, { header: false, social: true, badges: false, link: true }, p);
    assert.deepEqual([...d.querySelectorAll('[data-social]')].map(n => n.getAttribute('data-social')), ['twitter']);
    assert.ok(field(d, 'link')); assert.equal(field(d, 'name'), null);
    assert.equal(d.querySelector('svg').getAttribute('role'), 'group');
    assert.ok(!d.querySelector('[data-social]').getAttribute('aria-label').includes(p.name));
  });
  test(`${layout}: badge source hues and ink/text contrast survive light and dark palettes`, () => {
    const lum = hex => hex.match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const p = fixture(); p.badges.push({ name: 'Meta Contributor', class: '' }, { name: 'Unrecognized', class: 'badge-code-imposter' });
    for (const foreground of ['FFFFFF', '191E23', '888888']) {
      const d = doc(layout, { badges: true, badgeNames: true, foreground, badgeLabelColor: foreground }, p);
      assert.equal(d.querySelector('[data-badge="Meta Contributor"]').getAttribute('data-badge-color'), 'AEADAD');
      assert.equal(d.querySelector('[data-badge="Unrecognized"]').getAttribute('data-badge-color'), foreground);
      for (const badge of d.querySelectorAll('[data-badge]')) {
        const fill = badge.getAttribute('data-badge-color');
        const ink = badge.querySelector('g[stroke]').getAttribute('stroke').slice(1);
        const label = badge.querySelector('text').getAttribute('fill').slice(1);
        assert.ok(contrast(ink, fill) >= 4.5); assert.ok(contrast(label, foreground) >= 4.5);
      }
    }
  });
  test(`${layout}: long identities and team names wrap without losing selected content`, () => {
    const p = fixture(); p.userName = 'w'.repeat(60); p.jobTitle = '界😀W'.repeat(80); p.organization = 'M'.repeat(100); p.teams = Array.from({ length: 40 }, (_, i) => `Team${i}${'W界'.repeat(35)}`);
    const d = doc(layout, { link: true, badges: true, badgeNames: true }, p);
    assert.equal(d.querySelectorAll('[data-field="link"] a').length, 1);
    assert.equal([...d.querySelectorAll('[data-field="link"] text')].map(n => n.textContent).join(''), `profiles.wp.org/${p.userName}/`);
    assert.equal([...d.querySelectorAll('[data-field="jobLine"] text')].map(n => n.textContent).join('').replaceAll(' ', ''), `${p.jobTitle}at${p.organization}`);
    const teams = [...d.querySelectorAll('[data-team]')]; assert.equal(teams.length, 40);
    for (const [i, team] of teams.entries()) assert.equal([...team.querySelectorAll('text')].map(n => n.textContent).join(''), p.teams[i]);
  });
  test(`${layout}: large badge sets preserve labels, wrap and avoid overlap`, () => {
    const p = fixture(); p.badges = Array.from({ length: 200 }, (_, i) => ({ name: `Badge ${i} ${'界😀W'.repeat(40)}`, class: 'unknown' }));
    const d = doc(layout, { badges: true, badgeNames: true, link: true, social: true }, p);
    const badges = [...d.querySelectorAll('[data-badge]')]; assert.equal(badges.length, 200);
    for (const [i, badge] of badges.entries()) {
      assert.equal([...badge.querySelectorAll('text')].map(n => n.textContent).join('').replaceAll(' ', ''), p.badges[i].name.replaceAll(' ', ''));
      for (const t of badge.querySelectorAll('text')) assert.ok(measureText(t.textContent, Number(t.getAttribute('font-size'))) <= Number(t.getAttribute('data-max-width')));
      for (const other of badges.slice(0, i)) { const n = (el, a) => Number(el.getAttribute('data-'+a)); assert.ok(n(badge,'x') >= n(other,'x')+n(other,'width') || n(other,'x') >= n(badge,'x')+n(badge,'width') || n(badge,'y') >= n(other,'y')+n(other,'height') || n(other,'y') >= n(badge,'y')+n(badge,'height')); }
    }
    if (layout === 'square') { assert.equal(d.querySelector('svg').getAttribute('viewBox'), '0 0 720 720'); assert.ok(Number(d.querySelector('[data-square-content]').getAttribute('data-scale')) < 1); }
  });
}
