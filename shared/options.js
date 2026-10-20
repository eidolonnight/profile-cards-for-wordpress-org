import { EVENTS, ROLES } from './events.js';

export class ProfileError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const USER = /^[a-z0-9][a-z0-9._-]{0,59}$/;
export const DEFAULT_COLORS = { headerColor: '191E23', nameColor: '191E23', subHeaderColor: '50575E', badgeLabelColor: '23282D', foreground: 'FFFFFF', linkColor: '3858E9' };
const HEADER_OPTIONS = ['name', 'jobTitle', 'organization', 'handle', 'location', 'joined', 'userId', 'website', 'github', 'slack', 'social', 'teams'];
const SOCIAL_KEY = /^[a-z0-9-]{1,40}$/;

function omissionList(value, key) {
  if (value === null) return [];
  if (value.length > 2000 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new ProfileError('invalid_option', `${key} contains an invalid omission list.`);
  const items = value.split(',').map(item => item.trim());
  if (items.length > 40 || items.some(item => !item || item.length > 80 || (key === 'omitSocial' && !SOCIAL_KEY.test(item)))) throw new ProfileError('invalid_option', `${key} contains an invalid omission list.`);
  return [...new Set(items)];
}

export function queryOptions(request) {
  const params = new URL(request.url).searchParams;
  const supported = new Set(['username', 'layout', 'event', 'role', 'eventDetails', 'avatar', 'badges', 'badgeNames', 'header', 'link', 'refresh', 'omitTeams', 'omitSocial', ...HEADER_OPTIONS, ...Object.keys(DEFAULT_COLORS)]);
  for (const key of params.keys()) {
    if (!supported.has(key) || params.getAll(key).length !== 1) throw new ProfileError('invalid_parameter', `Unsupported or repeated parameter: ${key.slice(0, 40)}.`);
  }
  const username = params.get('username');
  if (!username || !USER.test(username)) throw new ProfileError('invalid_username', 'Enter a WordPress.org profile username: 1–60 lowercase letters, numbers, dots, underscores or hyphens. Do not enter a URL.');
  const layout = params.get('layout') ?? 'classic';
  if (!['classic', 'profile', 'square', 'avatar', 'announcement'].includes(layout)) throw new ProfileError('invalid_option', 'layout must be classic, profile, square, avatar or announcement.');
  const social = layout === 'avatar' || layout === 'announcement';
  const modern = layout === 'profile' || layout === 'square';
  if (!social && ['event', 'role', 'eventDetails'].some(key => params.has(key))) throw new ProfileError('invalid_parameter', 'Event options require a social layout.');
  const options = { username, layout, omitTeams: omissionList(params.get('omitTeams'), 'omitTeams'), omitSocial: omissionList(params.get('omitSocial'), 'omitSocial') };
  if (social) {
    options.event = params.get('event') ?? 'asia-2027';
    options.role = params.get('role') ?? 'attendee';
    if (!EVENTS.some(event => event.id === options.event)) throw new ProfileError('invalid_option', 'Select a supported event.');
    if (!ROLES.some(role => role.id === options.role)) throw new ProfileError('invalid_option', 'Select a supported participation role.');
  }
  for (const [key, fallback] of Object.entries({ avatar: true, badges: layout === 'classic' || modern, header: true, link: modern, refresh: false, ...Object.fromEntries(HEADER_OPTIONS.map(key => [key, true])), badgeNames: modern, ...(social ? { eventDetails: true } : {}) })) {
    const value = params.get(key);
    if (value !== null && value !== 'true' && value !== 'false') throw new ProfileError('invalid_option', `${key} must be true or false.`);
    options[key] = value === null ? fallback : value === 'true';
  }
  for (const [key, fallback] of Object.entries({ ...DEFAULT_COLORS, ...(social ? EVENTS.find(event => event.id === options.event).colors : {}) })) {
    const value = params.get(key) ?? (['profile', 'square'].includes(layout) && key === 'linkColor' ? options.subHeaderColor : fallback);
    if (!/^[0-9a-f]{6}$/i.test(value)) throw new ProfileError('invalid_color', `${key} must be a six-digit hex color without #.`);
    options[key] = value.toUpperCase();
  }
  return options;
}
