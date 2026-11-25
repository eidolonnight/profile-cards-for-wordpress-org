import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom/worker';
import { EVENTS, ROLES } from '../shared/events.js';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/theme.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

function dom() {
  const { document, window } = parseHTML(html);
  // Linkedom does not implement writable select.value or checkbox.checked.
  for (const select of document.querySelectorAll('select')) {
    Object.defineProperty(select, 'value', { writable: true, value: select.querySelector('[selected]')?.value || select.querySelector('option')?.value || '' });
  }
  for (const input of document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) input.checked = input.hasAttribute('checked');
  return { document, window, $: id => document.getElementById(id) };
}
function editor(search = '?layout=profile', fetcher = async () => ({ ok: true, json: async () => ({ events: EVENTS, roles: ROLES }) })) {
  const env = dom();
  const context = vm.createContext({
    document: env.document, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Blob, performance,
    Image: class { set src(value) { if (value) queueMicrotask(() => this.onload?.()); } },
    location: { origin: 'https://profiles.wapuu.news', search },
    addEventListener() {}, fetch: fetcher,
    Option: function (text, value) { const option = env.document.createElement('option'); option.value = value; option.textContent = text; return option; },
  });
  // Exercise the complete production script; expose private functions only in this VM.
  vm.runInContext(app.replace(/\}\)\(\);\s*$/, 'globalThis.editorTest = { state, parameters, syncControls, hasVisibleContent, loadEvents, updateEventNote, validCatalog, renderCard, scheduleRender, status, clearCard };\n})();'), context);
  return { ...env, ...context.editorTest,
    // The selected avatar-frame shape, as the two-choice picker holds it.
    shape() { return ['circle', 'square'].filter(kind => env.$(`shape-${kind}`).checked).join('+'); },
    change(id, value) {
      // Choosing a shape checks its radio, as a browser does for the group.
      if (id === 'shape') { for (const kind of ['circle', 'square']) env.$(`shape-${kind}`).checked = kind === value; env.$(`shape-${value}`).dispatchEvent(new env.window.Event('change')); return; }
      const node = env.$(id); if (node.type === 'checkbox') node.checked = value; else node.value = value; node.dispatchEvent(new env.window.Event('change'));
    } };
}
function appearance({ saved = null, blockedRead = false, blockedWrite = false, loading = false, dark = false } = {}) {
  const env = dom(), writes = [], reads = [], listeners = {};
  const media = { matches: dark, addEventListener(type, listener) { listeners.media = listener; } };
  Object.defineProperty(env.document, 'readyState', { value: loading ? 'loading' : 'complete' });
  vm.runInNewContext(theme, {
    document: env.document,
    matchMedia(query) { assert.equal(query, '(prefers-color-scheme: dark)'); return media; },
    localStorage: {
      getItem(key) { reads.push(key); if (blockedRead) throw new Error('Storage blocked'); return saved; },
      setItem(key, value) { if (blockedWrite) throw new Error('Storage blocked'); writes.push([key, value]); },
    },
    addEventListener(type, listener) { listeners[type] = listener; },
  });
  return { ...env, writes, reads, listeners,
    click() { env.$('site-theme').dispatchEvent(new env.window.Event('click')); },
    os(value) { media.matches = value; listeners.media?.({ matches: value }); },
  };
}
function assertThemeAction(e, target) {
  const button = e.$('site-theme');
  assert.equal(button.getAttribute('aria-label'), `Switch to ${target} site appearance`);
  assert.equal(button.title, `Switch to ${target} site appearance`);
  assert.equal(button.dataset.targetTheme, target);
  assert.equal(button.querySelectorAll('svg').length, 2);
  for (const icon of button.querySelectorAll('svg')) {
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
  }
  assert.match(css, /#site-theme svg\{display:none/);
  assert.ok(css.includes('#site-theme[data-target-theme="light"] .theme-sun,#site-theme[data-target-theme="dark"] .theme-moon{display:block}'));
}

const modernIds = ['avatar', 'name', 'handle', 'jobTitle', 'organization', 'location', 'joined', 'teams', 'badges', 'badgeNames', 'link', 'social'];
test('Landscape and Vertical expose identical modern choices and parameter defaults', () => {
  for (const layout of ['profile', 'square']) {
    const e = editor(`?layout=${layout}`);
    for (const id of modernIds) {
      assert.equal(e.$(id).disabled, false, `${layout}/${id}`);
      assert.equal(Boolean(e.$(id).closest('[hidden]')), false, `${layout}/${id} visible`);
      assert.equal(e.parameters('fixture').get(id), 'true');
    }
    e.state.profile = { userName: 'fixture', name: 'Fixture', badges: [], teams: ['Core'] };
    e.state.omitTeams.add('Core');
    e.syncControls();
    assert.equal(e.$('individual-details').hidden, false);
    assert.equal(e.parameters('fixture').get('omitTeams'), 'Core');
  }
});

test('badge names are peers, disable with badges, and retain the preference', () => {
  const e = editor('?layout=profile&badgeNames=true');
  assert.ok(!e.$('badgeNames').closest('.nested-option'));
  e.change('badges', false);
  assert.equal(e.$('badgeNames').disabled, true);
  assert.equal(e.$('badgeNames').checked, true);
  e.change('badges', true);
  assert.equal(e.$('badgeNames').disabled, false);
  assert.equal(e.parameters('fixture').get('badgeNames'), 'true');
});

test('modern layouts keep deliberate selections and all choices default on at first visit', () => {
  const e = editor();
  e.change('name', false); e.change('badgeNames', false); e.change('social', false);
  e.change('layout', 'square');
  assert.equal(e.$('name').checked, true);
  assert.equal(e.$('badgeNames').checked, true);
  assert.equal(e.$('social').checked, true);
  e.change('jobTitle', false); e.change('social', false);
  e.change('layout', 'profile');
  assert.equal(e.$('name').checked, false);
  assert.equal(e.$('jobTitle').checked, true);
  assert.equal(e.$('badgeNames').checked, false);
  assert.equal(e.$('social').checked, false);
  e.change('layout', 'square');
  assert.equal(e.$('jobTitle').checked, false);
  assert.equal(e.$('badgeNames').checked, true);
  assert.equal(e.$('social').checked, false);
});

test('classic and WordCamp retain their own controls without modern-only options', async () => {
  for (const layout of ['classic', 'avatar', 'announcement']) {
    const e = editor(`?layout=${layout}`);
    if (layout !== 'classic') await e.loadEvents();
    for (const id of ['social', 'badgeNames']) {
      assert.equal(e.$(id).disabled, true);
      assert.ok(e.$(id).closest('[hidden]'));
      assert.equal(e.parameters('fixture').has(id), false);
    }
    assert.equal(e.$('avatar').disabled || false, layout !== 'classic');
    assert.equal(e.$('display-settings').hidden || false, layout === 'avatar');
    assert.equal(e.$('badges').disabled, layout !== 'classic');
    assert.equal(e.$('name').disabled, true);
    assert.equal(e.$('handle').disabled, layout !== 'announcement');
    assert.equal(e.$('event-settings').hidden, layout === 'classic');
    for (const id of layout === 'classic' ? ['avatar', 'badges', 'link'] : layout === 'avatar' ? ['avatar'] : ['avatar', 'name', 'handle']) {
      assert.equal(e.$(id).checked, true, `${layout}/${id} fresh`);
    }
    // Event dates and location are part of the social card, not a choice or a parameter.
    assert.equal(e.$('eventDetails'), null);
    assert.equal(e.parameters('fixture').has('eventDetails'), false, layout);
  }
});

test('WordCamp avatar frames always include the profile photo and offer no content choices', async () => {
  for (const search of ['?layout=avatar', '?layout=avatar&avatar=false']) {
    const e = editor(search);
    await e.loadEvents();
    assert.equal(e.state.restoreInvalid, search.includes('avatar=false'), search);
    assert.equal(e.$('avatar').checked, true, search);
    assert.equal(e.$('avatar').disabled, true, search);
    assert.equal(e.$('display-settings').hidden, true, search);
    assert.equal(e.parameters('fixture').get('avatar'), 'true', search);
    e.change('layout', 'profile');
    assert.equal(e.$('display-settings').hidden, false);
    assert.equal(e.$('avatar').disabled, false);
    e.change('avatar', false);
    e.change('layout', 'avatar');
    assert.equal(e.$('avatar').checked, true, 'another format cannot switch the photo off');
    assert.equal(e.parameters('fixture').get('avatar'), 'true');
  }
});

test('WordCamp social cards require avatar and name while keeping username optional', async () => {
  const e = editor('?layout=announcement&avatar=false&name=false&handle=false');
  await e.loadEvents();
  assert.equal(e.state.restoreInvalid, true);
  for (const id of ['avatar', 'name']) {
    assert.equal(e.$(id).checked, true, id);
    assert.equal(e.$(id).disabled, true, id);
    assert.equal(e.parameters('fixture').get(id), 'true', id);
  }
  assert.equal(e.$('handle').checked, false);
  assert.equal(e.$('handle').disabled, false);
  assert.equal(e.parameters('fixture').get('handle'), 'false');
});

test('choices that cannot be changed are not shown', async () => {
  const shown = e => [...e.$('display-settings').querySelectorAll('input[type="checkbox"]')].filter(input => !input.closest('[hidden]')).map(input => input.id);
  const social = editor('?layout=announcement');
  await social.loadEvents();
  // The social card always has the photo, name, event dates and location.
  assert.deepEqual(shown(social), ['handle']);
  assert.equal(social.$('public-fields-help').hidden, true);
  assert.equal(social.document.body.textContent.includes('(required)'), false);
  assert.equal(/are required/i.test(social.$('display-settings').textContent), false);
  // The avatar frame has no content choices at all.
  social.change('layout', 'avatar');
  assert.equal(social.$('display-settings').hidden, true);
  // Profile formats keep every choice, including the photo and name.
  for (const layout of ['profile', 'square']) {
    social.change('layout', layout);
    assert.deepEqual(shown(social), ['avatar', 'name', 'handle', 'jobTitle', 'organization', 'location', 'joined', 'teams', 'badges', 'badgeNames', 'link', 'social'], layout);
    assert.equal(social.$('public-fields-help').hidden, false, layout);
  }
  social.change('layout', 'classic');
  assert.deepEqual(shown(social), ['avatar', 'badges', 'link']);
});

test('links made while event details were a choice restore unless they turned them off', async () => {
  for (const [search, invalid] of [
    ['?layout=announcement&eventDetails=true', false], ['?layout=announcement&eventDetails=false', true],
    ['?layout=avatar&eventDetails=true', false], ['?layout=avatar&eventDetails=false', false],
    ['?layout=announcement&eventDetails=yes', true], ['?layout=announcement&eventDetails=true&eventDetails=true', true],
    ['?layout=profile&eventDetails=true', true],
  ]) {
    const e = editor(search);
    assert.equal(e.state.restoreInvalid, invalid, search);
    assert.equal(e.$('status').dataset.kind === 'error', invalid, search);
  }
});

test('malformed and duplicate new toggle parameters still fail validation', () => {
  for (const query of ['social=TRUE', 'social=yes', 'badgeNames=1', 'badgeNames=true&badgeNames=false', 'social=true&social=true']) {
    const e = editor(`?layout=square&${query}`);
    assert.equal(e.state.restoreInvalid, true, query);
    assert.match(e.$('status').textContent, /invalid/);
  }
  const restored = editor('?layout=square&social=true&badgeNames=true');
  assert.equal(restored.state.restoreInvalid, false);
  assert.equal(restored.$('social').checked, true);
  assert.equal(restored.$('badgeNames').checked, true);
  const classic = editor('?username=fixture');
  assert.equal(classic.$('layout').value, 'classic');
});

test('all-hidden modern content is detected while public links alone remain valid', () => {
  for (const layout of ['profile', 'square']) {
    const e = editor(`?layout=${layout}`);
    e.state.profile = { userName: 'fixture', name: 'Fixture', badges: [], teams: [] };
    for (const id of modernIds) e.$(id).checked = false;
    assert.equal(e.hasVisibleContent(), false);
    e.$('social').checked = true;
    assert.equal(e.hasVisibleContent(), false);
    for (const fields of [{ website: { url: 'https://example.test/' } }, { github: { url: 'https://github.com/fixture' } }, { social: [{ url: 'https://example.test/social' }] }]) {
      e.state.profile = { userName: 'fixture', badges: [], ...fields };
      assert.equal(e.hasVisibleContent(), true);
    }
  }
});

test('loaded events show official links without generated catalog prose or losing metadata', async () => {
  const e = editor('?layout=announcement');
  await e.loadEvents();
  assert.equal(e.validCatalog(e.state.catalog), true);
  for (const event of EVENTS) {
    e.change('event', event.id);
    assert.equal(e.$('event-note').textContent, '');
    assert.equal(e.$('event-note').hidden, true);
    assert.equal(e.$('event-source').href, event.url);
    assert.equal(e.$('event-source').hidden, false);
    assert.equal(e.state.catalog.events.find(item => item.id === event.id).note, event.note);
    assert.equal(e.state.catalog.events.find(item => item.id === event.id).dateLabel, event.dateLabel);
  }
  assert.equal(e.$('role-help').textContent, 'Your participation role is self-reported. These personal graphics are not official event badges or proof of registration.');
  assert.ok(e.$('role-help').closest('.about'));
  assert.equal(e.$('role-help').closest('footer'), null);
});

test('event loading, failure and retry remain available after prose removal', async () => {
  let resolve, calls = 0;
  const e = editor('?layout=avatar', () => { calls++; return new Promise(done => { resolve = done; }); });
  assert.equal(e.$('event-note').hidden, false);
  assert.match(e.$('event-note').textContent, /Loading/);
  resolve({ ok: false });
  assert.equal(await e.loadEvents(), false);
  assert.equal(e.$('retry-events').hidden, false);
  assert.equal(e.$('event-note').hidden, false);
  assert.match(e.$('event-note').textContent, /unavailable/);
  const retry = e.loadEvents();
  assert.equal(e.$('retry-events').hidden, true);
  assert.match(e.$('event-note').textContent, /Loading/);
  resolve({ ok: true, json: async () => ({ events: EVENTS, roles: ROLES }) });
  assert.equal(await retry, true);
  e.change('event', EVENTS[0].id);
  assert.equal(e.$('event-note').hidden, true);
  assert.equal(calls, 2);
});

test('site appearance is one accessible early-enhanced button independent of card colors', () => {
  const e = appearance({ saved: 'dark', loading: true });
  assert.equal(e.document.documentElement.dataset.theme, 'dark');
  assert.equal(e.$('site-theme-control').hidden, true);
  e.document.dispatchEvent(new e.window.Event('DOMContentLoaded'));
  assert.equal(e.$('site-theme-control').hidden, false);
  assert.equal(e.$('site-theme').tagName, 'BUTTON');
  assert.equal(e.$('site-theme').getAttribute('type'), 'button');
  assert.equal(e.$('site-theme-control').querySelectorAll('button,select').length, 1);
  assertThemeAction(e, 'light');
  const cardColors = [...e.document.querySelectorAll('input[type="color"]')].map(input => input.value);
  e.click();
  assert.equal(e.document.documentElement.dataset.theme, 'system');
  assertThemeAction(e, 'dark');
  e.click();
  assert.equal(e.document.documentElement.dataset.theme, 'dark');
  assertThemeAction(e, 'light');
  assert.deepEqual(e.reads, ['wp-profile-cards-theme']);
  assert.deepEqual(e.writes, [['wp-profile-cards-theme', 'system'], ['wp-profile-cards-theme', 'dark']]);
  assert.deepEqual([...e.document.querySelectorAll('input[type="color"]')].map(input => input.value), cardColors);
  assert.ok(html.indexOf('src="/theme.js"') < html.indexOf('href="/styles.css"'));
  assert.doesNotMatch(theme, /fetch\(|profile-form|background-file|preset-dark|scheduleRender/);
  assert.doesNotMatch(app, /localStorage|sessionStorage/);
});

test('effective theme toggles back to OS following on either system scheme', () => {
  for (const dark of [false, true]) {
    for (const saved of [null, 'system', 'invalid']) {
      const e = appearance({ dark, saved });
      assert.equal(e.document.documentElement.dataset.theme, 'system');
      assertThemeAction(e, dark ? 'light' : 'dark');
      e.click();
      assert.equal(e.document.documentElement.dataset.theme, dark ? 'light' : 'dark');
      e.click();
      assert.equal(e.document.documentElement.dataset.theme, 'system');
      e.os(!dark);
      assertThemeAction(e, dark ? 'dark' : 'light');
      assert.equal(e.writes.at(-1)[1], 'system');
    }
    for (const saved of ['light', 'dark']) {
      const e = appearance({ dark, saved });
      assert.equal(e.document.documentElement.dataset.theme, saved);
      assertThemeAction(e, saved === 'dark' ? 'light' : 'dark');
      e.os(!dark);
      assertThemeAction(e, saved === 'dark' ? 'light' : 'dark');
    }
  }
});

test('appearance tolerates denied storage, invalid saved values and cross-tab changes', () => {
  for (const settings of [{ blockedRead: true, blockedWrite: true }, { saved: 'unexpected' }, { saved: '{"profile":"private"}' }]) {
    const e = appearance(settings);
    assert.equal(e.document.documentElement.dataset.theme, 'system');
    e.click();
    assert.equal(e.document.documentElement.dataset.theme, 'dark');
    assertThemeAction(e, 'light');
    e.listeners.storage({ key: 'wp-profile-cards-theme', newValue: 'light' });
    assertThemeAction(e, 'dark');
    e.listeners.storage({ key: 'another-key', newValue: 'dark' });
    assertThemeAction(e, 'dark');
    e.os(true);
    assertThemeAction(e, 'dark');
    for (const newValue of ['system', 'unexpected', null]) {
      e.listeners.storage({ key: 'wp-profile-cards-theme', newValue });
      assert.equal(e.document.documentElement.dataset.theme, 'system');
      assertThemeAction(e, 'light');
    }
    e.listeners.storage({ key: null, newValue: null });
    assert.equal(e.document.documentElement.dataset.theme, 'system');
    assertThemeAction(e, 'light');
    assert.ok(e.writes.every(([key, value]) => key === 'wp-profile-cards-theme' && ['system', 'light', 'dark'].includes(value)));
  }
});

test('explicit URL false survives returning to a layout while new layouts default checked', async () => {
  for (const initial of ['profile', 'square', 'classic', 'avatar', 'announcement']) {
    const applicable = initial === 'avatar' ? [] : initial === 'announcement' ? ['handle'] : initial === 'classic' ? ['avatar', 'badges', 'link'] : modernIds;
    const required = initial === 'avatar' ? ['avatar'] : initial === 'announcement' ? ['avatar', 'name'] : [];
    const e = editor(`?layout=${initial}&${applicable.map(id => `${id}=false`).join('&')}`);
    if (['avatar', 'announcement'].includes(initial)) await e.loadEvents();
    for (const id of applicable) assert.equal(e.$(id).checked, false);
    for (const id of required) assert.equal(e.$(id).checked, true, `${initial}/${id} required`);
    const next = initial === 'profile' ? 'square' : 'profile';
    e.change('layout', next);
    for (const id of modernIds) assert.equal(e.$(id).checked, true, `${initial} to ${next}/${id}`);
    e.change('layout', initial);
    for (const id of applicable) assert.equal(e.$(id).checked, false, `${initial}/${id}`);
    for (const id of required) assert.equal(e.$(id).checked, true, `${initial}/${id} required on return`);
    const fresh = editor('?layout=profile');
    fresh.change('layout', initial);
    if (['avatar', 'announcement'].includes(initial)) await fresh.loadEvents();
    for (const id of applicable) assert.equal(fresh.$(id).checked, true, `${initial}/${id} first switch`);
  }
});

test('render completion puts actual local fetch time inline before links and preserves avatar warning', async () => {
  for (const layout of ['profile', 'square', 'classic', 'avatar', 'announcement']) {
    for (const avatarStatus of ['embedded', 'initials']) {
      const e = editor(`?layout=${layout}`);
      if (['avatar', 'announcement'].includes(layout)) { await e.loadEvents(); e.$('event').value = EVENTS[0].id; e.$('role').value = ROLES[0].id; }
      const fetchedAt = avatarStatus === 'initials' ? '2025-03-02T03:04:05.000Z' : '2024-08-07T06:05:04.000Z';
      const profile = { userName: 'fixture', name: 'Fixture', badges: [], teams: [], fetchedAt };
      e.state.profile = profile;
      e.state.username = 'fixture';
      e.state.rendererPromise = Promise.resolve(() => '<svg xmlns="http://www.w3.org/2000/svg"/>');
      // Avatar frames are PNG artwork, loaded through the frame loader.
      e.state.frameLoader = Promise.resolve({ loadEventFrame: async () => 'data:image/png;base64,AAAA' });
      e.state.previewInputs = { profile, fingerprint: JSON.stringify(profile), expires: performance.now() + 10000, avatars: new Map([320, 1024].map(size => [size, { data: null, status: avatarStatus }])) };
      await e.renderCard(e.state.renderVersion);
      assert.equal(e.state.ready, true, e.$('status').textContent);
      const expected = `Hot off the press. Your image is ready to download. Profile fetched ${new Date(fetchedAt).toLocaleString()}.`;
      assert.ok(e.$('status').textContent.startsWith(expected), e.$('status').textContent);
      assert.equal(e.$('status-lead').textContent, 'Hot off the press. ');
      assert.equal(e.$('status-lead').tagName, 'STRONG');
      assert.equal(e.$('status-message').textContent, 'Your image is ready to download.');
      assert.equal(e.$('cache-note').parentElement.id, 'status');
      assert.equal(e.$('cache-note').tagName, 'SPAN');
      // The download comes straight after the status, then the links.
      assert.equal(e.$('status').nextElementSibling, e.$('exports'));
      assert.equal(e.$('exports').nextElementSibling, e.$('profile-meta'));
      for (const [key, value] of [['role', 'status'], ['aria-live', 'polite'], ['aria-atomic', 'true']]) assert.equal(e.$('status').getAttribute(key), value);
      if (avatarStatus === 'initials') assert.match(e.$('status').textContent, /The avatar could not be loaded, so initials are shown\./);
      else assert.doesNotMatch(e.$('status').textContent, /initials/);
      e.status('Updating your preview…');
      assert.equal(e.$('cache-note').textContent, '');
      assert.equal(e.$('status').textContent, 'Updating your preview…');
      e.$('cache-note').textContent = 'stale timestamp';
      e.status('Request failed.', 'error');
      assert.equal(e.$('cache-note').textContent, '');
      assert.equal(e.$('status').textContent, 'Request failed.');
      e.$('cache-note').textContent = 'stale timestamp';
      e.state.rendererPromise = Promise.reject(new Error('Render failed.'));
      await e.renderCard(e.state.renderVersion);
      assert.equal(e.$('status').textContent, 'Render failed.');
      assert.equal(e.$('cache-note').textContent, '');
      assert.equal(e.state.ready, false);
      e.clearCard();
    }
  }
});

test('OS appearance has a no-JavaScript CSS fallback and explicit overrides', () => {
  assert.match(css, /@media\(prefers-color-scheme:dark\)/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\):not\(\[data-theme="dark"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  for (const value of ['--paper:#191e23', '--panel:#23282d', '--ink:#f6f7f7', '--muted:#c3c4c7', '--line:#50575e', '--focus:#72aee6']) assert.ok(css.includes(value));
  const { document } = dom();
  assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://profiles.wapuu.news/');
  assert.equal(document.querySelector('meta[property="og:url"]').getAttribute('content'), 'https://profiles.wapuu.news/');
  assert.equal(document.getElementById('site-theme-control').hidden, true, 'no inert control without JS');
});

// A catalog whose first edition has artwork for only two roles, and whose other
// editions have none, exercises the limits. That first edition (WordCamp Asia) also
// derives its social card from the artwork; the others draw theirs.
const partialCatalog = () => ({ events: [{ ...EVENTS[0], frameRoles: ['attendee', 'speaker'] }, ...EVENTS.slice(1).map(({ frameRoles, ...event }) => event)], roles: ROLES });
const partialFetcher = async () => ({ ok: true, json: async () => partialCatalog() });
// The frame loader stands in before the catalog arrives, as the builder starts
// loading artwork as soon as an edition is selected.
const idleLoader = () => Promise.resolve({ loadEventFrame: async () => 'data:image/png;base64,AAAA' });
const frameEditor = async (search = '?layout=avatar', loader = idleLoader(), fetcher = partialFetcher) => {
  const e = editor(search, fetcher);
  e.state.frameLoader = loader;
  await e.loadEvents();
  return e;
};
// Let queued frame loads and their follow-ups settle.
const settle = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };
const pick = (e, event, role) => { e.$('event').value = event; e.$('role').value = role; e.syncControls(); };

test('avatar frames offer a shape and only roles with artwork, with no color or background controls', async () => {
  const e = await frameEditor();
  const roles = () => Object.fromEntries([...e.$('role').options].map(option => [option.value, !option.disabled && !option.hidden]));
  pick(e, EVENTS[0].id, 'sponsor');
  assert.equal(e.$('role').value, 'attendee', 'a role without artwork moves to the first role with artwork');
  assert.deepEqual(roles(), Object.fromEntries(ROLES.map(role => [role.id, ['attendee', 'speaker'].includes(role.id)])));
  assert.equal(e.$('customize-colors').hidden, true);
  assert.equal(e.$('frame-note'), null);
  assert.equal(e.$('shape-setting').hidden, false);
  assert.equal(e.$('shape-setting').disabled, false);
  assert.equal(e.shape(), 'circle', 'circle is the default shape');
  const params = e.parameters('fixture');
  assert.deepEqual([...params.keys()].sort(), ['avatar', 'event', 'layout', 'role', 'shape', 'username']);
  assert.equal(params.get('role'), 'attendee');
  assert.equal(params.get('shape'), 'circle');
  e.change('shape', 'square');
  assert.equal(e.parameters('fixture').get('shape'), 'square');
  // A social card drawn by the project keeps every role and its controls, and has no shape.
  e.change('layout', 'announcement'); pick(e, EVENTS[1].id, 'sponsor');
  assert.equal(e.$('role').value, 'sponsor');
  assert.ok(Object.values(roles()).every(Boolean));
  assert.equal(e.$('customize-colors').hidden, false);
  assert.equal(e.$('shape-setting').hidden, true);
  assert.equal(e.$('shape-setting').disabled, true);
  assert.ok(e.parameters('fixture').has('foreground'));
  assert.equal(e.parameters('fixture').has('shape'), false);
  // A social card derived from the frame artwork follows the artwork: its roles, no colors.
  assert.equal(EVENTS[0].frameCard, true);
  pick(e, EVENTS[0].id, 'sponsor');
  assert.equal(e.$('role').value, 'attendee');
  assert.deepEqual(roles(), Object.fromEntries(ROLES.map(role => [role.id, ['attendee', 'speaker'].includes(role.id)])));
  assert.equal(e.$('customize-colors').hidden, true);
  assert.equal(e.$('shape-setting').hidden, true);
  assert.deepEqual([...e.parameters('fixture').keys()].sort(), ['avatar', 'event', 'handle', 'layout', 'name', 'role', 'username']);
  assert.equal(e.$('display-settings').hidden || false, false, 'the username stays a choice');
  // The shape choice survives a visit to another format.
  e.change('layout', 'avatar'); pick(e, EVENTS[0].id, 'speaker');
  assert.equal(e.$('customize-colors').hidden, true);
  assert.equal(e.parameters('fixture').get('shape'), 'square');
  // Leaving WordCamp formats never leaves the color controls hidden.
  e.change('layout', 'profile');
  assert.equal(e.$('customize-colors').hidden, false);
  assert.equal(e.$('shape-setting').hidden, true);
});

test('shape is a side-by-side picker of a shaded circle and square', () => {
  const { document: page } = parseHTML(html);
  const picker = page.querySelector('#event-controls .event-selects > fieldset#shape-setting.shape-picker');
  assert.equal(picker.querySelector('legend').textContent, 'Shape');
  assert.equal(page.querySelector('select#shape'), null, 'no dropdown');
  const options = [...picker.querySelectorAll('.shape-options > label.shape-option')];
  assert.deepEqual(options.map(option => [option.querySelector('input').id, option.querySelector('input').type, option.querySelector('input').name, option.querySelector('input').value, option.querySelector('input').hasAttribute('checked')]),
    [['shape-circle', 'radio', 'shape', 'circle', true], ['shape-square', 'radio', 'shape', 'square', false]]);
  // Each choice is drawn as its shape; the name is kept for assistive technology.
  assert.deepEqual(options.map(option => [option.querySelector('.shape-swatch').className, option.querySelector('.shape-swatch').getAttribute('aria-hidden'), option.querySelector('.sr-only').textContent]),
    [['shape-swatch shape-swatch-circle', 'true', 'Circle'], ['shape-swatch shape-swatch-square', 'true', 'Square']]);
  assert.match(css, /\.shape-options\{display:flex;/);
  // Each choice is a square tile, larger than a text field is tall.
  const tile = css.match(/\.shape-option\{([^}]*)\}/)[1];
  const [width, height] = ['width', 'height'].map(key => Number(tile.match(new RegExp(`(?:^|;)${key}:(\\d+)px`))[1]));
  assert.equal(width, height); assert.ok(width >= 88);
  assert.match(tile, /flex:none/);
  assert.match(css, /\.shape-swatch\{[^}]*background:var\(--muted\)/);
  assert.match(css, /\.shape-swatch-circle\{border-radius:50%\}/);
  assert.match(css, /\.shape-option:has\(input:checked\)\{[^}]*border-color:var\(--accent\)/);
  assert.match(css, /\.shape-option:has\(input:focus-visible\)\{outline:/);
});

test('every format downloads as PNG only, and avatar frames never fall back to the card route', async () => {
  const requests = [];
  const e = editor('?layout=avatar', async url => { requests.push(String(url)); return { ok: true, json: async () => ({ events: EVENTS, roles: ROLES }) }; });
  await e.loadEvents();
  assert.equal(e.$('download-svg'), null);
  assert.deepEqual([...e.$('exports').querySelectorAll('button')].map(button => button.textContent), ['Download PNG']);
  assert.equal(/download(SVG|-svg)|Download SVG|download SVG/.test(app + html), false);
  for (const layout of ['announcement', 'profile', 'square', 'classic', 'avatar']) { e.change('layout', layout); assert.equal(e.$('download-png').hidden || false, false, layout); }
  // The server has no frame artwork: without the browser renderer the failure is explicit.
  const profile = { userName: 'fixture', name: 'Fixture', badges: [], teams: [], fetchedAt: '2024-08-07T06:05:04.000Z' };
  e.state.profile = profile; e.state.username = 'fixture';
  e.state.previewInputs = { profile, fingerprint: JSON.stringify(profile), avatars: new Map([320, 1024].map(size => [size, { data: null, status: 'initials' }])) };
  e.state.rendererPromise = Promise.resolve(null);
  requests.length = 0;
  await e.renderCard(e.state.renderVersion);
  assert.equal(e.state.ready, false);
  assert.match(e.$('status').textContent, /^Avatar frames are made in your browser/);
  assert.equal(e.$('exports').disabled, true);
  assert.deepEqual(requests, [], 'no request to /card or anything else');
});

test('an edition that is not in the catalog is not offered, and a shared link naming it is rejected', async () => {
  assert.deepEqual(EVENTS.map(event => event.id), ['asia-2027', 'europe-2027', 'india-2027']);
  for (const layout of ['announcement', 'avatar']) {
    const e = editor(`?layout=${layout}&event=asia-2026&role=attendee`);
    await e.loadEvents();
    assert.deepEqual([...e.$('event').options].map(option => option.textContent), ['WordCamp Asia', 'WordCamp Europe', 'WordCamp India'], layout);
    assert.equal(e.state.restoreInvalid, true, layout);
    assert.equal(e.$('status').dataset.kind, 'error', layout);
  }
});

test('shared links restore a valid shape and reject it anywhere else', async () => {
  const square = await frameEditor(`?layout=avatar&event=${EVENTS[0].id}&role=speaker&shape=square`);
  assert.equal(square.state.restoreInvalid, false);
  assert.equal(square.parameters('fixture').get('shape'), 'square');
  for (const search of ['?layout=avatar&shape=oval', '?layout=avatar&shape=square&shape=circle', '?layout=announcement&shape=square', '?layout=profile&shape=circle']) {
    const e = editor(search);
    assert.equal(e.$('status').dataset.kind, 'error', search);
    assert.equal(e.shape(), 'circle', search);
  }
});

test('selecting an avatar-frame edition preloads every role, the selected one first, and only for avatar frames', async () => {
  const loads = []; const requests = [];
  const loader = Promise.resolve({ loadEventFrame: async (event, role, fetcher) => {
    loads.push([event, role, fetcher ? 'background' : 'selected']);
    if (fetcher) await fetcher(`/frames/${event}-${role}.png`, { credentials: 'same-origin' });
    return `data:image/png;base64,${role}`;
  } });
  const fetcher = async (url, init) => { requests.push([String(url), init]); return { ok: true, json: async () => ({ events: EVENTS, roles: ROLES }) }; };
  const e = editor('?layout=avatar', fetcher);
  e.state.frameLoader = loader;
  await e.loadEvents();
  const [first, second] = EVENTS; const others = ROLES.map(role => role.id).filter(id => id !== 'volunteer');
  pick(e, first.id, 'volunteer'); await settle();
  // No profile is needed: the artwork is on its way while the username is typed.
  assert.equal(e.state.profile, null);
  assert.deepEqual(loads, [[first.id, 'volunteer', 'selected'], ...others.map(role => [first.id, role, 'background'])]);
  // Background loads ask the browser for low priority; the selected frame does not.
  assert.deepEqual(requests.filter(([url]) => url.startsWith('/frames/')).map(([url, init]) => [url, init.priority, init.credentials]), others.map(role => [`/frames/${first.id}-${role}.png`, 'low', 'same-origin']));
  // Every "I'm…" choice for that edition is now ready: switching loads nothing more.
  for (const role of ROLES) pick(e, first.id, role.id);
  e.change('shape', 'square'); await settle();
  assert.equal(loads.length, ROLES.length);
  // Another edition is fetched when it is selected, again with its selected role first.
  pick(e, second.id, 'sponsor'); await settle();
  assert.deepEqual(loads.slice(ROLES.length).map(([event, role, kind]) => `${event}/${role}/${kind}`), [`${second.id}/sponsor/selected`, ...ROLES.map(role => role.id).filter(id => id !== 'sponsor').map(role => `${second.id}/${role}/background`)]);
  // A drawn social card needs no frame artwork.
  const card = editor('?layout=announcement', fetcher);
  let drawnLoads = 0;
  card.state.frameLoader = Promise.resolve({ loadEventFrame: async () => { drawnLoads++; throw new Error('must not load'); } });
  await card.loadEvents(); pick(card, second.id, 'speaker'); await settle();
  assert.equal(drawnLoads, 0); assert.equal(card.state.frames.size, 0);
});

test('a busy preview shows an animated indicator that reduced motion stills', () => {
  const { document: page } = parseHTML(html);
  const symbol = page.querySelector('#preview-stage > #empty-state > .empty-symbol');
  assert.equal(symbol.getAttribute('aria-hidden'), 'true', 'the indicator is decorative: the status line announces progress');
  const rule = css.match(/\.preview-stage\[aria-busy="true"\] \.empty-symbol\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /animation:preview-spin [\d.]+s linear infinite/);
  assert.match(rule, /border-radius:50%/);
  assert.match(rule, /font-size:0/, 'the idle symbol is hidden while the ring spins');
  assert.match(css, /@keyframes preview-spin\{to\{transform:rotate\(360deg\)\}\}/);
  assert.match(css, /@media ?\(prefers-reduced-motion:reduce\)\{[^}]*animation:none!important/);
  // Every wait in the preview marks the stage busy, so the indicator covers them all.
  for (const title of ['Loading the Matt demo…', 'Finding your profile…', 'Making your card…']) {
    const at = app.indexOf(`placeholder('${title}'`);
    assert.ok(at > 0, title);
    assert.match(app.slice(at - 80, at), /setAttribute\('aria-busy', 'true'\)/, title);
  }
});

test('a frame that fails to preload stays quiet and is tried again when chosen', async () => {
  let attempts = 0;
  const loader = Promise.resolve({ loadEventFrame: async (event, role) => { if (role === 'speaker' && ++attempts === 1) throw new Error('offline'); return `data:image/png;base64,${role}`; } });
  const e = await frameEditor('?layout=avatar', loader);
  pick(e, EVENTS[0].id, 'attendee'); await settle();
  assert.equal(attempts, 1, 'speaker was preloaded once and failed');
  // Later control changes do not keep fetching a frame that failed in the background.
  for (const shape of ['square', 'circle']) e.change('shape', shape);
  pick(e, EVENTS[0].id, 'attendee'); await settle();
  assert.equal(attempts, 1);
  assert.notEqual(e.$('status').dataset.kind, 'error', 'a background failure is not reported');
  assert.deepEqual([...e.state.frames.keys()], [`${EVENTS[0].id}/attendee/false`], 'the failure is not kept');
  const profile = { userName: 'fixture', name: 'Fixture', badges: [], teams: [], fetchedAt: '2024-08-07T06:05:04.000Z' };
  e.state.profile = profile; e.state.username = 'fixture';
  e.state.previewInputs = { profile, fingerprint: JSON.stringify(profile), avatars: new Map([320, 1024].map(size => [size, { data: null, status: 'initials' }])) };
  const received = [];
  e.state.rendererPromise = Promise.resolve((...args) => { received.push(args); return '<svg xmlns="http://www.w3.org/2000/svg"/>'; });
  pick(e, EVENTS[0].id, 'speaker');
  await e.renderCard(e.state.renderVersion);
  assert.equal(attempts, 2);
  assert.equal(e.state.ready, true, e.$('status').textContent);
  assert.equal(received.at(-1)[3], 'data:image/png;base64,speaker');
});

test('a social card made from frame artwork loads the frame and its band, takes no colors or background and never falls back', async () => {
  const received = []; const loads = []; const requests = [];
  const loader = Promise.resolve({ loadEventFrame: async (event, role, fetcher, band) => { loads.push([event, role, band ? 'band' : 'frame', fetcher ? 'background' : 'selected']); return `data:image/png;base64,${role}${band ? 'Band' : ''}`; } });
  const e = await frameEditor('?layout=announcement', loader, async url => { requests.push(String(url)); return { ok: true, json: async () => partialCatalog() }; });
  pick(e, EVENTS[0].id, 'speaker'); await settle();
  // The edition's artwork is preloaded as for an avatar frame: selected role first, each frame with its band.
  assert.deepEqual(loads, [[EVENTS[0].id, 'speaker', 'frame', 'selected'], [EVENTS[0].id, 'speaker', 'band', 'selected'], [EVENTS[0].id, 'attendee', 'frame', 'background'], [EVENTS[0].id, 'attendee', 'band', 'background']]);
  const profile = { userName: 'fixture', name: 'Fixture', badges: [], teams: [], fetchedAt: '2024-08-07T06:05:04.000Z' };
  e.state.profile = profile; e.state.username = 'fixture';
  e.state.previewInputs = { profile, fingerprint: JSON.stringify(profile), avatars: new Map([320, 1024].map(size => [size, { data: null, status: 'initials' }])) };
  e.state.rendererPromise = Promise.resolve((...args) => { received.push(args); return '<svg xmlns="http://www.w3.org/2000/svg"/>'; });
  e.state.background = { dispose() {} };
  e.state.backgroundError = 'Could not use this background.';
  e.state.backgroundModule = { applyBackground() { throw new Error('must not composite behind frame artwork'); } };
  await e.renderCard(e.state.renderVersion);
  assert.equal(e.state.ready, true, e.$('status').textContent);
  assert.deepEqual(received[0].slice(3), ['data:image/png;base64,speaker', 'data:image/png;base64,speakerBand'], 'the renderer gets the frame, then its band');
  const sent = new URLSearchParams(received[0][1]);
  assert.deepEqual([...sent.keys()].sort(), ['avatar', 'event', 'handle', 'layout', 'name', 'role', 'username']);
  assert.match(e.$('card-preview').alt, /I'm speaking\. Participation announcement\./);
  assert.equal(loads.length, 4, 'nothing is fetched twice');
  // The avatar frame of the same edition reuses the frames and asks for no band.
  e.change('layout', 'avatar'); await settle();
  await e.renderCard(e.state.renderVersion);
  assert.deepEqual(received.at(-1).slice(3), ['data:image/png;base64,speaker']);
  assert.equal(loads.length, 4);
  e.change('layout', 'announcement'); await settle();
  // A drawn edition's card asks for no artwork and takes its colors and background again.
  pick(e, EVENTS[1].id, 'speaker'); e.state.backgroundError = ''; e.state.backgroundModule = { applyBackground: svg => svg };
  await e.renderCard(e.state.renderVersion);
  assert.equal(received.at(-1).length, 3);
  assert.ok(new URLSearchParams(received.at(-1)[1]).has('foreground'));
  // Without the browser renderer there is no server-rendered card to fall back to.
  pick(e, EVENTS[0].id, 'speaker');
  e.state.rendererPromise = Promise.resolve(null); requests.length = 0;
  await e.renderCard(e.state.renderVersion);
  assert.equal(e.state.ready, false);
  assert.match(e.$('status').textContent, /^This social card is made in your browser/);
  assert.deepEqual(requests, [], 'no request to /card or anything else');
});

test('frame artwork loads once per role, skips local backgrounds and fails explicitly', async () => {
  const received = []; const loads = [];
  const e = await frameEditor('?layout=avatar', Promise.resolve({ loadEventFrame: async (event, role) => { loads.push([event, role]); return `data:image/png;base64,${role}`; } }));
  pick(e, EVENTS[0].id, 'speaker');
  const profile = { userName: 'fixture', name: 'Fixture', badges: [], teams: [], fetchedAt: '2024-08-07T06:05:04.000Z' };
  e.state.profile = profile; e.state.username = 'fixture';
  e.state.previewInputs = { profile, fingerprint: JSON.stringify(profile), avatars: new Map([320, 1024].map(size => [size, { data: null, status: 'initials' }])) };
  e.state.rendererPromise = Promise.resolve((...args) => { received.push(args); return '<svg xmlns="http://www.w3.org/2000/svg"/>'; });
  // A local background selected for another format must neither block nor alter this frame.
  e.state.background = { dispose() {} };
  e.state.backgroundError = 'Could not use this background.';
  e.state.backgroundModule = { applyBackground() { throw new Error('must not composite behind frame artwork'); } };
  e.scheduleRender();
  assert.notEqual(e.$('empty-title').textContent, 'Check your background image.');
  for (let pass = 0; pass < 2; pass++) { await e.renderCard(e.state.renderVersion); assert.equal(e.state.ready, true, e.$('status').textContent); }
  // The selected role's artwork, then the edition's other role in the background: each once.
  assert.deepEqual(loads, [[EVENTS[0].id, 'speaker'], [EVENTS[0].id, 'attendee']]);
  assert.deepEqual(received.map(args => args.slice(3)), [['data:image/png;base64,speaker'], ['data:image/png;base64,speaker']], 'an avatar frame takes no band');
  assert.equal(new URLSearchParams(received[0][1]).has('foreground'), false);
  assert.equal(new URLSearchParams(received[0][1]).get('shape'), 'circle');
  assert.match(e.$('card-preview').alt, /I'm speaking\. Round avatar frame\./);
  pick(e, EVENTS[0].id, 'attendee'); e.change('shape', 'square');
  await e.renderCard(e.state.renderVersion);
  assert.equal(loads.length, 2, 'the preloaded frame is used, not fetched again');
  assert.equal(received.at(-1)[3], 'data:image/png;base64,attendee');
  assert.equal(new URLSearchParams(received.at(-1)[1]).get('shape'), 'square', 'one artwork payload serves both shapes');
  assert.match(e.$('card-preview').alt, /Square avatar frame\./);
  // An edition without artwork asks for none: the renderer reports it, nothing is substituted.
  pick(e, EVENTS[1].id, 'attendee');
  await e.renderCard(e.state.renderVersion);
  assert.equal(loads.length, 2);
  assert.equal(received.at(-1).length, 3);
  // The local background returns for the formats that take one.
  e.change('layout', 'announcement');
  e.state.backgroundError = '';
  await e.renderCard(e.state.renderVersion);
  assert.equal(e.state.ready, false);
  assert.equal(e.$('status').textContent, 'must not composite behind frame artwork');
  // Missing or failed artwork never renders a substitute design.
  for (const loader of [Promise.reject(new Error('offline')), Promise.resolve({ loadEventFrame: async () => null }), Promise.resolve({})]) {
    loader.catch(() => {});
    const failing = await frameEditor('?layout=avatar', loader);
    pick(failing, EVENTS[0].id, 'attendee');
    failing.state.profile = profile; failing.state.username = 'fixture';
    failing.state.previewInputs = e.state.previewInputs;
    let rendered = 0;
    failing.state.rendererPromise = Promise.resolve(() => { rendered++; return '<svg xmlns="http://www.w3.org/2000/svg"/>'; });
    await failing.renderCard(failing.state.renderVersion);
    assert.equal(failing.state.ready, false);
    assert.equal(rendered, 0);
    assert.equal(failing.$('exports').disabled, true);
    assert.equal(failing.$('status').textContent, 'The artwork for this frame could not be loaded. Reload the page to try again.');
  }
});

test('restored links and catalogs fail closed on roles without frame artwork', async () => {
  const valid = await frameEditor(`?layout=avatar&event=${EVENTS[0].id}&role=speaker`);
  assert.equal(valid.state.restoreInvalid, false);
  assert.equal(valid.$('role').value, 'speaker');
  const invalid = await frameEditor(`?layout=avatar&event=${EVENTS[0].id}&role=sponsor`);
  assert.equal(invalid.state.restoreInvalid, true, 'never silently switch a shared link to another role');
  assert.equal(invalid.$('empty-title').textContent, 'Check your event settings.');
  assert.equal(invalid.$('status').dataset.kind, 'error');
  // A drawn social card has every role; one derived from the artwork has the artwork's.
  const card = await frameEditor(`?layout=announcement&event=${EVENTS[1].id}&role=sponsor`);
  assert.equal(card.state.restoreInvalid, false);
  assert.equal(card.$('role').value, 'sponsor');
  const derived = await frameEditor(`?layout=announcement&event=${EVENTS[0].id}&role=sponsor`);
  assert.equal(derived.state.restoreInvalid, true);
  assert.equal(derived.$('status').dataset.kind, 'error');
  assert.equal((await frameEditor(`?layout=announcement&event=${EVENTS[0].id}&role=speaker`)).state.restoreInvalid, false);
  const e = editor();
  assert.equal(e.validCatalog(partialCatalog()), true);
  assert.equal(e.validCatalog({ events: EVENTS, roles: ROLES }), true);
  for (const frameRoles of [null, 'attendee', {}, [], ['attendee', 'attendee'], ['unknown'], [1], [...ROLES.map(role => role.id), 'extra']]) {
    assert.equal(e.validCatalog({ events: [{ ...EVENTS[0], frameRoles }, ...EVENTS.slice(1)], roles: ROLES }), false, JSON.stringify(frameRoles));
  }
  // A social card can be derived only from artwork the edition has.
  for (const frameCard of [false, null, 'true', 1, {}]) assert.equal(e.validCatalog({ events: [{ ...EVENTS[0], frameCard }, ...EVENTS.slice(1)], roles: ROLES }), false, JSON.stringify(frameCard));
  const { frameRoles: dropped, ...withoutArtwork } = EVENTS[0];
  assert.equal(e.validCatalog({ events: [withoutArtwork, ...EVENTS.slice(1)], roles: ROLES }), false, 'frameCard without frameRoles');
  assert.equal(e.validCatalog({ events: [{ ...EVENTS[1], frameCard: true }, EVENTS[0], EVENTS[2]], roles: ROLES }), true);
});

// The redesigned page shows formats as tiles and roles as chips. Each group mirrors the
// select that holds the value, so links, restores and every other reader are unchanged.
const tiles = e => Object.fromEntries([...e.$('format-options').querySelectorAll('input')].map(input => [input.value, input.checked]));
const chips = e => [...e.$('role-options').children].map(chip => ({ id: chip.querySelector('input').value, label: chip.querySelector('span').textContent, checked: chip.querySelector('input').checked, hidden: chip.hidden || false, disabled: chip.querySelector('input').disabled || false }));
// Checking a radio unchecks the rest of its group, as a browser does, then reports the change.
const choose = (e, group, id) => { for (const input of e.$(group).querySelectorAll('input')) input.checked = input.id === id; e.$(id).dispatchEvent(new e.window.Event('change')); };

test('format tiles choose the format and follow one set any other way', async () => {
  const e = editor('?layout=announcement');
  assert.deepEqual(tiles(e), { announcement: true, avatar: false, square: false, profile: false });
  choose(e, 'format-options', 'format-square');
  assert.equal(e.$('layout').value, 'square');
  assert.equal(e.state.layout, 'square');
  assert.equal(e.$('builder').dataset.layout, 'square');
  assert.equal(e.$('event-settings').hidden, true, 'the tile ran the same change as the select');
  assert.equal(e.parameters('fixture').get('layout'), 'square');
  assert.deepEqual(tiles(e), { announcement: false, avatar: false, square: true, profile: false });
  // A choice survives leaving a format through its tile, as it did through the select.
  e.change('name', false);
  choose(e, 'format-options', 'format-profile');
  assert.equal(e.$('name').checked, true);
  choose(e, 'format-options', 'format-square');
  assert.equal(e.$('name').checked, false);
  e.change('layout', 'avatar');
  assert.deepEqual(tiles(e), { announcement: false, avatar: true, square: false, profile: false });
  // The legacy card has no tile, so none is marked.
  e.change('layout', 'classic');
  assert.deepEqual(Object.values(tiles(e)), [false, false, false, false]);
  for (const [search, expected] of [['?layout=profile', 'profile'], ['?layout=avatar', 'avatar'], ['', 'announcement'], ['?username=fixture', null]]) {
    assert.deepEqual(Object.entries(tiles(editor(search))).filter(([, checked]) => checked).map(([value]) => value), expected ? [expected] : [], search || 'fresh');
  }
});

test('role chips list the catalog roles, choose the role and show only roles with artwork', async () => {
  const e = editor('?layout=announcement&event=' + EVENTS[1].id + '&role=speaker');
  assert.deepEqual(chips(e), [], 'no chips before the catalog arrives');
  await e.loadEvents();
  assert.deepEqual(chips(e).map(({ id, label }) => [id, label]), ROLES.map(role => [role.id, role.label]));
  assert.deepEqual(chips(e).filter(chip => chip.checked).map(chip => chip.id), ['speaker'], 'the restored role is marked');
  assert.ok(chips(e).every(chip => !chip.hidden && !chip.disabled));
  const inputs = [...e.$('role-options').querySelectorAll('input')];
  assert.deepEqual(inputs.map(input => [input.type, input.name, input.id]), ROLES.map(role => ['radio', 'role-choice', `role-option-${role.id}`]));
  for (const chip of e.$('role-options').children) { assert.equal(chip.tagName, 'LABEL'); assert.equal(chip.className, 'role-option'); assert.equal(chip.getAttribute('for'), chip.querySelector('input').id); }
  choose(e, 'role-options', 'role-option-organizer');
  assert.equal(e.$('role').value, 'organizer');
  assert.equal(e.parameters('fixture').get('role'), 'organizer');
  assert.deepEqual(chips(e).filter(chip => chip.checked).map(chip => chip.id), ['organizer']);
  // Chips are kept, not rebuilt, while the role list is unchanged.
  const first = e.$('role-options').children[0];
  e.change('role', 'volunteer');
  assert.equal(e.$('role-options').children[0], first);
  assert.deepEqual(chips(e).filter(chip => chip.checked).map(chip => chip.id), ['volunteer']);
  // An edition whose artwork covers two roles offers those two chips.
  const limited = await frameEditor('?layout=avatar');
  pick(limited, EVENTS[0].id, 'volunteer');
  assert.equal(limited.$('role').value, 'attendee', 'a role without artwork moves to the first role with artwork');
  assert.deepEqual(chips(limited).filter(chip => !chip.hidden && !chip.disabled).map(chip => chip.id), ['attendee', 'speaker']);
  assert.ok(chips(limited).filter(chip => !['attendee', 'speaker'].includes(chip.id)).every(chip => chip.hidden && chip.disabled));
  assert.deepEqual(chips(limited).filter(chip => chip.checked).map(chip => chip.id), ['attendee']);
  choose(limited, 'role-options', 'role-option-speaker');
  assert.equal(limited.$('role').value, 'speaker');
  assert.equal(limited.parameters('fixture').get('role'), 'speaker');
  // An edition that draws its own social card offers every role again.
  limited.change('layout', 'announcement'); pick(limited, EVENTS[1].id, 'sponsor');
  assert.ok(chips(limited).every(chip => !chip.hidden && !chip.disabled));
  assert.deepEqual(chips(limited).filter(chip => chip.checked).map(chip => chip.id), ['sponsor']);
});

test('tiles, chips and the page type are styled from the same tokens as the rest of the page', () => {
  for (const name of ['format-option', 'role-option']) {
    assert.match(css, new RegExp(`\\.${name} input\\{position:absolute;inset:[^;]+;[^}]*opacity:0`), `${name}: the radio covers its tile`);
    assert.match(css, new RegExp(`\\.${name}:has\\(input:focus-visible\\)\\{outline:2px solid var\\(--focus\\)`), `${name}: visible keyboard focus`);
  }
  // A chip is 36px tall and its radio 44px, the smallest target the page allows.
  assert.match(css, /\.role-option\{[^}]*min-height:36px/);
  assert.match(css, /\.role-option\{[^}]*border:1px solid/);
  assert.match(css, /\.role-option input\{position:absolute;inset:-5px -1px;[^}]*height:calc\(100% \+ 10px\)/, 'measured from inside the 1px border');
  assert.match(css, /\.role-options\{display:flex;flex-wrap:wrap;gap:8px 6px\}/);
  assert.match(css, /\.format-option:has\(input:checked\)\{[^}]*border-color:var\(--accent\)/);
  assert.match(css, /\.format-name\{[^}]*text-align:center/, 'each format name is centered under its drawing');
  assert.match(css, /\.role-option:has\(input:checked\)\{background:var\(--primary\);border-color:var\(--primary\);color:var\(--on-primary\)\}/);
  // The page borrows the card fonts from the renderer's module: no font files, no font requests of its own.
  assert.match(css, /--serif:"Card Garamond",/);
  assert.match(css, /--sans:"Card Inter",/);
  assert.doesNotMatch(css, /@font-face|url\(/);
  assert.doesNotMatch(html, /fonts\.googleapis|rel="preload"/);
  assert.match(app, /import\('\/preview\/fonts\.js'\)\.then\(\(\{ FONT_CSS \}\) => \{/);
  assert.match(app, /\}\)\.catch\(\(\) => \{ \/\* System fonts remain\. \*\/ \}\);/);
});

test('only a finished card of your own gets the lead-in', () => {
  assert.equal(parseHTML(html).document.getElementById('status-lead').textContent, '');
  assert.equal(app.split("'Hot off the press. '").length, 2, 'one place sets it');
  assert.match(app, /if \(state\.demo\) status\(''\);\n\s+else status\('Your image is ready to download\.', '', 'Hot off the press\. '\);/);
  assert.doesNotMatch(app + html, /Demo using a bundled snapshot|Enter your username to make your own/);
  const e = editor();
  e.status('Ready.', '', 'Lead. ');
  assert.equal(e.$('status').textContent, 'Lead. Ready.');
  e.status('Request failed.', 'error');
  assert.equal(e.$('status-lead').textContent, '', 'any later status clears it');
  assert.equal(e.$('status').textContent, 'Request failed.');
});

test('the finished demo says only that no request was made', async () => {
  const note = 'No WordPress.org request was made.';
  assert.doesNotMatch(app, /Bundled profile snapshot|demoSnapshotAt/);
  for (const layout of ['announcement', 'avatar', 'square', 'profile']) {
    const e = editor(`?layout=${layout}`);
    if (['avatar', 'announcement'].includes(layout)) { await e.loadEvents(); e.$('event').value = EVENTS[0].id; e.$('role').value = ROLES[0].id; }
    const profile = { userName: 'matt', name: 'Matt Mullenweg', badges: [], teams: [], fetchedAt: '2026-11-03T12:00:00.000Z' };
    Object.assign(e.state, { profile, username: 'matt', demo: true });
    e.state.rendererPromise = Promise.resolve(() => '<svg xmlns="http://www.w3.org/2000/svg"/>');
    e.state.frameLoader = Promise.resolve({ loadEventFrame: async () => 'data:image/png;base64,AAAA' });
    e.state.previewInputs = { profile, fingerprint: JSON.stringify(profile), expires: performance.now() + 10000, avatars: new Map([320, 1024].map(size => [size, { data: null, status: 'embedded' }])) };
    await e.renderCard(e.state.renderVersion);
    assert.equal(e.state.ready, true, layout);
    assert.equal(e.$('status').textContent, note, layout);
    assert.equal(e.$('status-message').textContent, '', layout);
    assert.equal(e.$('status-lead').textContent, '', layout);
    assert.equal(e.$('cache-note').textContent, note, 'no leading space when the note stands alone');
    // While the demo is still working, the note follows the message.
    e.status('Updating your preview…');
    assert.equal(e.$('status').textContent, 'Updating your preview… ' + note);
  }
});
