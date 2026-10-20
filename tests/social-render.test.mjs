import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { createHash } from 'node:crypto';
import { queryOptions } from '../functions/_profile.js';
import { EVENTS, ROLES } from '../functions/_events.js';
import { GET as eventsGET } from '../functions/events.js';
import { renderSocial } from '../functions/_social.js';
import { measureEventText, EVENT_FONT_METRICS, EVENT_FONT_CSS, EVENT_FONT_STYLE_HASH } from '../shared/event-fonts.js';
import { FONT_CSS, FONT_STYLE_HASH } from '../functions/_fonts.js';

const q = (params = {}) => queryOptions(new Request(`https://cards.test/card?${new URLSearchParams({ username: 'synthetic', layout: 'avatar', ...params })}`));
const profile = { name: 'Ada Example', userName: 'synthetic', badges: [{ name: 'SECRET BADGE' }], teams: ['SECRET TEAM'], location: 'SECRET LOCATION', jobTitle: 'SECRET JOB', profileUrl: 'https://example.test/private' };
const png = 'data:image/png;base64,iVBORw0KGgo=';
const doc = svg => parseHTML(svg).document;

test('social catalogue has the exact verified event and role interfaces', async () => {
  assert.deepEqual(EVENTS.map(e => e.id), ['asia-2027', 'europe-2027', 'us-2027', 'india-2027']);
  for (const event of EVENTS) {
    assert.deepEqual(Object.keys(event).sort(), ['id','name','year','label','dateLabel','location','url','note','checkedAt','colors','styleNote'].sort());
    assert.equal(event.year, 2027); assert.equal(event.checkedAt, '2026-10-01');
    assert.equal(event.label, event.name);
    assert.match(event.url, /\/2027\/$/);
  }
  assert.deepEqual(EVENTS.map(e => [e.dateLabel, e.location]), [['9–11 April 2027', 'Penang, Malaysia'], ['27–29 May 2027', 'Málaga'], ['', ''], ['Late 2027', '']]);
  assert.deepEqual(ROLES, [
    { id:'attendee', label:'Attending', statement:"I'm attending" },
    { id:'speaker', label:'Speaking', statement:"I'm speaking" },
    { id:'volunteer', label:'Volunteering', statement:"I'm volunteering" },
    { id:'organizer', label:'Organizing', statement:"I'm organizing" },
    { id:'sponsor', label:'Sponsoring', statement:"I'm sponsoring" }
  ]);
  const response = await eventsGET(new Request('https://cards.test/events'));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { events: EVENTS, roles: ROLES });
  for (const [key, value] of Object.entries({ 'cache-control':'private, no-store', 'x-content-type-options':'nosniff', 'x-robots-tag':'noindex, nofollow' })) assert.equal(response.headers.get(key), value);
  for (const suffix of ['?event=asia-2027', '?x=1&x=2', '?username=synthetic']) assert.equal((await eventsGET(new Request('https://cards.test/events' + suffix))).status, 400);
});

test('social defaults and strict query parsing preserve old layout contracts', () => {
  for (const layout of ['avatar', 'announcement']) {
    const options = q({ layout });
    assert.equal(options.event, 'asia-2027'); assert.equal(options.role, 'attendee');
    for (const flag of ['avatar', 'name', 'handle', 'eventDetails']) assert.equal(options[flag], true);
    assert.equal(q({ layout, eventDetails:'false' }).eventDetails, false);
  }
  for (const layout of ['classic', 'profile']) for (const [key, value] of [['event','asia-2027'], ['role','attendee'], ['eventDetails','false']]) assert.throws(() => q({ layout, [key]:value }), { code:'invalid_parameter' });
  assert.throws(() => queryOptions(new Request('https://cards.test/card?username=synthetic&event=asia-2027')), { code:'invalid_parameter' });
  for (const [key, values] of Object.entries({ event:['', 'ASIA-2027', 'https://asia.wordcamp.org/2027/', 'asia-2027\n'], role:['', 'Speaker', 'official', 'attendee '], eventDetails:['', '1', 'yes', 'TRUE'], layout:['Avatar', 'social'] })) for (const value of values) assert.throws(() => q({ [key]:value }), { code:'invalid_option' });
  for (const suffix of ['event=asia-2027&event=asia-2027', 'role=speaker&role=attendee', 'eventDetails=true&eventDetails=false', 'size=1024', 'avatarUrl=https://evil.test/a']) assert.throws(() => queryOptions(new Request(`https://cards.test/card?username=synthetic&layout=avatar&${suffix}`)), { code:'invalid_parameter' });
});

