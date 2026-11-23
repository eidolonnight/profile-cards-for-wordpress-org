import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom/worker';
import { createHash } from 'node:crypto';
import { queryOptions } from '../functions/_profile.js';
import { EVENTS, ROLES } from '../functions/_events.js';
import { GET as eventsGET } from '../functions/events.js';
import { renderSocial } from '../functions/_social.js';
import { eventFrameData } from './frame-artwork.mjs';
import { EVENT_FRAMES } from '../events/frames.js';
import { measureEventText, EVENT_FONT_METRICS, EVENT_FONT_CSS, EVENT_FONT_STYLE_HASH } from '../shared/event-fonts.js';
import { FONT_CSS, FONT_STYLE_HASH } from '../functions/_fonts.js';

const q = (params = {}) => queryOptions(new Request(`https://cards.test/card?${new URLSearchParams({ username: 'synthetic', layout: 'avatar', ...params })}`));
const profile = { name: 'Ada Example', userName: 'synthetic', badges: [{ name: 'SECRET BADGE' }], teams: ['SECRET TEAM'], location: 'SECRET LOCATION', jobTitle: 'SECRET JOB', profileUrl: 'https://example.test/private' };
const png = 'data:image/png;base64,iVBORw0KGgo=';
const doc = svg => parseHTML(svg).document;
// Every avatar frame needs that edition and role's generated artwork payload.
const frameFor = options => options.layout === 'avatar' ? eventFrameData(options.event, options.role) : null;
const render = (person, options, avatar) => renderSocial(person, options, avatar, frameFor(options));
// A base64 payload can contain any short word by chance; check text outside it.
const outsideFrame = (svg, options) => frameFor(options) ? svg.replace(frameFor(options), '') : svg;
const outsidePayloads = (svg, options) => outsideFrame(svg, options).replace(EVENT_FONT_CSS[options.event], '');
const everyRole = ['attendee','speaker','volunteer','organizer','sponsor','mediapartner'];

test('social catalogue has the exact verified event and role interfaces', async () => {
  // WordCamp US has no edition yet, so it is not offered.
  assert.deepEqual(EVENTS.map(e => e.id), ['asia-2027', 'europe-2027', 'india-2027']);
  for (const event of EVENTS) {
    assert.deepEqual(Object.keys(event).sort(), ['id','name','year','label','dateLabel','location','url','note','checkedAt','colors','styleNote', ...(Object.hasOwn(EVENT_FRAMES, event.id) ? ['frameRoles'] : [])].sort());
    assert.equal(event.year, 2027); assert.equal(event.checkedAt, '2026-10-01');
    assert.equal(event.label, event.name);
    assert.match(event.url, /\/2027\/$/);
  }
  assert.deepEqual(EVENTS.map(e => [e.dateLabel, e.location]), [['9–11 April 2027', 'Penang, Malaysia'], ['27–29 May 2027', 'Málaga'], ['Late 2027', '']]);
  assert.deepEqual(ROLES, [
    { id:'attendee', label:'Attending', statement:"I'm attending" },
    { id:'speaker', label:'Speaking', statement:"I'm speaking" },
    { id:'volunteer', label:'Volunteering', statement:"I'm volunteering" },
    { id:'organizer', label:'Organizing', statement:"I'm organizing" },
    { id:'sponsor', label:'Sponsoring', statement:"I'm sponsoring" },
    { id:'mediapartner', label:'Media Partner', statement:"I'm a media partner" }
  ]);
  // Every edition has avatar-frame artwork for every role.
  assert.deepEqual(EVENTS.map(e => e.frameRoles), EVENTS.map(() => everyRole));
  for (const event of EVENTS) assert.ok(Object.isFrozen(event.frameRoles));
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
    // The profile photo is part of every WordCamp graphic.
    assert.throws(() => q({ layout, avatar:'false' }), { code:'invalid_option' });
  }
  // Avatar frames are round unless square is requested; no other layout has a shape.
  assert.equal(q().shape, 'circle'); assert.equal(q({ shape:'circle' }).shape, 'circle'); assert.equal(q({ shape:'square' }).shape, 'square');
  assert.equal(Object.hasOwn(q({ layout:'announcement' }), 'shape'), false);
  for (const value of ['', 'Circle', 'round', 'square ', 'true']) assert.throws(() => q({ shape:value }), { code:'invalid_option' });
  for (const layout of ['classic', 'profile', 'square', 'announcement']) assert.throws(() => q({ layout, shape:'circle' }), { code:'invalid_parameter' });
  assert.throws(() => queryOptions(new Request('https://cards.test/card?username=synthetic&shape=square')), { code:'invalid_parameter' });
  for (const layout of ['classic', 'profile']) for (const [key, value] of [['event','asia-2027'], ['role','attendee'], ['eventDetails','false']]) assert.throws(() => q({ layout, [key]:value }), { code:'invalid_parameter' });
  for (const key of ['avatar', 'name']) assert.throws(() => q({ layout:'announcement', [key]:'false' }), { code:'invalid_option' });
  assert.throws(() => queryOptions(new Request('https://cards.test/card?username=synthetic&event=asia-2027')), { code:'invalid_parameter' });
  for (const [key, values] of Object.entries({ event:['', 'ASIA-2027', 'https://asia.wordcamp.org/2027/', 'asia-2027\n'], role:['', 'Speaker', 'official', 'attendee '], eventDetails:['', '1', 'yes', 'TRUE'], layout:['Avatar', 'social'] })) for (const value of values) assert.throws(() => q({ [key]:value }), { code:'invalid_option' });
  for (const suffix of ['event=asia-2027&event=asia-2027', 'role=speaker&role=attendee', 'shape=circle&shape=circle', 'eventDetails=true&eventDetails=false', 'size=1024', 'avatarUrl=https://evil.test/a']) assert.throws(() => queryOptions(new Request(`https://cards.test/card?username=synthetic&layout=avatar&${suffix}`)), { code:'invalid_parameter' });
});

