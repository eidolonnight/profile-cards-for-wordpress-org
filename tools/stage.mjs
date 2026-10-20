import { mkdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, basename, join, isAbsolute, relative, sep, parse } from 'node:path';
import { homedir } from 'node:os';
// Build a new immutable allowlist. Never replace existing release directories or follow symlinks.
const source = resolve(fileURLToPath(new URL('../', import.meta.url)));
const home = resolve(process.env.HOME || homedir());
const configuredBase = process.env.PROFILE_CARDS_RELEASES_DIR;
if (configuredBase && !isAbsolute(configuredBase)) throw new Error('Releases root must be an absolute path.');
// Retain the original default for existing maintainers; contributors can choose an owned external root.
const base = configuredBase ? resolve(configuredBase) : resolve(home, 'echion/projects/wp-profile-cards/releases');
const contains = (parent, child) => { const path = relative(parent, child); return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`)); };
if (base === home || base === parse(base).root || contains(source, base) || contains(base, source)) throw new Error('Releases root must be outside source, not home, filesystem root or a source ancestor.');
const destination = process.argv[2];
if (!destination) throw new Error('Provide a new <releases>/<release-name>/site path.');
const root = resolve(destination); const release = dirname(root);
if (dirname(release) !== base || basename(root) !== 'site' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(basename(release))) throw new Error('Stage must be <owned releases root>/<new release name>/site.');
const entries = [
  ['public/index.html', 'index.html'], ['public/app.js', 'app.js'], ['public/styles.css', 'styles.css'], ['public/background.js', 'background.js'], ['public/theme.js', 'theme.js'],
  ...['site-logo.png', 'favicon.png', 'favicon.ico'].map(name => [`public/${name}`, name]),
  ['public/index.html', 'create.html'], ['public/THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.txt'], ['public/FONT-LICENSES.txt', 'FONT-LICENSES.txt'], ['LICENSE', 'LICENSE'], ['sf.jsonc', 'sf.jsonc'],
  ['functions/_fonts.js', 'functions/_fonts.js'], ['functions/_profile.js', 'functions/_profile.js'], ['functions/_svg.js', 'functions/_svg.js'], ['functions/json.js', 'functions/json.js'], ['functions/card.js', 'functions/card.js'],
  ['functions/_events.js', 'functions/_events.js'], ['functions/_social.js', 'functions/_social.js'], ['functions/events.js', 'functions/events.js'],
  ['functions/preview-data.js', 'functions/preview-data.js'],
  // Functions compilation consumes its imports. Distinct public copies survive
  // that removal while both copies still come from one canonical source.
  ...['options.js', 'svg.js', 'social.js', 'fonts.js', 'events.js', 'event-themes.js', 'event-fonts.js'].map(name => [`shared/${name}`, `shared/${name}`]),
  ...['preview.js', 'options.js', 'svg.js', 'social.js', 'fonts.js', 'events.js', 'event-themes.js', 'event-fonts.js'].map(name => [`shared/${name}`, `preview/${name}`])
];
await mkdir(base, { recursive: true, mode: 0o700 });
if (await realpath(base) !== base || await realpath(source) !== source) throw new Error('Symlinked release/source parents are not allowed.');
const inputs = new Map();
for (const from of new Set([...entries.map(([from]) => from), 'package.json', 'package-lock.json'])) {
  const path = join(source, from);
  if (!(await lstat(path)).isFile() || await realpath(path) !== path) throw new Error(`Not a regular non-symlink source file: ${from}`);
  inputs.set(from, await readFile(path));
}
// Length-framed canonical inputs make the key independent of checkout/release paths,
// timestamps, and entry duplication. Dependency metadata is also a build input.
const revisionHash = createHash('sha256');
const sources = [...inputs.keys()].sort().map(path => {
  const bytes = inputs.get(path);
  revisionHash.update(path).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), outputs: entries.filter(([from]) => from === path).map(([, to]) => to).sort() };
});
const revision = revisionHash.digest('hex');
function browserBytes(to, bytes) {
  // Transform only staged browser copies. Backend imports and local dev stay canonical.
  if (to === 'index.html' || to === 'create.html') {
    return Buffer.from(bytes.toString('utf8').replace(/\b(src|href)=(['"])(\/(?:app\.js|theme\.js|styles\.css|site-logo\.png|favicon\.png|favicon\.ico))\2/g,
      (_, attribute, quote, path) => `${attribute}=${quote}${path}?v=${revision}${quote}`));
  }
  if (to === 'app.js') {
    // Includes both dynamic imports and the preview HEAD failure-classification probe.
    return Buffer.from(bytes.toString('utf8').replace(/(['"])(\/(?:background\.js|preview\/preview\.js))\1/g,
      (_, quote, path) => `${quote}${path}?v=${revision}${quote}`));
  }
  if (to.startsWith('preview/')) {
    return Buffer.from(bytes.toString('utf8').replace(/(^import\s+[^;]+?\s+from\s+)(['"])(\.\/[a-z-]+\.js)\2/gm,
      (_, prefix, quote, path) => `${prefix}${quote}${path}?v=${revision}${quote}`));
  }
  return bytes;
}
await mkdir(release, { mode: 0o700 }); // Exclusive: an existing release is never modified.
await mkdir(root, { mode: 0o700 });
// Install dependencies in the release parent. They are build inputs, never uploaded site files.
for (const name of ['package.json', 'package-lock.json']) await writeFile(join(release, name), inputs.get(name), { mode: 0o600, flag: 'wx' });
const manifest = [];
for (const [from, to] of entries) {
  const bytes = browserBytes(to, inputs.get(from)); await mkdir(dirname(join(root, to)), { recursive: true }); await writeFile(join(root, to), bytes, { flag: 'wx' });
  manifest.push({ path: to, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const robots = 'User-agent: *\nDisallow: /\n'; await writeFile(join(root, 'robots.txt'), robots, { flag: 'wx' });
manifest.push({ path: 'robots.txt', bytes: Buffer.byteLength(robots), sha256: createHash('sha256').update(robots).digest('hex') });
await writeFile(join(release, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
await writeFile(join(release, 'asset-revision.json'), JSON.stringify({
  revision,
  algorithm: 'sha256 of sorted canonical inputs: UTF-8 path + NUL + decimal byte length + NUL + raw bytes',
  sources
}, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ stage: root, files: manifest.length, manifest: join(release, 'source-manifest.json'), installDirectory: release, assetRevision: revision, revisionManifest: join(release, 'asset-revision.json') }));
