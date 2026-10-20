import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom/worker';

const { document } = parseHTML(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
const repository = 'https://github.com/eidolonnight/profile-cards-for-wordpress-org';

test('footer links to this repository without replacing upstream attribution or license links', () => {
  const footer = document.querySelector('footer');
  const link = footer.querySelector(`a[href="${repository}"]`);
  assert.ok(link, 'project repository link');
  assert.match(link.textContent, /GitHub/);
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  assert.match(link.textContent, /opens in a new tab/);
  for (const href of ['https://github.com/donini/wp-profiles-card', '/THIRD-PARTY-NOTICES.txt', '/FONT-LICENSES.txt']) {
    assert.ok(footer.querySelector(`a[href="${href}"]`), href);
  }
});

test('the supplied Wapuu replaces the placeholder mark without duplicating the home link name', () => {
  const link = document.querySelector('.wordmark');
  const logo = link.querySelector('img.brand-mark');
  assert.ok(logo, 'Wapuu logo');
  assert.equal(logo.getAttribute('src'), '/site-logo.png');
  assert.equal(logo.getAttribute('width'), '56');
  assert.equal(logo.getAttribute('height'), '56');
  assert.equal(logo.getAttribute('alt'), '');
  assert.equal(link.getAttribute('aria-label'), 'Profile Cards for WordPress.org home');
  assert.match(link.textContent, /Profile Cards for WordPress\.org/);
  assert.doesNotMatch(link.textContent, /\[ : \]/);
});

test('local favicon declarations include PNG and multiresolution ICO assets', () => {
  assert.deepEqual([...document.querySelectorAll('link[rel="icon"]')].map(link => ({
    href: link.getAttribute('href'), type: link.getAttribute('type'), sizes: link.getAttribute('sizes'),
  })), [
    { href: '/site-favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
    { href: '/favicon.png', type: 'image/png', sizes: '96x96' },
  ]);
});

test('logo and favicon PNGs retain RGBA encoding and bounded dimensions', async () => {
  for (const [name, size] of [['site-logo.png', 192], ['favicon.png', 96]]) {
    const bytes = await readFile(new URL(`../public/${name}`, import.meta.url));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.subarray(12, 16).toString(), 'IHDR');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    assert.equal(bytes[24], 8, '8-bit channels');
    assert.equal(bytes[25], 6, 'truecolor with alpha');
    assert.ok(bytes.length < 100000, 'small branding asset');
  }
  const ico = await readFile(new URL('../public/site-favicon.ico', import.meta.url));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.deepEqual([0, 1, 2].map(i => [ico[6 + i * 16], ico[7 + i * 16]]), [[16, 16], [32, 32], [48, 48]]);
});

test('Wapuu creator and supplied derivative license are preserved', async () => {
  const notices = await readFile(new URL('../public/THIRD-PARTY-NOTICES.txt', import.meta.url), 'utf8');
  assert.match(notices, /Wapuu designed by Kazuko Kaneuchi/);
  assert.match(notices, /derivative under GPL-2\.0-or-later/);
  assert.match(notices, /site-logo\.png/);
  assert.match(notices, /site-favicon\.ico/);
});
