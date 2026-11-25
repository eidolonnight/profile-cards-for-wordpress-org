import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom/worker';

const { document } = parseHTML(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
const repository = 'https://github.com/eidolonnight/profile-cards-for-wordpress-org';

test('footer links to the license notices and this repository, and nothing else', () => {
  const footer = document.querySelector('footer');
  const link = footer.querySelector(`a[href="${repository}"]`);
  assert.ok(link, 'project repository link');
  assert.match(link.textContent, /GitHub/);
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  assert.match(link.textContent, /opens in a new tab/);
  assert.deepEqual([...footer.querySelectorAll('a')].map(node => node.getAttribute('href')), ['/THIRD-PARTY-NOTICES.txt', '/FONT-LICENSES.txt', repository]);
  assert.equal(footer.querySelector('p').textContent, 'Dependency licenses · Font licenses');
  // The CardPress credit lives with the other credits, in the README and licensing notes.
  assert.doesNotMatch(footer.textContent, /Inspired by|Independently implemented/);
});

test('the title is text alone and the supplied Wapuu stands in the hero, facing the page', () => {
  const link = document.querySelector('.wordmark');
  assert.equal(link.querySelector('img'), null, 'no mark beside the title');
  assert.equal(link.textContent, 'Profile cards for w.org');
  assert.equal(link.getAttribute('aria-label'), 'Profile cards for w.org home');
  assert.equal(document.querySelectorAll('img[src="/site-logo.png"], .brand-mark').length, 0);
  const art = [...document.querySelectorAll('.hero .hero-art img')];
  assert.equal(art.length, 1);
  assert.equal(art[0].getAttribute('src'), '/site-hero.webp');
  assert.equal(art[0].getAttribute('width'), '668');
  assert.equal(art[0].getAttribute('height'), '840');
  assert.equal(art[0].getAttribute('alt'), '', 'decorative: the heading beside it names the page');
});

test('local favicon declarations include PNG and multiresolution ICO assets', () => {
  assert.deepEqual([...document.querySelectorAll('link[rel="icon"]')].map(link => ({
    href: link.getAttribute('href'), type: link.getAttribute('type'), sizes: link.getAttribute('sizes'),
  })), [
    { href: '/site-favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
    { href: '/favicon.png', type: 'image/png', sizes: '96x96' },
  ]);
});

test('the hero WebP keeps its transparency, attribution and declared size', async () => {
  const bytes = await readFile(new URL('../public/site-hero.webp', import.meta.url));
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8, 16).toString(), 'WEBPVP8X');
  assert.equal(bytes[20] & 0x10, 0x10, 'alpha channel');
  assert.equal(bytes[20] & 0x04, 0x04, 'XMP metadata');
  assert.deepEqual([bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1], [668, 840], 'the size the page declares');
  assert.ok(bytes.length < 100000, 'small branding asset');
  const xmp = bytes.toString('latin1');
  assert.match(xmp, /Left-facing newsboy Wapuu with WordPress sandwich board/);
  assert.match(xmp, /Wapuu designed by Kazuko Kaneuchi; derivative under GPL-2\.0-or-later\. WordPress trademarks remain subject to their applicable rights\./);
});

test('favicon PNG retains RGBA encoding and bounded dimensions', async () => {
  for (const [name, size] of [['favicon.png', 96]]) {
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
  assert.match(notices, /site-hero\.webp/);
  assert.doesNotMatch(notices, /site-logo\.png/);
  assert.match(notices, /site-favicon\.ico/);
});
