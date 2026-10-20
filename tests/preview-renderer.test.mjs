import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderPreview } from '../shared/preview.js';
import { queryOptions, ProfileError, DEFAULT_COLORS } from '../shared/options.js';
import * as serverOptions from '../functions/_profile.js';
import { GET as cardGET } from '../functions/card.js';
import { GET as dataGET } from '../functions/preview-data.js';
import { renderCard } from '../shared/svg.js';
import { renderCard as serverCard } from '../functions/_svg.js';
import { renderSocial } from '../shared/social.js';
import { renderSocial as serverSocial } from '../functions/_social.js';
import { FONT_CSS, FONT_STYLE_HASH } from '../shared/fonts.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 1]);
const layouts = ['classic', 'profile', 'square', 'avatar', 'announcement'];
const fixture = (username, hash, rich) => `<meta property="profile:username" content="${username}"><header class="site-header"><h2>Zoë 李 &amp; 👩🏽‍💻 &lt;Example&gt;</h2><img class="avatar" src="https://secure.gravatar.com/avatar/${hash}">${rich ? '<span class="wp-p2-jobline">Engineer at Example &amp; Co</span><span class="wp-p2-loc">Málaga 日本</span><span class="wp-p2-joined">joined May 2001</span><div class="wp-p2-chip-row"><span class="wp-p2-chip-label">Teams</span><span class="wp-p2-chip">Core</span><span class="wp-p2-chip">Polyglots</span></div>' : ''}</header>${rich ? '<section class="wp-p2-badges-block"><span class="medal"><span class="mn">Core Contributor</span></span><span class="medal"><span class="mn">文書 &amp; Design</span></span></section>' : ''}`;
const variants = [
  {},
  { headerColor: 'abcdef', nameColor: '010203', subHeaderColor: '123456', badgeLabelColor: '654321', foreground: '191E23', linkColor: 'FEDCBA', link: 'true' },
  { header: 'false', badges: 'false', link: 'true' },
  { avatar: 'false', badges: 'true' },
  { name: 'false', handle: 'false', jobTitle: 'false', joined: 'false', omitTeams: 'Core', omitSocial: 'mastodon', link: 'true' },
  { header: 'false', avatar: 'false', badges: 'false', name: 'false', handle: 'false', organization: 'false', location: 'false', teams: 'false' }
];

for (const [index, layout] of layouts.entries()) test(`preview is byte-identical to GET /card: ${layout}, colors/omissions/Unicode/missing/photos`, async () => {
  const saved = globalThis.fetch;
  try {
    for (const rich of [false, true]) for (const photo of [false, true]) {
      const username = `preview-equal-${layout}-${rich}-${photo}`;
      const hash = (index * 4 + Number(rich) * 2 + Number(photo) + 1).toString(16).padStart(32, '0');
      const social = ['avatar', 'announcement'].includes(layout);
      const size = social ? 1024 : 320;
      const photoCalls = [];
      globalThis.fetch = async url => {
        if (url.startsWith('https://profiles.wordpress.org/')) return new Response(fixture(username, hash, rich), { headers: { 'Content-Type': 'text/html' } });
        photoCalls.push(url);
        return photo ? new Response(social ? jpeg : png, { headers: { 'Content-Type': social ? 'image/jpeg' : 'image/png' } }) : new Response('', { status: 404 });
      };
      const inputs = await dataGET(new Request(`https://cards.test/preview-data?username=${username}&size=${size}`));
      assert.equal(inputs.status, 200);
      const { profile, avatar } = await inputs.json();
      assert.equal(avatar.size, size);
      assert.equal(avatar.status, photo ? 'embedded' : 'initials');
      assert.equal(new URL(photoCalls[0]).searchParams.get('s'), String(size));
      for (const [variantIndex, variant] of variants.entries()) {
        const query = new URLSearchParams({ username, layout, ...variant, ...(social && variantIndex % 2 ? { event: 'europe-2027', role: 'speaker', eventDetails: 'false' } : {}) }).toString();
        const response = await cardGET(new Request(`https://cards.test/card?${query}`));
        assert.equal(response.status, 200);
        const expected = await response.text();
        const actual = renderPreview(profile, variantIndex % 2 ? `?${query}` : query, avatar.data);
        // Never print embedded font payloads on a failed assertion.
        assert.ok(actual === expected, `${username} variant ${variantIndex}: ${digest(actual)} != ${digest(expected)}`);
        const visible = variant.avatar !== 'false' && (social || variant.header !== 'false');
        assert.equal(actual.includes('<image '), photo && visible);
      }
    }
  } finally { globalThis.fetch = saved; }
});

