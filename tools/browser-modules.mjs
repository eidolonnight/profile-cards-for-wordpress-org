import { posix } from 'node:path';
import { EVENT_FRAMES } from '../events/frames.js';

// Avatar-frame PNGs and their social-card bands, published as plain static files and
// named by the generated registry rather than by listing a directory. Manifests and
// anything else in a frames/ folder stay out. [source path, public path]
export const FRAME_FILES = Object.freeze(Object.entries(EVENT_FRAMES).flatMap(([edition, frames]) =>
  Object.entries(frames.roles).flatMap(([role, frame]) => [`${edition}-${role}.png`, ...(frame.band ? [`${edition}-${role}-band.png`] : [])])
    .map(name => Object.freeze([`events/wordcamp-${edition.split('-')[0]}/frames/${name}`, `frames/${name}`]))));
// Explicit runtime-only inputs. Never discover files by walking event folders:
// their documentation, font sources and provenance must not enter hosting.
export const EVENT_MODULES = Object.freeze([
  ...['catalog.js', 'themes.js', 'artwork.js', 'social.js', 'fonts.js', 'frames.js'].map(name => `events/${name}`),
  ...['asia', 'europe', 'india'].flatMap(event => ['event.js', 'theme.js'].map(name => `events/wordcamp-${event}/${name}`)),
  // Drawn designs, for editions whose social card is not made from frame artwork.
  ...['europe', 'india'].map(event => `events/wordcamp-${event}/artwork.js`)
]);
export const BROWSER_MODULES = Object.freeze([
  ...['preview.js', 'options.js', 'svg.js', 'social.js', 'fonts.js', 'events.js', 'event-themes.js', 'event-fonts.js']
    .map(name => Object.freeze([`shared/${name}`, `preview/${name}`])),
  ...EVENT_MODULES.map(path => Object.freeze([path, `preview/${path}`])),
  // Browser only: fetches one published frame PNG for the builder to embed.
  Object.freeze(['events/frame-loader.js', 'preview/events/frame-loader.js'])
]);
const sourceToPublic = new Map(BROWSER_MODULES);
const publicToSource = new Map(BROWSER_MODULES.map(([source, path]) => [path, source]));

// The browser copies have a different directory layout from backend sources.
// Rewrite only ESM URL specifiers: static imports, compatibility re-exports and
// literal lazy imports.
export function browserModuleSource(path, source, revision = '') {
  const canonical = publicToSource.get(path);
  if (!canonical) throw new Error(`Browser module not allowlisted: ${path}`);
  if (revision && !/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid browser asset revision.');
  const alias = specifier => {
    const dependency = posix.normalize(posix.join(posix.dirname(canonical), specifier));
    const destination = sourceToPublic.get(dependency);
    if (!destination) throw new Error(`Browser dependency not allowlisted: ${canonical} -> ${specifier}`);
    const relative = posix.relative(posix.dirname(path), destination);
    return (relative.startsWith('.') ? relative : `./${relative}`) + (revision ? `?v=${revision}` : '');
  };
  return source
    .replace(/^(\s*(?:import|export)\s+[^;]+?\s+from\s+)(['"])(\.{1,2}\/[^'"]+\.js)\2/gm,
      (_, prefix, quote, specifier) => `${prefix}${quote}${alias(specifier)}${quote}`)
    .replace(/(\bimport\(\s*)(['"])(\.{1,2}\/[^'"]+\.js)\2(\s*\))/g,
      (_, prefix, quote, specifier, suffix) => `${prefix}${quote}${alias(specifier)}${quote}${suffix}`);
}
