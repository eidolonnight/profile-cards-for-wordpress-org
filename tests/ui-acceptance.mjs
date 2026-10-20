import assert from 'node:assert/strict';

const ready = page => page.waitForFunction(() => {
  const image = document.getElementById('card-preview');
  return !document.getElementById('exports').disabled && image.complete && image.naturalWidth > 0;
}, null, { timeout: 45000 });
const empty = async page => {
  assert.equal(await page.locator('#exports').evaluate(el => el.disabled), true);
  assert.equal(await page.locator('#card-preview').isHidden(), true);
  assert.equal(await page.locator('#card-preview').getAttribute('src'), null);
  assert.equal(await page.locator('#open-preview').getAttribute('href'), null);
  await assertDownloadOnlyActions(page);
};

export async function assertDownloadOnlyActions(page) {
  assert.equal(await page.locator('#copy-card, #copy-markdown, #copy-fallback, #copy-text, #copy-png, .copy-actions').count(), 0);
  assert.deepEqual(await page.locator('#exports button').evaluateAll(nodes => nodes.map(node => node.id)), ['download-png', 'download-svg']);
  assert.equal(await page.getByRole('button', { name: /Copy Card URL|Copy Markdown/i }).count(), 0);
}

// Reconstruct the public query contract from form controls only, never app state
// or a generated share URL. Call after the intended profile has been submitted.
// Browser-only background uploads intentionally have no public query equivalent.
export async function cardURLFromControls(page) {
  const parameters = await page.evaluate(() => {
    const value = id => document.getElementById(id).value;
    const layout = value('layout');
    const fields = {
      profile: ['avatar', 'badges', 'link', 'name', 'jobTitle', 'organization', 'handle', 'location', 'joined', 'teams', 'badgeNames', 'social'],
      square: ['avatar', 'badges', 'link', 'name', 'jobTitle', 'organization', 'handle', 'location', 'joined', 'teams', 'badgeNames', 'social'],
      classic: ['avatar', 'badges', 'link'],
      avatar: ['avatar'],
      announcement: ['avatar', 'name', 'handle', 'eventDetails'],
    };
    const colors = {
      avatar: ['foreground', 'headerColor'],
      announcement: ['headerColor', 'nameColor', 'subHeaderColor', 'foreground'],
    };
    const params = new URLSearchParams({ username: value('username'), layout });
    for (const key of fields[layout]) params.set(key, String(document.getElementById(key).checked));
    for (const key of colors[layout] || ['headerColor', 'nameColor', 'subHeaderColor', 'badgeLabelColor', 'foreground']) {
      params.set(key, value(key).slice(1).toUpperCase());
    }
    if (layout === 'avatar' || layout === 'announcement') {
      params.set('event', value('event')); params.set('role', value('role'));
    } else if (layout === 'profile' || layout === 'square') {
      const omitted = [...document.querySelectorAll('#team-options input[type="checkbox"]:not(:checked)')].map(input => input.value);
      if (omitted.length) params.set('omitTeams', omitted.join(','));
    }
    return params.toString();
  });
  const url = new URL('/card', page.url());
  url.search = parameters;
  assert.match(url.searchParams.get('username'), /^[a-z0-9-]+$/);
  return url.href;
}

export async function selectPalette(page, name) {
  assert.ok(['light', 'dark'].includes(name));
  if (!await page.locator('#customize-colors').evaluate(el => el.open)) await page.locator('#customize-colors summary').click();
  await page.locator('#preset-' + name).click();
}

