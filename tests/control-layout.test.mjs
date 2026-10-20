import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom/worker';

const { document } = parseHTML(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));

test('Step 1 starts with username before format, event, content and appearance', () => {
  const controls = document.querySelector('.controls');
  const order = [...controls.querySelectorAll('#layout, #event-settings, #profile-form, #display-settings, #customize-colors, .background-settings')].map(node => node.id || node.className);
  assert.deepEqual(order, ['profile-form', 'layout', 'event-settings', 'display-settings', 'customize-colors', 'background-settings']);
  assert.equal(controls.querySelector('input, select, textarea').id, 'username');
  assert.equal(document.querySelector('.background-settings').closest('details').id, 'customize-colors');
  assert.equal(document.querySelector('#event-settings').hasAttribute('hidden'), true);
  assert.equal(document.querySelector('#event-controls').hasAttribute('disabled'), true);
  assert.equal(document.querySelector('#background-file').closest('form'), null, 'local image must never become a submitting form field');
});

test('Color palette is removed without losing the named colors disclosure or presets', () => {
  assert.doesNotMatch(document.documentElement.textContent, /Color palette/i);
  assert.equal(document.querySelector('.palette-settings'), null);
  const colors = document.querySelector('#customize-colors');
  assert.equal(colors.tagName, 'DETAILS');
  assert.equal(colors.querySelector('summary').textContent, 'Colors & background');
  assert.equal(colors.hasAttribute('open'), false);
  assert.deepEqual([...colors.querySelectorAll('.presets button')].map(node => node.id), ['preset-event', 'preset-light', 'preset-dark']);
  assert.equal(colors.querySelector('#preset-event').hasAttribute('hidden'), true);
  assert.equal(colors.querySelector('#preset-event').getAttribute('type'), 'button');
  assert.deepEqual([...colors.querySelectorAll('#color-settings input[type="color"]')].map(node => node.id), ['foreground', 'headerColor', 'nameColor', 'subHeaderColor', 'badgeLabelColor']);
});

test('Profile content groups twelve checked choices', () => {
  assert.equal(document.querySelector('#display-settings > legend').textContent, 'Profile content');
  assert.equal(document.querySelector('#header, label[for="header"], .profile-master, .card-extras'), null);
  const content = document.querySelector('.profile-content-options');
  assert.ok(content);
  const ids = ['avatar', 'name', 'handle', 'jobTitle', 'organization', 'location', 'joined', 'teams', 'badges', 'badgeNames', 'link', 'social'];
  assert.deepEqual([...content.querySelectorAll('input')].map(node => node.id), ids);
  for (const id of ids) {
    const input = document.getElementById(id);
    assert.ok(content.contains(input), id);
    assert.equal(input.hasAttribute('checked'), true, id);
    assert.equal(input.hasAttribute('disabled'), false, id);
  }
  assert.ok(content.contains(document.getElementById('individual-details')));
});

test('modern option grid has twelve equal cells before full-width help and disclosure', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const content = document.querySelector('.profile-content-options');
  const labels = [...content.querySelectorAll('label')];
  assert.equal(labels.length, 12);
  assert.ok(!content.querySelector('.nested-option'));
  assert.ok(document.getElementById('social-help').parentElement === content);
  const lastOption = document.getElementById('social').closest('label');
  assert.equal(lastOption.nextElementSibling.id, 'social-help');
  assert.equal(lastOption.nextElementSibling.nextElementSibling.id, 'individual-details');
  assert.match(css, /\.profile-content-options\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.profile-detail-controls\{display:contents\}/);
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/grid-column\s*:/.test(rule[2])) continue;
    for (const selector of rule[1].split(',')) {
      assert.ok(!labels.some(label => label.matches(selector.trim())), `individual option spans columns: ${selector}`);
    }
  }
  assert.match(css, /#social-help[^{}]*\{[^}]*grid-column:1 \/ -1/);
});

