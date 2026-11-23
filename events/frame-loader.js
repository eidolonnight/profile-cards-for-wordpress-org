import { EVENT_FRAMES } from './frames.js';

// Browser only. Avatar-frame artwork is published as plain PNG files at
// /frames/<edition>-<role>.png. An image file cannot be linked from an SVG that is
// shown or exported as an image, so the builder fetches the PNG here and the
// renderer embeds it. The registry hash in the URL changes exactly when the artwork
// does, so no cache can hand back another version unnoticed.
export const eventFramePath = (event, role) => {
  const frames = Object.hasOwn(EVENT_FRAMES, event) ? EVENT_FRAMES[event] : null;
  const frame = frames && Object.hasOwn(frames.roles, role) ? frames.roles[role] : null;
  return frame ? `/frames/${event}-${role}.png?v=${frame.sha256}` : null;
};

// Resolves to the PNG as a data URL, or to null when the edition or role has no
// artwork. Anything but the exact registered bytes is an error, never a substitute.
export async function loadEventFrame(event, role, fetcher = globalThis.fetch) {
  const path = eventFramePath(event, role);
  if (!path) return null;
  const frame = EVENT_FRAMES[event].roles[role];
  const response = await fetcher(path, { credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error(`Frame artwork request failed with status ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (bytes.length !== frame.bytes || digest !== frame.sha256) throw new Error('Frame artwork does not match its registry record.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return 'data:image/png;base64,' + btoa(binary);
}