// No fixtures: validate the automatic demo against the actual local/live API.
export async function assertInitialDemo(page) {
  await ready(page);
  assert.equal(await page.title(), 'Profile Cards for WordPress.org');
  assert.equal(await page.locator('#page-title, .intro h1, [aria-labelledby~="page-title"]').count(), 0);
  assert.equal(await page.locator('.intro-copy').innerText(), 'Bring your WordPress.org profile with you. Make a contributor card, frame your avatar, or announce your next WordCamp.');
  assert.equal(await page.locator('#customize-colors').evaluate(el => el.open), false);
  assert.equal(await page.locator('#preset-light').isVisible(), false);
  assert.equal(await page.locator('#preset-dark').isVisible(), false);
  await page.locator('#customize-colors summary').focus();
  await page.locator('#customize-colors summary').press('Enter');
  assert.equal(await page.locator('#preset-light').isVisible(), true);
  assert.equal(await page.locator('#preset-dark').isVisible(), true);
  await page.locator('#customize-colors summary').press('Enter');
  assert.equal(await page.locator('#preset-light').isVisible(), false);
  assert.match(await page.locator('.wordmark').innerText(), /Profile Cards for WordPress\.org$/);
  assert.equal(await page.locator('.edition').innerText(), 'Built for contributors');
  assert.equal(await page.locator('.intro .eyebrow, .privacy-note, #refresh, #try-profile, #download-json, #copy-builder').count(), 0);
  assert.equal(await page.locator('#username').inputValue(), '');
  assert.equal(await page.locator('#username').getAttribute('placeholder'), 'Your WordPress.org Username');
  assert.ok((await page.locator('#profile-form').innerText()).includes('Profile data may be cached for up to 15 minutes.'));
  const actions = ['download-png', 'download-svg'];
  await assertDownloadOnlyActions(page);
  assert.deepEqual(await page.locator('#layout option:not([hidden])').evaluateAll(nodes => nodes.map(node => [node.value, node.textContent])), [
    ['profile', 'Landscape banner'], ['square', 'Vertical card'], ['avatar', 'WordCamp avatar frame'], ['announcement', 'WordCamp social card'],
  ]);
  assert.equal(await page.locator('#layout option[value="classic"][hidden]').count(), 1, 'legacy classic remains available to restored URLs, not the visible menu');
  assert.equal(await page.locator('#copy-png, #dimension-note, #export-note').count(), 0);
  assert.deepEqual(await page.locator('#exports button').evaluateAll(nodes => nodes.map(node => node.id)), actions);
  assert.equal(await page.locator('.download-actions').count(), 1);
  assert.deepEqual(await page.locator('#exports .download-actions > button').evaluateAll(nodes => nodes.map(node => node.id)), actions);
  assert.deepEqual(await page.locator('#exports .primary').evaluateAll(nodes => nodes.map(node => node.id)), ['download-png']);
  assert.equal(await page.locator('#download-png').innerText(), 'Download PNG');
  assert.equal(await page.locator('#download-svg').innerText(), 'Download SVG');
  assert.match(await page.locator('.result').innerText(), /demo|example/i);
  assert.equal(await page.locator('#profile-link').getAttribute('href'), 'https://profiles.wordpress.org/matt/');
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  const lookups = resources.map(value => new URL(value)).filter(url => url.pathname === '/json');
  assert.ok(lookups.some(url => url.searchParams.get('username') === 'matt'), 'demo must fetch matt, not use a hardcoded profile');
  for (const url of lookups) assert.equal(url.searchParams.has('refresh'), false);
  const response = await page.context().request.get(new URL('/json?username=matt', page.url()).href);
  assert.equal(response.status(), 200);
  const profile = await response.json();
  assert.equal(profile.userName, 'matt');
  const svg = await page.locator('#card-preview').evaluate(image => fetch(image.src).then(response => response.text()));
  assert.ok(svg.includes(profile.name.replaceAll('&', '&amp;').replaceAll('<', '&lt;')));
  assert.ok(svg.includes('@matt'));
}