for (const event of ['asia-2027','europe-2027','india-2027']) for (const role of everyRole) for (const [layout, shape] of [['avatar', 'circle'], ['avatar', 'square'], ['announcement', null]]) {
  test(`social matrix ${event}/${role}/${shape ? `${layout}/${shape}` : layout}`, () => {
    const options = q({ event, role, layout, ...(shape ? { shape } : {}) });
    const artwork = layout === 'avatar';
    const svg = render(profile, options, png); const d = doc(svg); const root = d.querySelector('svg');
    assert.equal(root.getAttribute('width'), '1080'); assert.equal(root.getAttribute('height'), layout === 'avatar' ? '1080' : '1350');
    assert.equal(root.getAttribute('data-layout'), layout); assert.equal(root.getAttribute('data-shape'), shape);
    const eventData = EVENTS.find(e => e.id === event);
    assert.ok(root.textContent.includes(eventData.name));
    if (artwork) assert.equal(d.querySelector('[data-field="event"], [data-field="role"], text, textPath'), null, 'frame artwork carries its own lettering');
    else assert.equal(d.querySelector('[data-field="event"]').textContent.toLowerCase(), eventData.name.toLowerCase());
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
    assert.doesNotMatch(outsideFrame(svg, options), /SECRET|https:\/\/example/);
    assert.equal(d.querySelectorAll('[data-field="frame"]').length, artwork ? 1 : 0);
    if (artwork) {
      const { photo } = EVENT_FRAMES[event]; const frame = d.querySelector('image[data-field="frame"]');
      assert.equal(frame.getAttribute('href'), eventFrameData(event, role));
      assert.equal(frame.getAttribute('width'), '1080'); assert.equal(frame.getAttribute('height'), '1080');
      const avatar = d.querySelector('[data-field="avatar"]');
      assert.equal(avatar.nextElementSibling, frame, 'artwork overlays the photo');
      assert.equal(frame.nextElementSibling, null);
      assert.equal(d.querySelector('rect, [data-field="ring"], #social-frame'), null);
      // Circle crops photo and artwork together to the inscribed circle; square keeps the full artwork.
      const cropped = d.querySelector('#social-shape circle');
      if (shape === 'circle') {
        assert.deepEqual(['cx', 'cy', 'r'].map(key => cropped.getAttribute(key)), ['540', '540', '540']);
        assert.equal(frame.parentNode.getAttribute('clip-path'), 'url(#social-shape)');
        assert.equal(root.lastElementChild, frame.parentNode);
      } else { assert.equal(cropped, null); assert.equal(frame.parentNode, root); }
      const clip = d.querySelector('#social-photo circle');
      for (const key of ['cx', 'cy', 'r']) assert.equal(clip.getAttribute(key), String(photo[key]));
      const image = d.querySelector('[data-field="avatar"] image');
      assert.equal(image.getAttribute('x'), String(photo.x)); assert.equal(image.getAttribute('width'), String(photo.size));
    }
  });
}

