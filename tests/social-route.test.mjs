import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { GET } from '../functions/card.js';
import { EVENT_FONT_CSS, EVENT_FONT_STYLE_HASH } from '../shared/event-fonts.js';
const FONT_CSS = EVENT_FONT_CSS['europe-2027'];
const FONT_STYLE_HASH = EVENT_FONT_STYLE_HASH['europe-2027'];

const html = hash => `<header class="site-header"><h2>Synthetic Person</h2><img class="avatar" src="https://secure.gravatar.com/avatar/${hash}"></header>`;
const request = params => new Request(`https://cards.test/card?${new URLSearchParams(params)}`);

test('social card route uses 1024 photos despite header=false; CSP and attachment identity are exact', async () => {
  const saved = globalThis.fetch;
  try {
    for (const [index,layout] of ['avatar','announcement'].entries()) {
      const calls=[]; const hash=String(index+1).repeat(32); const username=`social-card-${layout}`;
      globalThis.fetch=async url => { calls.push(url); return url.startsWith('https://profiles.wordpress.org/') ? new Response(html(hash),{headers:{'Content-Type':'text/html'}}) : new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'Content-Type':'image/png'}}); };
      const response=await GET(request({username,layout,event:'europe-2027',role:'speaker',header:'false'}));
      assert.equal(response.status,200); assert.equal(response.headers.get('X-Profile-Avatar'),'embedded');
      assert.deepEqual(calls,[`https://profiles.wordpress.org/${username}/`,`https://secure.gravatar.com/avatar/${hash}?s=1024&d=404&r=g`]);
      assert.equal(response.headers.get('Content-Disposition'),`inline; filename="${username}-europe-2027-${layout}.svg"`);
      assert.equal(response.headers.get('Content-Security-Policy'),`default-src 'none'; img-src data:; font-src data:; style-src '${FONT_STYLE_HASH}'; base-uri 'none'; frame-ancestors 'none'`);
      assert.equal(response.headers.get('Cache-Control'),'private, no-store'); assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff'); assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');
      const d=parseHTML(await response.text()).document; assert.equal(d.querySelector('style').textContent,FONT_CSS); assert.ok(d.querySelector('image'));
    }
  } finally {globalThis.fetch=saved;}
});

test('social route headers truthfully distinguish hidden and initials, with no hidden fetch', async () => {
  const saved=globalThis.fetch;
  try {
    for (const layout of ['avatar','announcement']) for (const avatar of ['true','false']) {
      const calls=[];
      globalThis.fetch=async url => {calls.push(url);return url.startsWith('https://profiles.wordpress.org/')?new Response(html('e'.repeat(32)),{headers:{'Content-Type':'text/html'}}):new Response('',{status:404});};
      const response=await GET(request({username:`missing-${layout}-${avatar}`,layout,avatar,header:'false'}));
      assert.equal(response.status,200); assert.equal(response.headers.get('X-Profile-Avatar'),avatar==='true'?'initials':'hidden');
      assert.equal(calls.length,avatar==='true'?2:1); const d=parseHTML(await response.text()).document;assert.equal(d.querySelector('image'),null);
      assert.equal(Boolean(d.querySelector('[data-field="avatar"]')),avatar==='true');
    }
  } finally {globalThis.fetch=saved;}
});

test('both social layouts share one high-resolution avatar cache', async () => {
  const saved=globalThis.fetch; const calls=[];
  globalThis.fetch=async url => { calls.push(url);return url.startsWith('https://profiles.wordpress.org/')?new Response(html('a'.repeat(32)),{headers:{'Content-Type':'text/html'}}):new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'Content-Type':'image/png'}}); };
  try {
    for(const layout of ['avatar','announcement']) {
      const response=await GET(request({username:'social-shared-photo',layout}));
      assert.equal(response.status,200);assert.equal(response.headers.get('X-Profile-Avatar'),'embedded');await response.text();
    }
    assert.deepEqual(calls,['https://profiles.wordpress.org/social-shared-photo/',`https://secure.gravatar.com/avatar/${'a'.repeat(32)}?s=1024&d=404&r=g`]);
  } finally {globalThis.fetch=saved;}
});

test('invalid social route queries fail before fetching and use private error headers', async () => {
  const saved=globalThis.fetch; let calls=0;globalThis.fetch=async () => {calls++;throw new Error('must not fetch');};
  try {
    for (const params of [{layout:'profile',event:'asia-2027'},{layout:'avatar',role:'official'},{layout:'announcement',event:'unknown'},{layout:'avatar',eventDetails:'yes'}]) {
      const response=await GET(request({username:'synthetic',...params}));assert.equal(response.status,400);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    }
    assert.equal(calls,0);
  } finally {globalThis.fetch=saved;}
});