// Validate real downloaded bytes against a fresh raster of the current preview.
// Compare decoded pixels, not PNG compression.
export async function assertDownloadedPNG(page, downloaded) {
  await assertDownloadOnlyActions(page);
  assert.equal(await page.locator('#copy-png, #dimension-note, #export-note').count(), 0);
  assert.doesNotMatch(await page.locator('.result').innerText(), /(?:1080 × (?:1080|1350)|1440 × 1440) PNG|Circular artwork with transparent corners|Square 1:1\.|Portrait 4:5\.|Uncheck the photo for a frame-only PNG|Download the PNG to (?:use on social media|post your announcement)|Private image links are not public embeds|Copy or download a PNG to share|SVG stays sharp at any size/i);
  assert.ok(downloaded.length > 100);
  assert.equal(downloaded.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const result = await page.evaluate(async encoded => {
    const preview = document.getElementById('card-preview');
    await preview.decode();
    const social = ['avatar', 'announcement'].includes(document.getElementById('layout').value);
    const scale = Math.min(social ? 1 : 2, 8192 / preview.naturalWidth, 8192 / preview.naturalHeight, Math.sqrt(16000000 / (preview.naturalWidth * preview.naturalHeight)));
    const width = Math.max(1, Math.round(preview.naturalWidth * scale));
    const height = Math.max(1, Math.round(preview.naturalHeight * scale));
    const pixels = async (image, width, height) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, width, height);
      const data = context.getImageData(0, 0, width, height).data;
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(value => value.toString(16).padStart(2, '0')).join('');
      return { width, height, digest, painted: data.some((value, index) => index % 4 === 3 && value > 0) };
    };
    const image = new Image(); image.src = 'data:image/png;base64,' + encoded; await image.decode();
    return { actual: await pixels(image, image.naturalWidth, image.naturalHeight), expected: await pixels(preview, width, height) };
  }, downloaded.toString('base64'));
  assert.equal(result.actual.width, downloaded.readUInt32BE(16));
  assert.equal(result.actual.height, downloaded.readUInt32BE(20));
  assert.equal(result.actual.painted, true, 'download must contain painted pixels');
  assert.deepEqual(result.actual, result.expected, 'downloaded PNG dimensions and pixels must match the current preview');
}

async function downloadPNG(page) {
  const waiting = page.waitForEvent('download');
  await page.locator('#download-png').click();
  const download = await waiting;
  assert.match(download.suggestedFilename(), /^eidolonnight-.*\.png$/);
  assert.equal(await download.failure(), null);
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  await assertDownloadedPNG(page, Buffer.concat(chunks));
}