test('social omissions keep required announcement identity while hiding optional content', () => {
  for (const event of ['asia-2027', 'europe-2027']) for (const layout of ['avatar','announcement']) {
    const options = q({ event, layout, ...(layout === 'avatar' ? { name:'false' } : {}), handle:'false', eventDetails:'false', header:'false', badges:'true', link:'true', teams:'true' });
    const svg = render(profile, options, png); const d = doc(svg);
    assert.equal(d.querySelector('[data-field="handle"], [data-field="eventDetails"]'), null);
    assert.doesNotMatch(outsidePayloads(svg, options), /synthetic|Penang|M\u00e1laga|April|May|2026-10-01|SECRET|https:\/\/(?:asia|europe)/);
    if (layout === 'avatar') {
      assert.ok(d.querySelector('[data-field="avatar"] image'));
      assert.equal(d.querySelector('[data-field="name"], text'), null);
      assert.doesNotMatch(outsidePayloads(svg, options), /Ada|Example/);
      assert.equal(d.querySelector('rect'), null);
    } else {
      assert.ok(d.querySelector('[data-field="avatar"] image'));
      assert.equal(d.querySelector('[data-field="name"]').textContent, profile.name);
    }
    const visible = doc(render(profile, q({ event, layout, header:'false', teams:'false', badges:'false', link:'false' }), png));
    assert.ok(visible.querySelector('[data-field="avatar"] image'));
    assert.equal(Boolean(visible.querySelector('[data-field="name"]')), layout === 'announcement');
  }
});

test('avatar frames are the photo under the artwork and nothing else, in either shape', () => {
  for (const event of ['asia-2027', 'europe-2027']) for (const shape of ['circle', 'square']) {
    const options = q({ event, shape });
    const d = doc(render({ ...profile, name:'A' + '\u0301'.repeat(100) }, options, png));
    assert.equal(d.querySelector('rect, text, textPath, [data-field="name"], [data-field="handle"], [data-field="eventDetails"]'), null);
    assert.doesNotMatch(d.querySelector('svg').textContent, /Ada Example|@synthetic|Penang|\u0301/);
    assert.deepEqual([...d.querySelectorAll('image')].map(node => node.getAttribute('data-field') || node.parentNode.getAttribute('data-field')), ['avatar', 'frame']);
    assert.deepEqual([...d.querySelector('svg').children].map(node => node.localName), shape === 'circle' ? ['title', 'desc', 'style', 'defs', 'g'] : ['title', 'desc', 'style', 'g', 'image']);
    // The renderer accepts only the two shapes, also from a direct caller.
    for (const bad of ['oval', '', null, 'circle" onload="x']) assert.throws(() => renderSocial(profile, { ...options, shape: bad }, png, frameFor(options)), { code:'invalid_option' });
  }
});

test('all valid social visibility combinations preserve unrelated fields', () => {
  for (const event of ['asia-2027', 'europe-2027']) for (const layout of ['avatar','announcement']) {
    const flags = layout === 'announcement' ? ['handle','eventDetails'] : ['name','handle','eventDetails'];
    for (let mask=0;mask<(1 << flags.length);mask++) {
      const params=Object.fromEntries(flags.map((key,i) => [key,String(Boolean(mask & (1 << i)))]));
      const options=q({event,layout,...params});
      const svg=outsideFrame(render(profile,options,null),options); const d=doc(svg);
      for (const key of ['avatar','name','handle','eventDetails']) {
        const expected = layout === 'announcement' ? ['avatar','name'].includes(key) || params[key] === 'true' : key === 'avatar';
        assert.equal(Boolean(d.querySelector(`[data-field="${key}"]`)), expected, `${layout}/${mask}/${key}`);
      }
      if(params.name==='false') assert.doesNotMatch(svg,/Ada Example|>AE</);
      if(params.handle==='false') assert.doesNotMatch(svg,/@synthetic/);
      if (layout === 'avatar') assert.ok(d.querySelector('image[data-field="frame"]'));
      else { assert.ok(d.querySelector('[data-field="event"]'));assert.ok(d.querySelector('[data-field="role"]')); }
    }
  }
});