test('about text keeps exact independent and participation copy together, without footer duplication', () => {
  const group = document.querySelector('.about > div');
  const independent = 'Profile Cards for WordPress.org is an independent community tool, not an official WordPress service.';
  const role = 'Your participation role is self-reported. These personal graphics are not official event badges or proof of registration.';
  assert.match(group.textContent, /never uploaded or saved by this tool/);
  for (const copy of [independent, role]) {
    assert.ok([...group.children].some(node => node.textContent === copy));
    assert.equal(document.body.textContent.split(copy).length - 1, 1);
    assert.ok(!document.querySelector('footer').textContent.includes(copy));
  }
  assert.ok(document.getElementById('role-help').parentElement === group);
  assert.equal(document.getElementById('role').getAttribute('aria-describedby'), 'role-help');
  for (const href of ['https://github.com/donini/wp-profiles-card', '/THIRD-PARTY-NOTICES.txt', '/FONT-LICENSES.txt']) assert.ok(document.querySelector(`footer a[href="${href}"]`));
});

test('the builder no longer has a hidden master-switch dependency', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /\$\('header'\)/);
  assert.doesNotMatch(app, /\['header',\s*'avatar'/);
  assert.doesNotMatch(app, /What’s on your (?:card|image)/);
});

test('developer disclosure is removed without losing the privacy information or license links', () => {
  assert.doesNotMatch(document.documentElement.textContent, /For developers & curious contributors|returns profile data|returns a self-contained SVG/);
  assert.equal(document.querySelector('.about details'), null);
  assert.match(document.querySelector('.about').textContent, /never uploaded or saved by this tool/);
  for (const href of ['/THIRD-PARTY-NOTICES.txt', '/FONT-LICENSES.txt']) assert.ok(document.querySelector(`a[href="${href}"]`));
});

test('local avatar requests follow the individual checkbox without requiring the removed master parameter', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  // Exercise the production request-size expression, not a copy of its logic.
  const expression = app.match(/async function cardSource[\s\S]*?const size = ([^;\n]+);/)?.[1];
  assert.ok(expression, 'canonical local-preview request sizing must be inspectable');
  const requestSize = new Function('params', 'social', `return (${expression});`);
  for (const layout of ['profile', 'square', 'classic', 'avatar', 'announcement']) {
    const social = ['avatar', 'announcement'].includes(layout);
    for (const avatar of [true, false]) {
      const params = new URLSearchParams({ layout, avatar: String(avatar) });
      assert.equal(params.has('header'), false);
      assert.equal(requestSize(params, social), avatar ? (social ? 1024 : 320) : 0, `${layout}/${avatar}`);
    }
  }
});

test('background adjustments keep labels and outputs together in responsive groups', () => {
  for (const id of ['x', 'y', 'zoom', 'strength']) {
    const control = document.getElementById('background-' + id);
    const group = control.closest('.range-control');
    assert.ok(group, id);
    assert.ok(group.querySelector(`label[for="${control.id}"]`));
    assert.ok(group.querySelector(`output[for="${control.id}"]`));
  }
  assert.deepEqual([...document.querySelectorAll('.background-crop input')].map(node => node.id), ['background-x', 'background-y', 'background-zoom']);
  assert.deepEqual([...document.querySelectorAll('.background-tint-controls input')].map(node => node.id), ['background-tint', 'background-strength']);
  for (const node of document.querySelectorAll('.background-settings button')) assert.equal(node.getAttribute('type'), 'button');
});

test('reorganized controls retain unique identifiers, labels and valid ARIA references', () => {
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const label of document.querySelectorAll('label[for]')) assert.ok(document.getElementById(label.getAttribute('for')));
  for (const node of document.querySelectorAll('[aria-labelledby], [aria-describedby]')) {
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      for (const id of (node.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)) assert.ok(document.getElementById(id), `${attribute}: ${id}`);
    }
  }
  assert.equal(document.querySelector('#profile-form').querySelectorAll('input').length, 1);
  assert.equal(document.querySelector('#profile-form input').id, 'username');
});