export async function assertCleanupFailures(context, base) {
  const page = await context.newPage();
  const requests = [], errors = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (['/json', '/card', '/preview-data'].includes(url.pathname)) requests.push(url);
  });
  page.on('pageerror', error => errors.push(error.message));
  try {
    // Shared URLs remain manual, including old URLs containing refresh=true.
    await page.goto(base + '/create?username=eidolonnight&layout=profile&refresh=true', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#username').inputValue(), 'eidolonnight');
    await empty(page); assert.deepEqual(requests, []);
    await page.locator('#create-button').click(); await ready(page);
    await page.locator('#create-button').click(); await ready(page);
    assert.equal(await page.locator('#profile-link').getAttribute('href'), 'https://profiles.wordpress.org/eidolonnight/');
    assert.ok(requests.some(url => url.pathname === '/json'));
    for (const url of requests) assert.equal(url.searchParams.has('refresh'), false, url.href);

    for (const query of ['username=', 'username=Matt', 'username=matt&username=eidolonnight', 'layout=bogus', 'username=eidolonnight&foreground=oops', 'layout=avatar&event=unknown-2027']) {
      requests.length = 0;
      await page.goto(base + '/create?' + query, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Some URL settings were invalid'));
      await empty(page); assert.deepEqual(requests, [], 'malformed shared settings must not silently load a demo');
    }

    // Only the outage is synthetic; recovery must fetch and render a real profile.
    await page.route('**/json?username=matt', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Synthetic demo outage for acceptance test.' } }) }));
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById('status').dataset.kind === 'error');
    assert.match(await page.locator('#status').innerText(), /Synthetic demo outage/);
    assert.equal(await page.locator('#username').inputValue(), '');
    await empty(page);
    await page.unroute('**/json?username=matt');
    await page.locator('#username').fill('eidolonnight'); await page.locator('#create-button').click(); await ready(page);

    await assertDownloadOnlyActions(page);
    await downloadPNG(page);
    assert.match(await page.locator('#status').innerText(), /PNG download requested/);
    assert.equal(await page.locator('#download-png').isEnabled(), true);

    const downloads = [];
    page.on('download', item => downloads.push(item.suggestedFilename()));
    // Count attempted anchor downloads synchronously too, so a delayed browser
    // download event cannot make a stale-conversion assertion pass prematurely.
    await page.evaluate(() => {
      const original = HTMLAnchorElement.prototype.click;
      window.downloadAttempts = 0;
      HTMLAnchorElement.prototype.click = function (...args) {
        if (this.hasAttribute('download')) window.downloadAttempts++;
        return original.apply(this, args);
      };
    });
    for (const failure of ['null', 'throw']) {
      const before = downloads.length;
      const attempts = await page.evaluate(() => window.downloadAttempts);
      await page.evaluate(failure => {
        const original = HTMLCanvasElement.prototype.toBlob;
        window.restoreCanvas = () => { HTMLCanvasElement.prototype.toBlob = original; };
        HTMLCanvasElement.prototype.toBlob = function (callback) {
          if (failure === 'throw') throw new Error('Synthetic canvas conversion failure');
          callback(null);
        };
      }, failure);
      try {
        await page.locator('#download-png').click();
        await page.waitForFunction(() => document.getElementById('status').dataset.kind === 'error' && !document.getElementById('download-png').disabled);
        assert.match(await page.locator('#status').innerText(), /Could not create PNG:.*(?:PNG conversion failed|Synthetic canvas conversion failure).*SVG/);
        assert.equal(await page.evaluate(() => window.downloadAttempts), attempts);
        assert.equal(downloads.length, before);
        assert.equal(await page.locator('#download-svg').isEnabled(), true);
        assert.equal(await page.locator('#download-png').isEnabled(), true);
      } finally { await page.evaluate(() => window.restoreCanvas()); }
      await downloadPNG(page);
    }

    // Hold real PNG conversion through invalidation, including a newer ready
    // preview. Neither stale completion may download or overwrite its status.
    for (const change of ['username', 'layout']) {
      const before = downloads.length;
      const attempts = await page.evaluate(() => window.downloadAttempts);
      await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.toBlob;
        window.releasePNG = null;
        window.restoreCanvas = () => { HTMLCanvasElement.prototype.toBlob = original; };
        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          original.call(this, blob => { window.releasePNG = () => callback(blob); }, ...args);
        };
      });
      try {
        await page.locator('#download-png').click();
        await page.waitForFunction(() => typeof window.releasePNG === 'function');
        if (change === 'username') {
          await page.locator('#username').fill('another-name'); await empty(page);
        } else {
          await page.locator('#layout').selectOption('square'); await ready(page);
        }
        const status = await page.locator('#status').innerText();
        await page.evaluate(() => window.releasePNG());
        await page.waitForFunction(() => !document.getElementById('download-png').disabled);
        assert.equal(await page.evaluate(() => window.downloadAttempts), attempts, 'stale conversion must never initiate a download');
        assert.equal(downloads.length, before);
        assert.equal(await page.locator('#status').innerText(), status, 'stale conversion must preserve current status');
        if (change === 'username') await empty(page);
      } finally { await page.evaluate(() => window.restoreCanvas()); }
      if (change === 'username') {
        await page.locator('#username').fill('eidolonnight'); await page.locator('#create-button').click(); await ready(page);
      }
      assert.equal(await page.locator('#download-png').isEnabled(), true);
      await downloadPNG(page);
    }
    for (const url of requests) assert.equal(url.searchParams.has('refresh'), false, url.href);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}