for (const event of ['asia-2027','europe-2027','us-2027','india-2027']) for (const role of ['attendee','speaker','volunteer','organizer','sponsor']) for (const layout of ['avatar','announcement']) {
  test(`social matrix ${event}/${role}/${layout}`, () => {
    const svg = renderSocial(profile, q({ event, role, layout }), png); const d = doc(svg); const root = d.querySelector('svg');
    assert.equal(root.getAttribute('width'), '1080'); assert.equal(root.getAttribute('height'), layout === 'avatar' ? '1080' : '1350');
    assert.equal(root.getAttribute('data-layout'), layout);
    const eventData = EVENTS.find(e => e.id === event);
    assert.ok(root.textContent.includes(eventData.name));
    assert.equal(d.querySelector('[data-field="event"]').textContent.toLowerCase(), eventData.name.toLowerCase());
    assert.doesNotMatch(d.querySelector('svg > title').textContent, /20\d{2}/);
    const details = d.querySelector('[data-field="eventDetails"]');
    if (layout === 'announcement' && (eventData.dateLabel || eventData.location)) {
      assert.ok(details);
      for (const value of [eventData.dateLabel, eventData.location].filter(Boolean)) assert.ok(details.textContent.includes(value));
    } else assert.equal(details, null);
    assert.ok(root.textContent.includes(ROLES.find(r => r.id === role).statement));
    assert.ok(d.querySelector('[data-field="avatar"] image'));
    for (const field of ['name', 'handle']) assert.equal(Boolean(d.querySelector(`[data-field="${field}"]`)), layout === 'announcement');
    assert.equal(d.querySelector('style').textContent, EVENT_FONT_CSS[event]);
    assert.equal(d.querySelector('script, foreignObject, a, [style]'), null);
    for (const node of d.querySelectorAll('[href]')) assert.match(node.getAttribute('href'), /^(?:#|data:image\/)/);
    assert.doesNotMatch(svg, /SECRET|https:\/\/example/);
    if (layout === 'avatar') {
      assert.equal(d.querySelector('rect'), null);
      const ring = d.querySelector('[data-field="ring"]'); assert.equal(ring.getAttribute('fill'), 'none');
      assert.ok(Number(ring.getAttribute('r')) + Number(ring.getAttribute('stroke-width')) / 2 <= 540);
      assert.equal(d.querySelector('clipPath circle').getAttribute('r'), '400');
    }
  });
}

test('social omissions do not leak names, handles, metadata or old fields', () => {
  for (const layout of ['avatar','announcement']) {
    const options = q({ layout, avatar:'false', name:'false', handle:'false', eventDetails:'false', header:'false', badges:'true', link:'true', teams:'true' });
    const svg = renderSocial(profile, options, png); const d = doc(svg);
    assert.equal(d.querySelector('[data-field="avatar"], [data-field="name"], [data-field="handle"], [data-field="eventDetails"], image'), null);
    assert.doesNotMatch(svg, /Ada|Example|synthetic|Penang|April|2026-10-01|SECRET|https:\/\/asia/);
    if (layout === 'avatar') {
      assert.equal(d.querySelector('rect'), null);
      for (const circle of d.querySelectorAll('circle')) assert.equal(circle.getAttribute('fill'), 'none');
    }
    const visible = doc(renderSocial(profile, q({ layout, header:'false', teams:'false', badges:'false', link:'false' }), png));
    assert.ok(visible.querySelector('[data-field="avatar"] image'));
    assert.equal(Boolean(visible.querySelector('[data-field="name"]')), layout === 'announcement');
  }
});

test('hidden avatar produces a transparent-center overlay even with default identities', () => {
  const d = doc(renderSocial(profile, q({ avatar:'false' }), png));
  assert.equal(d.querySelector('image, rect, [data-field="avatar"], [data-field="name"], [data-field="handle"], [data-field="eventDetails"]'), null);
  assert.doesNotMatch(d.querySelector('svg').textContent, /Ada Example|@synthetic|Penang/);
  for (const circle of d.querySelectorAll('circle')) assert.equal(circle.getAttribute('fill'), 'none');
  for (const path of d.querySelectorAll('textPath')) assert.ok(path.getAttribute('href').startsWith('#'));
});

test('frame text is clipped to the annulus, including hostile combining marks', () => {
  const d = doc(renderSocial({ ...profile, name:'A' + '\u0301'.repeat(100) }, q({ avatar:'false' }), null));
  const clip = d.querySelector('clipPath#social-frame path');
  assert.ok(clip); assert.equal(clip.getAttribute('clip-rule'), 'evenodd');
  assert.match(clip.getAttribute('d'), /526 526/); assert.match(clip.getAttribute('d'), /400 400/);
  for (const field of ['ring','event','role']) assert.ok(d.querySelector(`[clip-path="url(#social-frame)"] [data-field="${field}"]`));
  assert.equal(d.querySelector('[data-field="name"], [data-field="handle"], [data-field="eventDetails"]'), null);
});

test('all independent social visibility combinations preserve unrelated fields', () => {
  const flags = ['avatar','name','handle','eventDetails'];
  for (const layout of ['avatar','announcement']) for (let mask=0;mask<16;mask++) {
    const params=Object.fromEntries(flags.map((key,i) => [key,String(Boolean(mask & (1 << i)))]));
    const svg=renderSocial(profile,q({layout,...params}),null); const d=doc(svg);
    for (const key of flags) assert.equal(Boolean(d.querySelector(`[data-field="${key}"]`)),params[key]==='true' && (layout==='announcement' || key==='avatar'),`${layout}/${mask}/${key}`);
    if(params.name==='false') assert.doesNotMatch(svg,/Ada Example|>AE</);
    if(params.handle==='false') assert.doesNotMatch(svg,/@synthetic/);
    assert.ok(d.querySelector('[data-field="event"]'));assert.ok(d.querySelector('[data-field="role"]'));
  }
});

test('unavailable photos use initials, never an external image or invented photo', () => {
  for (const layout of ['avatar','announcement']) for (const value of [null, 'https://evil.test/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,x" onload="alert(1)']) {
    const d = doc(renderSocial(profile, q({ layout }), value));
    assert.equal(d.querySelector('image'), null); assert.ok(d.querySelector('[data-field="avatar"]').textContent.includes('AE'));
  }
  const hiddenIdentity = renderSocial(profile, q({ name:'false', handle:'false' }), null);
  assert.doesNotMatch(hiddenIdentity, />AE</);
});

test('long hostile Unicode identities stay bounded, XML-safe and omission-safe', () => {
  const hostile = { ...profile, name: '<script>&\"\'\u0000\ud800\ufffe' + '漢😀W'.repeat(300), userName:'<handle>&' + 'W'.repeat(500) };
  for (const layout of ['avatar','announcement']) {
    const svg = renderSocial(hostile, q({ layout }), null); const d = doc(svg);
    assert.doesNotMatch(svg, /[\u0000\ud800\ufffe]/u); assert.equal(d.querySelector('script, handle'), null);
    for (const node of d.querySelectorAll('[data-field="name"] text, [data-field="handle"] text')) {
      const size = Number(node.getAttribute('font-size')); const max = Number(node.getAttribute('data-max-width'));
      assert.ok(max > 0); assert.ok(measureEventText(node.textContent, size, EVENT_FONT_METRICS[node.getAttribute('data-face')]) <= max + 0.01);
    }
    if (layout === 'announcement') assert.ok(d.querySelector('[data-field="name"]').textContent.includes('…'));
    assert.doesNotMatch(renderSocial(hostile, q({ layout, name:'false', handle:'false' }), null), /&lt;script|&lt;handle|漢/);
  }
});

test('social colors are inherited and missing event details are never fabricated', () => {
  for (const palette of [{foreground:'191E23', headerColor:'FFFFFF', nameColor:'EEEEEE', subHeaderColor:'CCCCCC'}, {foreground:'ABCDEF',headerColor:'123456',nameColor:'654321',subHeaderColor:'FEDCBA'}]) {
    const d = doc(renderSocial(profile, q({ layout:'announcement', ...palette }), png));
    assert.equal(d.querySelector('rect').getAttribute('fill'), '#' + palette.foreground);
    for (const [field,color] of [['name','nameColor'],['eventDetails','subHeaderColor']]) assert.equal(d.querySelector(`[data-field="${field}"] text`).getAttribute('fill'), '#' + palette[color]);
  }
  const us = doc(renderSocial(profile, q({ layout:'announcement',event:'us-2027' }), png));
  assert.equal(us.querySelector('[data-field="eventDetails"]'), null);
  const india = doc(renderSocial(profile, q({ layout:'announcement',event:'india-2027' }), png));
  assert.equal(india.querySelector('[data-field="eventDetails"]').textContent, 'Late 2027');
  assert.equal(FONT_STYLE_HASH, `sha256-${createHash('sha256').update(FONT_CSS).digest('base64')}`);
});
