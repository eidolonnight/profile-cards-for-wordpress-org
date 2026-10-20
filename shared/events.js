import { EVENT_THEMES } from './event-themes.js';

// Canonical, manually verified official announcements as of 2026-10-01.
// Participation is self-reported; this catalogue does not certify event roles.
export const EVENTS = Object.freeze([
  { id: 'asia-2027', name: 'WordCamp Asia', year: 2027, label: 'WordCamp Asia', dateLabel: '9–11 April 2027', location: 'Penang, Malaysia', url: 'https://asia.wordcamp.org/2027/', note: 'Dates and city announced; check the official site for updates', checkedAt: '2026-10-01' },
  { id: 'europe-2027', name: 'WordCamp Europe', year: 2027, label: 'WordCamp Europe', dateLabel: '27–29 May 2027', location: 'Málaga', url: 'https://europe.wordcamp.org/2027/', note: 'Dates and city announced; check the official site for updates', checkedAt: '2026-10-01' },
  { id: 'us-2027', name: 'WordCamp US', year: 2027, label: 'WordCamp US', dateLabel: '', location: '', url: 'https://us.wordcamp.org/2027/', note: 'Early planning; check the official site for confirmed dates and location', checkedAt: '2026-10-01' },
  { id: 'india-2027', name: 'WordCamp India', year: 2027, label: 'WordCamp India', dateLabel: 'Late 2027', location: '', url: 'https://india.wordcamp.org/2027/', note: 'Exact dates and host city are still to be announced', checkedAt: '2026-10-01' }
].map(event => Object.freeze({ ...event, ...EVENT_THEMES[event.id] })));

export const ROLES = Object.freeze([
  { id: 'attendee', label: 'Attending', statement: "I'm attending" },
  { id: 'speaker', label: 'Speaking', statement: "I'm speaking" },
  { id: 'volunteer', label: 'Volunteering', statement: "I'm volunteering" },
  { id: 'organizer', label: 'Organizing', statement: "I'm organizing" },
  { id: 'sponsor', label: 'Sponsoring', statement: "I'm sponsoring" }
].map(Object.freeze));
