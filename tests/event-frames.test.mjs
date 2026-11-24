import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync, crc32 } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EVENTS, ROLES } from '../events/catalog.js';
import { EVENT_FRAMES } from '../events/frames.js';
import { loadEventFrame, eventFramePath } from '../events/frame-loader.js';
import { FRAME_FILES } from '../tools/browser-modules.mjs';
import { eventFrameData, eventFrameBytes, frameFetch } from './frame-artwork.mjs';
import { ProfileError } from '../shared/options.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const tool = join(root, 'tools/build-event-frames.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (entry, ...args) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 60000 });
const folders = ['wordcamp-asia', 'wordcamp-europe', 'wordcamp-india'];
const manifests = async () => {
  const found = [];
  for (const folder of folders) {
    try { found.push([folder, JSON.parse(await readFile(join(root, 'events', folder, 'frames/manifest.json'), 'utf8'))]); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return found;
};
// The project's own stand-in frames say so in their source record.
const interim = manifest => /^Interim frames drawn by this project/.test(manifest.source);

test('the generated frame registry is current for the committed manifests and artwork', () => {
  const result = run(tool, '--check');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'check');
  assert.deepEqual(report.editions, Object.keys(EVENT_FRAMES));
  assert.equal(report.frames, Object.values(EVENT_FRAMES).reduce((sum, frames) => sum + Object.keys(frames.roles).length, 0));
  assert.deepEqual(report.written, []);
});

test('manifest, artwork, registry and published files agree byte for byte', async () => {
  const seen = []; const published = [];
  for (const [folder, manifest] of await manifests()) {
    assert.deepEqual(Object.keys(manifest), ['editions', 'source', 'rights', 'assets']);
    // Organizer artwork is never relabeled as project-licensed, and the project's own
    // interim frames never pose as organizer artwork or an official endorsement.
    if (interim(manifest)) {
      assert.match(manifest.source, /Not supplied by the event's organizers or designers\./);
      assert.match(manifest.rights, /not official event artwork/);
    } else assert.match(manifest.rights, /not relicensed under the project's GPL/);
    assert.ok(manifest.source.length > 20);
    const directory = join(root, 'events', folder, 'frames');
    const assets = new Map(manifest.assets.map(item => [item.path, item]));
    assert.equal(assets.size, manifest.assets.length);
    assert.deepEqual((await readdir(directory)).sort(), ['manifest.json', ...assets.keys()].sort(), 'no unlisted files beside the manifest');
    for (const [edition, entry] of Object.entries(manifest.editions)) {
      seen.push(edition);
      const event = EVENTS.find(item => item.id === edition);
      assert.ok(event, edition);
      assert.equal(new URL(event.url).hostname.split('.')[0], folder.replace('wordcamp-', ''));
      const frames = EVENT_FRAMES[edition];
      assert.deepEqual(Object.keys(frames.roles), Object.keys(entry.roles));
      assert.deepEqual(event.frameRoles, Object.keys(entry.roles));
      const size = assets.get(Object.values(entry.roles)[0]).width;
      const scale = 1080 / size; const round = value => Math.round(value * 100) / 100;
      // The photo reaches three output pixels under the artwork around the declared window.
      const r = round(entry.window.r * scale + 3), cx = round(entry.window.cx * scale), cy = round(entry.window.cy * scale);
      assert.deepEqual({ ...frames.photo }, { cx, cy, r, x: round(cx - r), y: round(cy - r), size: round(r * 2) });
      assert.ok(Object.isFrozen(frames) && Object.isFrozen(frames.photo) && Object.isFrozen(frames.roles));
      for (const [role, path] of Object.entries(entry.roles)) {
        assert.ok(ROLES.some(item => item.id === role), `${edition}/${role} must be a catalog role`);
        const item = assets.get(path); const bytes = await readFile(join(directory, path));
        assert.equal(path, `${edition}-${role}.png`);
        assert.equal(sha256(bytes), item.sha256, path); assert.equal(bytes.length, item.bytes, path);
        assert.ok(bytes.length <= 1024 * 1024, `${path}: frame budget`);
        assert.equal(item.width, item.height); assert.equal(item.width, size);
        const { ground, band, ...record } = frames.roles[role];
        assert.deepEqual(record, { sha256: item.sha256, bytes: item.bytes, width: item.width, height: item.height, length: 'data:image/png;base64,'.length + Math.ceil(item.bytes / 3) * 4 });
        // The artwork's ground: the most common color along its top edge.
        assert.match(ground, /^[0-9A-F]{6}$/, path);
        // Published as the committed file, at a path the registry names and a URL its hash pins.
        published.push([`events/${folder}/frames/${path}`, `frames/${path}`]);
        assert.equal(eventFramePath(edition, role), `/frames/${path}?v=${item.sha256}`);
        const payload = await loadEventFrame(edition, role, frameFetch);
        assert.equal(payload.length, frames.roles[role].length);
        assert.equal(payload, 'data:image/png;base64,' + bytes.toString('base64'), `${path}: the builder embeds the committed artwork`);
        // A band, where the edition has them: the frame's width, tall enough for the
        // 270-unit card band plus the rows it shares with the frame.
        assert.equal(Boolean(band), Boolean(entry.bands), `${edition}/${role}`);
        if (!band) {
          assert.equal(eventFramePath(edition, role, true), null);
          assert.equal(await loadEventFrame(edition, role, async () => { throw new Error('must not fetch'); }, true), null);
          continue;
        }
        const name = entry.bands[role]; const listed = assets.get(name); const file = await readFile(join(directory, name));
        assert.equal(name, `${edition}-${role}-band.png`);
        assert.equal(sha256(file), listed.sha256, name); assert.equal(file.length, listed.bytes, name);
        assert.equal(listed.sourceName, path, 'a band is derived from its own frame');
        assert.equal(listed.width, size); assert.equal(listed.height, Math.ceil(270 * size / 1080) + 8);
        assert.deepEqual({ ...band }, { sha256: listed.sha256, bytes: listed.bytes, height: listed.height, length: 'data:image/png;base64,'.length + Math.ceil(listed.bytes / 3) * 4 });
        assert.ok(Object.isFrozen(band));
        published.push([`events/${folder}/frames/${name}`, `frames/${name}`]);
        assert.equal(eventFramePath(edition, role, true), `/frames/${name}?v=${listed.sha256}`);
        assert.equal(await loadEventFrame(edition, role, frameFetch, true), 'data:image/png;base64,' + file.toString('base64'), `${name}: the builder embeds the committed band`);
        await assert.rejects(loadEventFrame(edition, role, async () => new Response(bytes), true), /Frame artwork/, 'a frame is not its band');
      }
      if (entry.bands) assert.deepEqual(Object.keys(entry.bands), Object.keys(entry.roles));
      assert.equal(event.frameCard, entry.bands ? true : undefined, `${edition}: the social card is made from frames exactly when they have bands`);
    }
  }
  assert.deepEqual(seen, Object.keys(EVENT_FRAMES));
  assert.deepEqual(EVENTS.filter(event => event.frameRoles).map(event => event.id), seen);
  assert.deepEqual(FRAME_FILES.map(pair => [...pair]), published, 'exactly the registered frames are published, from their event folders');
  assert.ok(Object.isFrozen(FRAME_FILES) && FRAME_FILES.every(Object.isFrozen));
});

test('the browser loader fetches one published PNG, pins it to the registry and never substitutes', async () => {
  const [edition] = Object.keys(EVENT_FRAMES); const [role, other] = Object.keys(EVENT_FRAMES[edition].roles);
  const frame = EVENT_FRAMES[edition].roles[role]; const bytes = eventFrameBytes(edition, role);
  const calls = [];
  const data = await loadEventFrame(edition, role, async (url, init) => { calls.push([url, init]); return frameFetch(url); });
  assert.equal(data, eventFrameData(edition, role));
  assert.deepEqual(calls, [[`/frames/${edition}-${role}.png?v=${frame.sha256}`, { credentials: 'same-origin', redirect: 'error' }]]);
  // No artwork, no request: unknown editions and roles, and prototype keys.
  const unreachable = async () => { throw new Error('must not fetch'); };
  for (const [event, id] of [['europe-2026', role], [edition, 'unknown'], ['unknown', role], ['__proto__', role], [edition, 'constructor'], [edition, '../../app']]) {
    assert.equal(eventFramePath(event, id), null);
    assert.equal(await loadEventFrame(event, id, unreachable), null);
  }
  // Anything but the exact registered bytes fails: missing, truncated, altered, or another role's file.
  const altered = Buffer.from(bytes); altered[altered.length - 20] ^= 1;
  for (const [label, response] of [
    ['missing', () => new Response('Not found', { status: 404 })],
    ['an error page', () => new Response('<!doctype html>', { status: 500 })],
    ['truncated', () => new Response(bytes.subarray(0, bytes.length - 1))],
    ['altered', () => new Response(altered)],
    ['another role', () => new Response(eventFrameBytes(edition, other))],
    ['empty', () => new Response(new Uint8Array())],
  ]) await assert.rejects(loadEventFrame(edition, role, async () => response()), /Frame artwork/, label);
  await assert.rejects(loadEventFrame(edition, role, async () => { throw new TypeError('offline'); }), /offline/);
});

test('interim frames are what the drawing tool produces today, for every role', async () => {
  const { drawFrame, FRAME_SIZE, FRAME_WINDOW } = await import('../tools/draw-event-frames.mjs');
  for (const [, manifest] of await manifests()) {
    if (!interim(manifest)) continue;
    for (const [edition, entry] of Object.entries(manifest.editions)) {
      assert.deepEqual(entry.window, { ...FRAME_WINDOW }, edition);
      assert.deepEqual(Object.keys(entry.roles), ROLES.map(role => role.id), `${edition}: interim frames cover every role`);
      for (const [role, path] of Object.entries(entry.roles)) {
        const item = manifest.assets.find(asset => asset.path === path);
        const svg = drawFrame(edition, role);
        // The ring carries the lettering and decoration only: no outline is drawn around it.
        assert.doesNotMatch(svg, /<circle\b/, path);
        assert.equal(item.width, FRAME_SIZE, path);
        assert.equal(item.sourceName, `${edition}-${role}.svg`);
        // A changed label, role statement, font or decoration means the PNG must be redrawn.
        assert.equal(item.sourceSha256, sha256(svg), `${path}: redraw with tools/draw-event-frames.mjs`);
        assert.equal(item.sourceBytes, Buffer.byteLength(svg), path);
      }
    }
  }
});

test('the drawing tool writes one SVG per role without a browser and rejects unknown editions', async t => {
  const { drawFrame } = await import('../tools/draw-event-frames.mjs');
  const drawing = join(root, 'tools/draw-event-frames.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'event-frames-draw-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const edition = EVENTS[1].id;
  const result = run(drawing, edition, directory);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /6 SVG frames for /);
  assert.match(result.stdout, /Photo window: cx 540, cy 540, r 400 at 1080 x 1080/);
  assert.deepEqual((await readdir(directory)).sort(), ROLES.map(role => `${edition}-${role.id}.svg`).sort());
  for (const role of ROLES) assert.equal(await readFile(join(directory, `${edition}-${role.id}.svg`), 'utf8'), drawFrame(edition, role.id));
  for (const args of [[], [edition], ['asia-1999', directory], [edition, directory, 'extra']]) {
    const bad = run(drawing, ...args);
    assert.equal(bad.status, 1, args.join(' '));
    assert.match(bad.stderr, /^Usage: node tools\/draw-event-frames\.mjs <edition> <output-directory> \[--png\]/);
  }
});

test('each frame records the ground color of its artwork', () => {
  const grounds = edition => Object.fromEntries(Object.entries(EVENT_FRAMES[edition].roles).map(([role, frame]) => [role, frame.ground]));
  // WordCamp Asia: one ground per role. Lettering added to the artwork is chosen to read on it.
  assert.deepEqual(grounds('asia-2027'), { attendee: 'F8E7D5', speaker: '00513B', volunteer: 'FFD352', organizer: '07077A', sponsor: '700E00', mediapartner: '15C6D6' });
  assert.deepEqual([...new Set(Object.values(grounds('europe-2027')))], ['F9F9F9']);
  assert.deepEqual([...new Set(Object.values(grounds('india-2027')))], ['1A1A1A']);
});

test('frame bytes live only in the PNG files: no payload modules and none on the server', async () => {
  const registry = await readFile(join(root, 'events/frames.js'), 'utf8');
  assert.doesNotMatch(registry, /data:|base64|import\s*\(|^\s*import\s/m);
  assert.ok(registry.length < 20000);
  const loader = await readFile(join(root, 'events/frame-loader.js'), 'utf8');
  assert.deepEqual([...loader.matchAll(/^import\s[^;]+from\s+'([^']+)'/gm)].map(match => match[1]), ['./frames.js'], 'the loader needs only the registry');
  assert.doesNotMatch(loader, /import\s*\(|data:image\/png;base64,[A-Za-z0-9+/]{16}/);
  for (const gone of ['events/frame-data.js', 'events/frame-data', 'functions/_frames.js']) await assert.rejects(readFile(join(root, gone)), { code: /^(ENOENT|EISDIR)$/ }, gone);
  await assert.rejects(readdir(join(root, 'events/frame-data')), { code: 'ENOENT' });
  // The card route renders no avatar frame, so nothing it imports reaches frame artwork.
  const route = await readFile(join(root, 'functions/card.js'), 'utf8');
  assert.doesNotMatch(route, /^import[^;]*frame|eventFrameData|loadEventFrame/im);
});

test('measure mode reports each committed frame\'s declared photo window', async () => {
  for (const [folder, manifest] of await manifests()) for (const entry of Object.values(manifest.editions)) for (const path of Object.values(entry.roles)) {
    const result = run(tool, '--measure', join(root, 'events', folder, 'frames', path));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).window, entry.window, path);
  }
});

// Synthetic artwork for the generator's contract: a square RGBA canvas with one round window.
function png(size, alphaAt, { colorType = 6, interlace = 0, colorAt = () => null } = {}) {
  const channels = colorType === 6 ? 4 : 3; const stride = size * channels + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * stride + 1 + x * channels;
    [raw[offset], raw[offset + 1], raw[offset + 2]] = colorAt(x, y) ?? [112, 14, 0];
    if (channels === 4) raw[offset + 3] = alphaAt(x, y);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]); const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = colorType; header[12] = interlace;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}
const windowAlpha = (cx, cy, r) => (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r ? 0 : 255;
const open = { cx: 540, cy: 560, r: 300 };
async function fixture(t, frame = png(1080, windowAlpha(open.cx, open.cy, open.r)), change = manifest => manifest, editions = null) {
  const project = await mkdtemp(join(tmpdir(), 'profile-cards-frames-test-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  await mkdir(join(project, 'tools')); await mkdir(join(project, 'events/wordcamp-asia/frames'), { recursive: true });
  await cp(tool, join(project, 'tools/build-event-frames.mjs'));
  if (editions) await writeFile(join(project, 'events/wordcamp-asia/event.js'), `export const editions = ${JSON.stringify(editions)};\n`);
  else await cp(join(root, 'events/wordcamp-asia/event.js'), join(project, 'events/wordcamp-asia/event.js'));
  const directory = join(project, 'events/wordcamp-asia/frames');
  await writeFile(join(directory, 'asia-2027-attendee.png'), frame);
  const manifest = change({
    editions: { 'asia-2027': { window: { ...open }, roles: { attendee: 'asia-2027-attendee.png' } } },
    source: 'Synthetic test artwork, not an event asset.', rights: 'Test fixture only.',
    assets: [{ path: 'asia-2027-attendee.png', sha256: sha256(frame), bytes: frame.length, width: 1080, height: 1080, sourceName: 'Attendee.png' }],
  });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  const entry = join(project, 'tools/build-event-frames.mjs');
  return { project, directory, entry, build: (...args) => run(entry, ...args) };
}

// Reads a PNG as the tool writes one: 8-bit RGBA, unfiltered rows.
function pixels(bytes) {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.deepEqual([bytes[24], bytes[25]], [8, 6]);
  const raw = inflateSync(bytes.subarray(41, 41 + bytes.readUInt32BE(33))); const stride = width * 4 + 1;
  assert.equal(raw.length, stride * height);
  return { width, height, at: (x, y) => { assert.equal(raw[y * stride], 0); return [...raw.subarray(y * stride + 1 + x * 4, y * stride + 5 + x * 4)]; } };
}
// Tone-on-tone, like the supplied artwork: the pattern repeats every 16 px each way.
const tile = (x, y) => (((x + y) % 16) + 16) % 16 < 4 ? [124, 26, 10] : [112, 14, 0];
const patterned = () => png(1080, windowAlpha(open.cx, open.cy, open.r), { colorAt: tile });
const withBand = band => manifest => {
  manifest.editions['asia-2027'].bands = { attendee: 'asia-2027-attendee-band.png' };
  manifest.assets.push({ path: 'asia-2027-attendee-band.png', sha256: sha256(band), bytes: band.length, width: 1080, height: 278, sourceName: 'asia-2027-attendee.png' });
  return manifest;
};

test('a band continues the frame\'s own background above it, and only the derived band is accepted', async t => {
  // The renderer and the tool agree on how tall the card's band is.
  const [, height] = (await readFile(tool, 'utf8')).match(/^const CARD_BAND = (\d+);$/m);
  assert.match(await readFile(join(root, 'events/social.js'), 'utf8'), new RegExp(`^const FRAME_CARD_BAND = ${height};$`, 'm'));
  for (const [label, frame, repeat] of [['flat', undefined, 1], ['patterned', patterned(), 16]]) {
    const { project, directory, build } = await fixture(t, frame);
    const out = join(project, 'bands');
    const derived = build('--bands', 'asia-2027', out);
    assert.equal(derived.status, 0, derived.stderr);
    assert.deepEqual(JSON.parse(derived.stdout), { file: 'asia-2027-attendee-band.png', width: 1080, height: 278, repeat });
    assert.deepEqual(await readdir(out), ['asia-2027-attendee-band.png']);
    assert.deepEqual((await readdir(directory)).sort(), ['asia-2027-attendee.png', 'manifest.json'], 'the frames folder is not written to');
    const band = await readFile(join(out, 'asia-2027-attendee-band.png')); const image = pixels(band);
    // 270 output units of background, continuing upward from the frame's top edge, then
    // the frame's own first 8 rows, which the frame is drawn over.
    for (const [x, y] of [[0, 0], [1079, 0], [3, 13], [540, 135], [17, 269], [1079, 269], [0, 270], [5, 277], [1079, 277]]) {
      assert.deepEqual(image.at(x, y), [...(repeat === 1 ? [112, 14, 0] : tile(x, y - 270)), 255], `${label} ${x},${y}`);
    }
    // Recorded in the manifest, the band is checked against what the tool derives.
    await writeFile(join(directory, 'asia-2027-attendee-band.png'), band);
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(withBand(band)(manifest)));
    const built = build(); assert.equal(built.status, 0, built.stderr);
    const { EVENT_FRAMES: generated } = await import(join(project, 'events/frames.js'));
    assert.deepEqual({ ...generated['asia-2027'].roles.attendee.band }, { sha256: sha256(band), bytes: band.length, height: 278, length: 22 + Math.ceil(band.length / 3) * 4 });
  }
  // Any other image is refused: a flat band for patterned artwork, or the wrong shape.
  const flat = await fixture(t); const flatOut = join(flat.project, 'bands');
  assert.equal(flat.build('--bands', 'asia-2027', flatOut).status, 0);
  const flatBand = await readFile(join(flatOut, 'asia-2027-attendee-band.png'));
  for (const [band, change, message] of [
    [flatBand, withBand(flatBand), /asia-2027-attendee-band\.png: not the band this tool derives from asia-2027-attendee\.png\. Run --bands asia-2027/],
    [flatBand, manifest => { withBand(flatBand)(manifest); manifest.editions['asia-2027'].bands = { speaker: 'asia-2027-attendee-band.png' }; return manifest; }, /bands must list the same roles as roles/],
    [flatBand, manifest => { withBand(flatBand)(manifest); manifest.editions['asia-2027'].bands = { attendee: 'asia-2027-attendee.png' }; return manifest; }, /the attendee band must be named asia-2027-attendee-band\.png/],
    [flatBand, manifest => { withBand(flatBand)(manifest); delete manifest.editions['asia-2027'].bands; return manifest; }, /asia-2027-attendee-band\.png: listed in assets but not assigned to an edition role or band/],
    [null, manifest => { manifest.editions['asia-2027'].bands = { attendee: 'asia-2027-attendee-band.png' }; return manifest; }, /the attendee band refers to an unlisted asset/],
  ]) {
    const { project, directory, build } = await fixture(t, patterned(), change);
    if (band) await writeFile(join(directory, 'asia-2027-attendee-band.png'), band);
    const result = build(); assert.notEqual(result.status, 0); assert.match(result.stderr, message);
    await assert.rejects(readFile(join(project, 'events/frames.js')), { code: 'ENOENT' });
  }
});

test('a frame whose background cannot be continued gets no band', async t => {
  // Lettering at the very top leaves no background to read.
  const lettering = png(1080, windowAlpha(open.cx, open.cy, open.r), { colorAt: (x, y) => y === 9 && x >= 400 && x < 680 ? [255, 255, 255] : null });
  // A pattern that does not repeat cannot be continued: rings that tighten outward.
  const irregular = png(1080, windowAlpha(open.cx, open.cy, open.r), { colorAt: (x, y) => ((x * x + y * y) >> 14) % 2 ? [124, 26, 10] : null });
  for (const [frame, message] of [[lettering, /asia-2027-attendee\.png: the top 16 px of a frame must be background only for its social card/], [irregular, /asia-2027-attendee\.png: the background has no regular repeat to continue above the frame/]]) {
    const { project, build } = await fixture(t, frame);
    const result = build('--bands', 'asia-2027', join(project, 'bands'));
    assert.notEqual(result.status, 0); assert.match(result.stderr, message);
    await assert.rejects(readdir(join(project, 'bands')), { code: 'ENOENT' }, 'nothing is written');
    // Such a frame is still a valid avatar frame.
    const valid = build(); assert.equal(valid.status, 0, valid.stderr);
  }
  const usage = (await fixture(t)).build;
  for (const args of [['--bands'], ['--bands', 'asia-2027'], ['--bands', 'europe-2027', 'out'], ['--bands', 'asia-2027', 'out', 'extra'], ['--bands', 'asia-2026', 'out']]) assert.notEqual(usage(...args).status, 0, args.join(' '));
});

test('generator bootstraps a fresh checkout, writes only the registry, is deterministic and detects stale output', async t => {
  const { project, directory, build } = await fixture(t);
  assert.notEqual(build('--check').status, 0, 'nothing generated yet');
  const first = build(); assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(first.stdout).written, ['events/frames.js']);
  assert.deepEqual((await readdir(join(project, 'events'))).sort(), ['frames.js', 'wordcamp-asia'], 'no payload modules or loaders are generated');
  assert.deepEqual((await readdir(directory)).sort(), ['asia-2027-attendee.png', 'manifest.json'], 'artwork is validated, never rewritten');
  const read = () => readFile(join(project, 'events/frames.js'), 'utf8');
  const before = await read();
  assert.equal(build('--check').status, 0);
  assert.deepEqual(JSON.parse(build().stdout).written, []); assert.equal(await read(), before);
  const { EVENT_FRAMES: generated } = await import(join(project, 'events/frames.js'));
  assert.deepEqual({ ...generated['asia-2027'].photo }, { cx: 540, cy: 560, r: 303, x: 237, y: 257, size: 606 });
  const frame = await readFile(join(directory, 'asia-2027-attendee.png'));
  assert.deepEqual({ ...generated['asia-2027'].roles.attendee }, { sha256: sha256(frame), bytes: frame.length, width: 1080, height: 1080, length: 22 + Math.ceil(frame.length / 3) * 4, ground: '700E00' });
  await writeFile(join(project, 'events/frames.js'), before + '\n');
  const stale = build('--check'); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /out of date[^\n]*events\/frames\.js/);
  assert.equal(await read(), before + '\n', 'check mode never writes');
  for (const args of [['--write'], ['--check', 'extra'], ['--measure'], ['--bands']]) assert.notEqual(build(...args).status, 0);
});

test('generator rejects an edition whose ID does not belong to its event folder', async t => {
  // The published path /frames/<edition>-<role>.png is served from the folder the ID names.
  const { project, build } = await fixture(t, undefined, manifest => { manifest.editions = { 'apac-2027': manifest.editions['asia-2027'] }; return manifest; }, [{ id: 'apac-2027' }]);
  const result = build(); assert.notEqual(result.status, 0); assert.match(result.stderr, /edition IDs in events\/wordcamp-asia start with "asia-"/);
  await assert.rejects(readFile(join(project, 'events/frames.js')), { code: 'ENOENT' });
});

const rejected = [
  ['pixels left open outside the window', png(1080, (x, y) => x < 2 ? 145 : windowAlpha(open.cx, open.cy, open.r)(x, y)), undefined, /2160 pixels outside the photo window are not fully opaque \(x 0-1, y 0-1079\)/],
  ['a filled window', png(1080, () => 255), undefined, /center of the photo window is not transparent/],
  ['a mostly covered window', png(1080, (x, y) => Math.hypot(x + 0.5 - open.cx, y + 0.5 - open.cy) < 100 ? 0 : 255), undefined, /less than 40%/],
  ['a window declared larger than the opening', undefined, manifest => { manifest.editions['asia-2027'].window.r = 340; return manifest; }, /does not match the declared window/],
  ['a window declared off the canvas', undefined, manifest => { manifest.editions['asia-2027'].window.cx = 200; return manifest; }, /must lie inside/],
  ['artwork without an alpha channel', png(1080, () => 255, { colorType: 2 }), undefined, /8-bit RGBA/],
  ['interlaced artwork', png(1080, windowAlpha(open.cx, open.cy, open.r), { interlace: 1 }), undefined, /without interlacing/],
  ['artwork below the output size', png(512, windowAlpha(256, 256, 150)), manifest => { Object.assign(manifest.assets[0], { width: 512, height: 512 }); manifest.editions['asia-2027'].window = { cx: 256, cy: 256, r: 150 }; return manifest; }, /1080-2048 px/],
  ['a file that is not a PNG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'.padEnd(80)), undefined, /not a PNG/],
  ['bytes that differ from the manifest', undefined, manifest => { manifest.assets[0].sha256 = '0'.repeat(64); return manifest; }, /bytes\/hash do not match/],
  ['an unknown edition', undefined, manifest => { manifest.editions = { 'asia-2099': manifest.editions['asia-2027'] }; return manifest; }, /not an edition in events\/wordcamp-asia\/event\.js/],
  ['an invalid role ID', undefined, manifest => { manifest.editions['asia-2027'].roles = { 'Media Partner': 'asia-2027-attendee.png' }; return manifest; }, /invalid role ID/],
  ['a path outside the frames folder', undefined, manifest => { manifest.assets[0].path = '../event.png'; return manifest; }, /local \.png basenames/],
  ['a frame not named for its edition and role', undefined, manifest => { manifest.editions['asia-2027'].roles = { speaker: 'asia-2027-attendee.png' }; return manifest; }, /the speaker frame must be named asia-2027-speaker\.png/],
  ['an unassigned asset', undefined, manifest => { manifest.editions['asia-2027'].roles = {}; return manifest; }, /roles must map/],
  ['missing rights', undefined, manifest => { delete manifest.rights; return manifest; }, /missing "rights"/],
  ['an unsupported manifest key', undefined, manifest => { manifest.assets[0].url = 'https://example.test/a.png'; return manifest; }, /unsupported key "url"/],
];
for (const [name, frame, change, message] of rejected) test(`generator rejects ${name} and writes nothing`, async t => {
  const { project, build } = await fixture(t, frame, change);
  const result = build(); assert.notEqual(result.status, 0, name); assert.match(result.stderr, message);
  await assert.rejects(readFile(join(project, 'events/frames.js')), { code: 'ENOENT' });
});

test('generator refuses symlinked and oversized artwork', async t => {
  const linked = await fixture(t);
  const real = join(linked.project, 'elsewhere.png');
  await cp(join(linked.directory, 'asia-2027-attendee.png'), real);
  await rm(join(linked.directory, 'asia-2027-attendee.png')); await symlink(real, join(linked.directory, 'asia-2027-attendee.png'));
  const refused = linked.build(); assert.notEqual(refused.status, 0); assert.match(refused.stderr, /regular, non-symlinked file/);
  // Uncompressible noise outside the window: a valid frame that is simply too heavy.
  let seed = 1; const noise = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 24; };
  const size = 1080; const stride = size * 4 + 1; const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * stride + 1 + x * 4; const alpha = windowAlpha(open.cx, open.cy, open.r)(x, y);
    raw[offset] = alpha ? noise() : 0; raw[offset + 1] = alpha ? noise() : 0; raw[offset + 2] = alpha ? noise() : 0; raw[offset + 3] = alpha;
  }
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type, 'latin1'), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const heavy = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
  assert.ok(heavy.length > 1024 * 1024);
  const oversized = await fixture(t, heavy);
  const result = oversized.build(); assert.notEqual(result.status, 0); assert.match(result.stderr, /exceeds the 1048576-byte frame budget/);
});

