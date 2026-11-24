import { editions as asia } from './wordcamp-asia/event.js';
import { editions as europe } from './wordcamp-europe/event.js';
import { editions as india } from './wordcamp-india/event.js';
import { EVENT_THEMES } from './themes.js';
import { EVENT_FRAMES } from './frames.js';

// Avatar frames are PNG artwork per edition; each lists the roles its artwork covers.
// frameCard: the frames come with bands, so the 4:5 social card is made from them too.
function frameRoles(id) {
  if (!Object.hasOwn(EVENT_FRAMES, id)) return {};
  const roles = Object.values(EVENT_FRAMES[id].roles);
  return { frameRoles: Object.freeze(Object.keys(EVENT_FRAMES[id].roles)), ...(roles.every(role => role.band) ? { frameCard: true } : {}) };
}

// Preserve the public catalog order independently of directory ordering.
export const EVENTS = Object.freeze([
  ...asia, ...europe, ...india
].map(event => Object.freeze({ ...event, ...EVENT_THEMES[event.id], ...frameRoles(event.id) })));

export const ROLES = Object.freeze([
  { id: 'attendee', label: 'Attending', statement: "I'm attending" },
  { id: 'speaker', label: 'Speaking', statement: "I'm speaking" },
  { id: 'volunteer', label: 'Volunteering', statement: "I'm volunteering" },
  { id: 'organizer', label: 'Organizing', statement: "I'm organizing" },
  { id: 'sponsor', label: 'Sponsoring', statement: "I'm sponsoring" },
  { id: 'mediapartner', label: 'Media Partner', statement: "I'm a media partner" }
].map(Object.freeze));
