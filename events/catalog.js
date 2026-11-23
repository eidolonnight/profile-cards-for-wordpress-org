import { editions as asia } from './wordcamp-asia/event.js';
import { editions as europe } from './wordcamp-europe/event.js';
import { editions as us } from './wordcamp-us/event.js';
import { editions as india } from './wordcamp-india/event.js';
import { EVENT_THEMES } from './themes.js';
import { EVENT_FRAMES } from './frames.js';

// Avatar frames are PNG artwork per edition; each lists the roles its artwork covers.
const frameRoles = id => Object.hasOwn(EVENT_FRAMES, id) ? { frameRoles: Object.freeze(Object.keys(EVENT_FRAMES[id].roles)) } : {};

// Preserve the public catalog order independently of directory ordering.
export const EVENTS = Object.freeze([
  ...asia, ...europe, ...us, ...india
].map(event => Object.freeze({ ...event, ...EVENT_THEMES[event.id], ...frameRoles(event.id) })));

export const ROLES = Object.freeze([
  { id: 'attendee', label: 'Attending', statement: "I'm attending" },
  { id: 'speaker', label: 'Speaking', statement: "I'm speaking" },
  { id: 'volunteer', label: 'Volunteering', statement: "I'm volunteering" },
  { id: 'organizer', label: 'Organizing', statement: "I'm organizing" },
  { id: 'sponsor', label: 'Sponsoring', statement: "I'm sponsoring" },
  { id: 'mediapartner', label: 'Media Partner', statement: "I'm a media partner" }
].map(Object.freeze));