// Substitute only the named import, as the frame-centering test does, to exercise an
// edition whose supplied artwork covers some roles. Real validation code is unchanged.
async function withImport(path, statement, replacement) {
  const url = new URL(`../${path}`, import.meta.url);
  const source = await readFile(url, 'utf8');
  assert.equal(source.split(statement).length, 2, `${path} import`);
  const code = source.replace(statement, replacement).replace(/from '(\.{1,2}\/[^']+)'/g, (_, specifier) => `from '${new URL(specifier, url).href}'`);
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

test('avatar frames accept only roles with supplied artwork; drawn layouts keep every role', async () => {
  const partial = EVENTS.map(event => event.id === 'asia-2027' ? { ...event, frameRoles: ['attendee', 'speaker'] } : event);
  const { queryOptions } = await withImport('shared/options.js', "import { EVENTS, ROLES } from './events.js';", `const EVENTS = ${JSON.stringify(partial)}; const ROLES = ${JSON.stringify(ROLES)};`);
  const q = params => queryOptions(new Request(`https://cards.test/card?${new URLSearchParams({ username: 'synthetic', ...params })}`));
  for (const role of ['attendee', 'speaker']) assert.equal(q({ layout: 'avatar', event: 'asia-2027', role }).role, role);
  assert.equal(q({ layout: 'avatar' }).role, 'attendee');
  for (const role of ['volunteer', 'organizer', 'sponsor', 'mediapartner']) {
    assert.throws(() => q({ layout: 'avatar', event: 'asia-2027', role }), error => error.code === 'invalid_option' && /available for this event\u2019s avatar frame/.test(error.message));
    // WordCamp Asia's social card is derived from the same artwork, so it has the same roles.
    assert.throws(() => q({ layout: 'announcement', event: 'asia-2027', role }), error => error.code === 'invalid_option' && /available for this event\u2019s social card/.test(error.message));
    assert.equal(q({ layout: 'announcement', event: 'europe-2027', role }).role, role);
    assert.equal(q({ layout: 'avatar', event: 'europe-2027', role }).role, role);
  }
  for (const role of ['attendee', 'speaker']) assert.equal(q({ layout: 'announcement', event: 'asia-2027', role }).role, role);
  assert.throws(() => q({ layout: 'avatar', event: 'asia-2027', role: 'official' }), { code: 'invalid_option' });
  // Direct renderer callers get the same refusal instead of another role's or a drawn frame.
  const registry = { 'asia-2027': { photo: EVENT_FRAMES['asia-2027'].photo, roles: { attendee: EVENT_FRAMES['asia-2027'].roles.attendee } } };
  const { renderSocial } = await withImport('events/social.js', "import { EVENT_FRAMES } from './frames.js';", `const EVENT_FRAMES = ${JSON.stringify(registry)};`);
  const profile = { name: 'Ada Example', userName: 'synthetic' };
  const frame = eventFrameData('asia-2027', 'attendee');
  assert.ok(renderSocial(profile, { layout: 'avatar', event: 'asia-2027', role: 'attendee' }, null, frame).includes('data-field="frame"'));
  assert.throws(() => renderSocial(profile, { layout: 'avatar', event: 'asia-2027', role: 'speaker' }, null, frame), error => error.code === 'invalid_option' && error.status === 400);
  // The social card made from frames follows the same artwork: never a drawn substitute.
  const band = eventFrameData('asia-2027', 'attendee', true);
  const card = renderSocial(profile, { layout: 'announcement', event: 'asia-2027', role: 'attendee' }, null, frame, band);
  assert.ok(card.includes('data-field="frame"')); assert.ok(card.includes('data-field="band"')); assert.ok(!card.includes('data-decoration'));
  assert.throws(() => renderSocial(profile, { layout: 'announcement', event: 'asia-2027', role: 'speaker' }, null, frame, band), error => error.code === 'invalid_option' && error.status === 400);
  assert.throws(() => renderSocial(profile, { layout: 'announcement', event: 'asia-2027', role: 'attendee' }), { code: 'frame_unavailable' });
  assert.throws(() => renderSocial(profile, { layout: 'announcement', event: 'asia-2027', role: 'attendee' }, null, frame), { code: 'frame_unavailable' });
  // An edition whose card is drawn needs no artwork.
  assert.ok(renderSocial(profile, { layout: 'announcement', event: 'europe-2027', role: 'speaker' }).includes('data-field="event"'));
  assert.ok(!(new ProfileError('x', 'y') instanceof TypeError));
});
