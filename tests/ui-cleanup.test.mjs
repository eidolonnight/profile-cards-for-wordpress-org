import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom/worker';

const { document } = parseHTML(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));

test('community branding and username entry use the cleaned-up copy', () => {
  assert.match(document.title, /^Profile Cards for WordPress\.org(?: —|$)/);
  const wordmark = document.querySelector('.wordmark').cloneNode(true);
  wordmark.querySelector('.brand-mark')?.remove();
  assert.equal(wordmark.textContent.trim(), 'Profile Cards for WordPress.org');
  assert.equal(wordmark.getAttribute('aria-label'), 'Profile Cards for WordPress.org home');
  assert.equal(document.querySelector('.edition').textContent, 'Built for contributors');
  assert.equal(document.querySelector('.intro .eyebrow, .privacy-note'), null);
  const username = document.getElementById('username');
  assert.equal(username.getAttribute('value') || '', '');
  assert.equal(username.getAttribute('placeholder'), 'Your WordPress.org Username');
  assert.ok(document.querySelector('label[for="username"]'));
  assert.ok(username.hasAttribute('required'));
  assert.ok(document.getElementById('profile-form').textContent.includes('Profile data may be cached for up to 15 minutes.'));
  assert.equal(document.querySelector('#refresh, #try-profile'), null);
});

test('the large page-title heading is removed while document title and intro remain', () => {
  assert.equal(document.title, 'Profile Cards for WordPress.org');
  assert.equal(Boolean(document.querySelector('#page-title, .intro h1')), false);
  assert.equal(document.querySelector('.intro').tagName, 'DIV');
  assert.equal(document.querySelector('.intro-copy').textContent, 'Bring your WordPress.org profile with you. Make a contributor card, frame your avatar, or announce your next WordCamp.');
  for (const element of document.querySelectorAll('[aria-labelledby], [aria-describedby]')) {
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      for (const id of (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)) {
        assert.ok(document.getElementById(id), `Dangling ${attribute}: ${id}`);
      }
    }
  }
  assert.doesNotMatch(document.documentElement.textContent, /Your contribution,\s*in a card\./);
});

test('card presets and local background controls share one collapsed disclosure', () => {
  const details = document.getElementById('customize-colors');
  assert.ok(details);
  assert.equal(details.tagName, 'DETAILS');
  assert.equal(details.querySelector('summary').textContent, 'Colors & background');
  assert.ok(details.contains(document.getElementById('background-file')));
  assert.equal(details.hasAttribute('open'), false);
  assert.deepEqual([...details.querySelectorAll('.presets button')].map(button => button.id), ['preset-event', 'preset-light', 'preset-dark']);
  assert.equal(details.querySelector('#preset-event').hasAttribute('hidden'), true, 'event colors are irrelevant until a WordCamp format is selected');
  assert.ok(details.contains(document.getElementById('color-settings')));
  assert.equal(document.querySelector('.palette-settings > .presets'), null);
});

test('export actions are download-only with PNG first', () => {
  const buttons = [...document.querySelectorAll('#exports button')];
  assert.deepEqual(buttons.map(button => [button.id, button.textContent]), [
    ['download-png', 'Download PNG'],
    ['download-svg', 'Download SVG'],
  ]);
  assert.ok(buttons[0].classList.contains('primary'));
  for (const button of buttons) {
    assert.equal(button.getAttribute('type'), 'button');
    assert.ok(button.classList.contains('button'));
    assert.ok(!button.classList.contains('text-button'));
    assert.ok(button.parentElement.classList.contains('download-actions'));
  }
  assert.ok(document.getElementById('exports').hasAttribute('disabled'), 'exports start disabled until a real image is ready');
  assert.equal(Boolean(document.querySelector('#copy-card, #copy-markdown, #copy-fallback, #copy-text, #copy-png, #download-json, #copy-builder, .copy-actions')), false);
  assert.equal(document.getElementById('status').getAttribute('role'), 'status');
  assert.equal(document.getElementById('status').getAttribute('aria-live'), 'polite');
});

test('the dimensions and export-information block is removed in markup and runtime', async () => {
  assert.equal(document.querySelector('#dimension-note, #export-note, .dimension-note, .export-note'), null);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /dimension-note|export-note|Copy or download a PNG to share|ClipboardItem|copyPNG|copy-png|copy-card|copy-markdown|copy-fallback|copy-text|navigator\.clipboard|cardURL/);
  assert.doesNotMatch(document.documentElement.textContent, /copied (card )?URLs|Copy Card URL|Copy Markdown/);
});

test('browser-only background controls are labelled, bounded and not in a submitting form', () => {
  const input = document.getElementById('background-file');
  assert.ok(input);
  assert.equal(input.getAttribute('type'), 'file');
  assert.equal(input.getAttribute('accept'), 'image/jpeg,image/png,image/webp');
  assert.equal(input.closest('form'), null);
  for (const id of ['background-choose', 'background-remove']) assert.equal(document.getElementById(id).getAttribute('type'), 'button');
  for (const [id, min, max] of [['x', '0', '100'], ['y', '0', '100'], ['zoom', '1', '3'], ['strength', '0', '100']]) {
    const slider = document.getElementById('background-' + id);
    assert.ok(document.querySelector(`label[for="background-${id}"]`));
    assert.equal(slider.getAttribute('type'), 'range');
    assert.equal(slider.getAttribute('min'), min);
    assert.equal(slider.getAttribute('max'), max);
  }
  assert.ok(document.getElementById('background-controls').hasAttribute('hidden'));
  assert.match(document.getElementById('background-help').textContent, /never uploaded/i);
  assert.match(document.getElementById('background-help').textContent, /reload/i);
});