test('preview and server retain identical validator, renderer and error identities', () => {
  assert.equal(serverOptions.queryOptions, queryOptions);
  assert.equal(serverOptions.ProfileError, ProfileError);
  assert.equal(serverOptions.DEFAULT_COLORS, DEFAULT_COLORS);
  assert.equal(serverCard, renderCard);
  assert.equal(serverSocial, renderSocial);
  const profile = { userName: 'example', name: 'Example', badges: [] };
  for (const query of ['username=other', 'username=example&username=example', 'username=Example', 'username=example&size=320', 'username=example&foreground=bad', 'username=example&avatar=yes', 'username=example&layout=unknown', 'username=example&event=asia-2027', 'username=example&layout=avatar&event=unknown', 'username=example&omitTeams=', 'username=example&omitSocial=BAD', 'username=example&name=false&name=true']) {
    assert.throws(() => renderPreview(profile, query), ProfileError);
  }
  for (const input of [null, undefined, {}, new URLSearchParams('username=example')]) assert.throws(() => renderPreview(profile, input), ProfileError);
  assert.throws(() => renderPreview(null, 'username=example'), { code: 'profile_mismatch' });
  for (const data of ['https://evil.test/photo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,abc" onload="evil']) for (const layout of layouts) assert.equal(renderPreview(profile, `username=example&layout=${layout}`, data).includes('<image '), false);
});

test('font module bytes and style hash are unchanged', async () => {
  assert.equal(digest(await readFile(new URL('../shared/fonts.js', import.meta.url))), 'f10954f825f8e2939730309f86cf9546b5c91b6298df7e5e50d0a64fd8bef2aa');
  assert.equal(FONT_STYLE_HASH, 'sha256-' + createHash('sha256').update(FONT_CSS).digest('base64'));
});

test('browser module graph runs without fetch, linkedom, Node or DOM globals', () => {
  const directory = fileURLToPath(new URL('../shared/', import.meta.url));
  const script = `
    import { SourceTextModule, createContext } from 'node:vm';
    import { readFile } from 'node:fs/promises';
    import { createHash } from 'node:crypto';
    const root = ${JSON.stringify(directory)};
    const allowed = ['preview.js', 'options.js', 'svg.js', 'social.js', 'fonts.js', 'events.js', 'event-fonts.js', 'event-themes.js'];
    const context = createContext({ URL });
    const modules = new Map();
    for (const name of allowed) modules.set(name, new SourceTextModule(await readFile(root + name, 'utf8'), { context, identifier: name }));
    const entry = modules.get('preview.js');
    await entry.link(specifier => {
      if (!specifier.startsWith('./') || !modules.has(specifier.slice(2))) throw new Error('Non-shared dependency: ' + specifier);
      return modules.get(specifier.slice(2));
    });
    await entry.evaluate();
    const results = ${JSON.stringify(layouts)}.map(layout => createHash('sha256').update(entry.namespace.renderPreview({ userName: 'example', name: 'Zoë 李', badges: [] }, 'username=example&layout=' + layout)).digest('hex'));
    console.log(JSON.stringify(results));
  `;
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), layouts.map(layout => digest(renderPreview({ userName: 'example', name: 'Zoë 李', badges: [] }, `username=example&layout=${layout}`))));
});
