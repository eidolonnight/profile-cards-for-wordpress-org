// Test helper, not a suite. The committed frame PNGs as the data URLs the builder
// embeds after fetching /frames/<edition>-<role>.png and, for a social card made
// from a frame, /frames/<edition>-<role>-band.png.
import { readFileSync } from 'node:fs';
import { EVENTS } from '../events/catalog.js';
import { FRAME_FILES } from '../tools/browser-modules.mjs';

const sources = new Map(FRAME_FILES.map(([source, path]) => [path, source]));
const cache = new Map(), urls = new Map();
// Returns null when the edition or role has no such artwork.
export const eventFrameBytes = (event, role, band = false) => {
  const path = `frames/${event}-${role}${band ? '-band' : ''}.png`;
  if (!sources.has(path)) return null;
  if (!cache.has(path)) cache.set(path, readFileSync(new URL(`../${sources.get(path)}`, import.meta.url)));
  return cache.get(path);
};
export const eventFrameData = (event, role, band = false) => {
  const bytes = eventFrameBytes(event, role, band);
  if (bytes && !urls.has(bytes)) urls.set(bytes, 'data:image/png;base64,' + bytes.toString('base64'));
  return bytes ? urls.get(bytes) : null;
};
// Avatar frames are frame artwork; so is the social card of an edition whose frames
// have bands (frameCard in the catalog).
export const usesFrameArtwork = options => options.layout === 'avatar' || (options.layout === 'announcement' && EVENTS.find(event => event.id === options.event)?.frameCard === true);
// The artwork arguments the builder passes to the renderer for these options, after
// the avatar: none, the frame, or the frame and its band.
export const artworkFor = options => !usesFrameArtwork(options) ? [] : [false, ...(options.layout === 'avatar' ? [] : [true])].map(band => eventFrameData(options.event, options.role, band));
// A fetch stand-in that serves exactly the published frame files.
export const frameFetch = async url => {
  const { pathname } = new URL(url, 'https://cards.test');
  const match = pathname.match(/^\/frames\/([a-z]+-20\d{2})-([a-z]+?)(-band)?\.png$/);
  const bytes = match ? eventFrameBytes(match[1], match[2], Boolean(match[3])) : null;
  return bytes ? new Response(bytes, { headers: { 'Content-Type': 'image/png' } }) : new Response('Not found', { status: 404 });
};
