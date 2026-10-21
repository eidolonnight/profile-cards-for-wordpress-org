import { posix } from 'node:path';

// Explicit runtime-only inputs. Never discover files by walking event folders:
// their documentation, font sources and provenance must not enter hosting.
export const EVENT_MODULES = Object.freeze([
  ...['catalog.js', 'themes.js', 'artwork.js', 'social.js', 'fonts.js'].map(name => `events/${name}`),
  ...['asia', 'europe', 'india', 'us'].flatMap(event =>
    ['event.js', 'theme.js', 'artwork.js'].map(name => `events/wordcamp-${event}/${name}`))
]);
export const BROWSER_MODULES = Object.freeze([
  ...['preview.js', 'options.js', 'svg.js', 'social.js', 'fonts.js', 'events.js', 'event-themes.js', 'event-fonts.js']
    .map(name => Object.freeze([`shared/${name}`, `preview/${name}`])),
  ...EVENT_MODULES.map(path => Object.freeze([path, `preview/${path}`]))
]);
const sourceToPublic = new Map(BROWSER_MODULES);
const publicToSource = new Map(BROWSER_MODULES.map(([source, path]) => [path, source]));

// The browser copies have a different directory layout from backend sources.
// Rewrite only static ESM URL specifiers, including compatibility re-exports.
export function browserModuleSource(path, source, revision = '') {
  const canonical = publicToSource.get(path);
  if (!canonical) throw new Error(`Browser module not allowlisted: ${path}`);
  if (revision && !/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid browser asset revision.');
  return source.replace(/^(\s*(?:import|export)\s+[^;]+?\s+from\s+)(['"])(\.{1,2}\/[^'"]+\.js)\2/gm,
    (_, prefix, quote, specifier) => {
      const dependency = posix.normalize(posix.join(posix.dirname(canonical), specifier));
      const destination = sourceToPublic.get(dependency);
      if (!destination) throw new Error(`Browser dependency not allowlisted: ${canonical} -> ${specifier}`);
      const relative = posix.relative(posix.dirname(path), destination);
      const url = (relative.startsWith('.') ? relative : `./${relative}`) + (revision ? `?v=${revision}` : '');
      return `${prefix}${quote}${url}${quote}`;
    });
}
