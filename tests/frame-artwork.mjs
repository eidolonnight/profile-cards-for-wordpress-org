// Test helper, not a suite. The committed frame PNG as the data URL the builder
// embeds after fetching /frames/<edition>-<role>.png.
import { readFileSync } from 'node:fs';
import { EVENT_FRAMES } from '../events/frames.js';
import { FRAME_FILES } from '../tools/browser-modules.mjs';

const sources = new Map(FRAME_FILES.map(([source, path]) => [path, source]));
const cache = new Map();
export const eventFrameBytes = (event, role) => {
  const path = `frames/${event}-${role}.png`;
  if (!Object.hasOwn(EVENT_FRAMES, event) || !Object.hasOwn(EVENT_FRAMES[event].roles, role) || !sources.has(path)) return null;
  if (!cache.has(path)) cache.set(path, readFileSync(new URL(`../${sources.get(path)}`, import.meta.url)));
  return cache.get(path);
};
// Returns null when the edition or role has no frame artwork.
export const eventFrameData = (event, role) => {
  const bytes = eventFrameBytes(event, role);
  return bytes ? 'data:image/png;base64,' + bytes.toString('base64') : null;
};
// A fetch stand-in that serves exactly the published frame files.
export const frameFetch = async url => {
  const { pathname } = new URL(url, 'https://cards.test');
  const match = pathname.match(/^\/frames\/([a-z]+-20\d{2})-([a-z]+)\.png$/);
  const bytes = match ? eventFrameBytes(match[1], match[2]) : null;
  return bytes ? new Response(bytes, { headers: { 'Content-Type': 'image/png' } }) : new Response('Not found', { status: 404 });
};
