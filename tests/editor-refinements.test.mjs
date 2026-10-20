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
  for (const input of document.querySelectorAll('input[type="checkbox"]')) input.checked = input.hasAttribute('checked');
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
  vm.runInContext(app.replace(/\}\)\(\);\s*$/, 'globalThis.editorTest = { state, parameters, syncControls, hasVisibleContent, loadEvents, updateEventNote, validCatalog, renderCard, status, clearCard };\n})();'), context);
  return { ...env, ...context.editorTest, change(id, value) { const node = env.$(id); if (node.type === 'checkbox') node.checked = value; else node.value = value; node.dispatchEvent(new env.window.Event('change')); } };
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
    assert.equal(e.$('avatar').disabled || false, false);
    assert.equal(e.$('badges').disabled, layout !== 'classic');
    assert.equal(e.$('name').disabled, layout !== 'announcement');
    assert.equal(e.$('event-settings').hidden, layout === 'classic');
    for (const id of layout === 'classic' ? ['avatar', 'badges', 'link'] : layout === 'avatar' ? ['avatar'] : ['avatar', 'name', 'handle', 'eventDetails']) {
      assert.equal(e.$(id).checked, true, `${layout}/${id} fresh`);
    }
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
    const applicable = initial === 'avatar' ? ['avatar'] : initial === 'announcement' ? ['avatar', 'name', 'handle', 'eventDetails'] : initial === 'classic' ? ['avatar', 'badges', 'link'] : modernIds;
    const e = editor(`?layout=${initial}&${applicable.map(id => `${id}=false`).join('&')}`);
    if (['avatar', 'announcement'].includes(initial)) await e.loadEvents();
    for (const id of applicable) assert.equal(e.$(id).checked, false);
    const next = initial === 'profile' ? 'square' : 'profile';
    e.change('layout', next);
    for (const id of modernIds) assert.equal(e.$(id).checked, true, `${initial} to ${next}/${id}`);
    e.change('layout', initial);
    for (const id of applicable) assert.equal(e.$(id).checked, false, `${initial}/${id}`);
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
      e.state.previewInputs = { profile, fingerprint: JSON.stringify(profile), expires: performance.now() + 10000, avatars: new Map([320, 1024].map(size => [size, { data: null, status: avatarStatus }])) };
      await e.renderCard(e.state.renderVersion);
      assert.equal(e.state.ready, true, e.$('status').textContent);
      const expected = `Your image is ready to download. Profile fetched ${new Date(fetchedAt).toLocaleString()}.`;
      assert.ok(e.$('status').textContent.startsWith(expected), e.$('status').textContent);
      assert.equal(e.$('cache-note').parentElement.id, 'status');
      assert.equal(e.$('cache-note').tagName, 'SPAN');
      assert.equal(e.$('status').nextElementSibling, e.$('profile-meta'));
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