test('unavailable photos use initials, never an external image or invented photo', () => {
  for (const event of ['asia-2027', 'europe-2027']) for (const layout of ['avatar','announcement']) for (const value of [null, 'https://evil.test/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,x" onload="alert(1)']) {
    const d = doc(render(profile, q({ event, layout }), value));
    assert.equal(d.querySelector('image:not([data-field="frame"])'), null); assert.ok(d.querySelector('[data-field="avatar"]').textContent.includes('AE'));
  }
  for (const event of ['asia-2027', 'europe-2027']) {
    const options = q({ event, name:'false', handle:'false' });
    assert.doesNotMatch(outsidePayloads(render(profile, options, null), options), />AE</);
  }
});

test('long hostile Unicode identities stay bounded, XML-safe and omission-safe', () => {
  const hostile = { ...profile, name: '<script>&\"\'\u0000\ud800\ufffe' + '漢😀W'.repeat(300), userName:'<handle>&' + 'W'.repeat(500) };
  for (const layout of ['avatar','announcement']) {
    const svg = render(hostile, q({ layout }), null); const d = doc(svg);
    assert.doesNotMatch(svg, /[\u0000\ud800\ufffe]/u); assert.equal(d.querySelector('script, handle'), null);
    for (const node of d.querySelectorAll('[data-field="name"] text, [data-field="handle"] text')) {
      const size = Number(node.getAttribute('font-size')); const max = Number(node.getAttribute('data-max-width'));
      assert.ok(max > 0); assert.ok(measureEventText(node.textContent, size, EVENT_FONT_METRICS[node.getAttribute('data-face')]) <= max + 0.01);
    }
    if (layout === 'announcement') assert.ok(d.querySelector('[data-field="name"]').textContent.includes('…'));
    const omissionSafe = render(hostile, q({ layout, ...(layout === 'avatar' ? { name:'false' } : {}), handle:'false' }), null);
    assert.doesNotMatch(omissionSafe, layout === 'avatar' ? /&lt;script|&lt;handle|漢/ : /&lt;handle/);
  }
});

test('social colors are inherited and missing event details are never fabricated', () => {
  for (const palette of [{foreground:'191E23', headerColor:'FFFFFF', nameColor:'EEEEEE', subHeaderColor:'CCCCCC'}, {foreground:'ABCDEF',headerColor:'123456',nameColor:'654321',subHeaderColor:'FEDCBA'}]) {
    const d = doc(renderSocial(profile, q({ layout:'announcement', ...palette }), png));
    assert.equal(d.querySelector('rect').getAttribute('fill'), '#' + palette.foreground);
    for (const [field,color] of [['name','nameColor'],['eventDetails','subHeaderColor']]) assert.equal(d.querySelector(`[data-field="${field}"] text`).getAttribute('fill'), '#' + palette[color]);
  }
  // An edition with no announced location shows only what is known.
  const india = doc(renderSocial(profile, q({ layout:'announcement',event:'india-2027' }), png));
  assert.equal(india.querySelector('[data-field="eventDetails"]').textContent, 'Late 2027');
  // An edition that is not offered is refused, in both formats and by the renderer itself.
  for (const layout of ['avatar', 'announcement']) {
    assert.throws(() => q({ layout, event:'us-2027' }), { code:'invalid_option' });
    assert.throws(() => renderSocial(profile, { layout, event:'us-2027' }, png), { code:'invalid_option' });
  }
  assert.equal(FONT_STYLE_HASH, `sha256-${createHash('sha256').update(FONT_CSS).digest('base64')}`);
});
