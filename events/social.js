import { EVENTS, ROLES } from './catalog.js';
import { DEFAULT_COLORS, ProfileError } from '../shared/options.js';
import { EVENT_FONT_CSS, EVENT_FONT_STYLE_HASH, EVENT_FONTS, measureEventText, eventInkCenter } from './fonts.js';
import { xml } from '../shared/svg.js';
import { EVENT_LAYOUTS } from './themes.js';
import { EVENT_ARTWORK } from './artwork.js';

const clean = value => String(value ?? '').replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '').replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '').replace(/\s+/gu, ' ').trim();
const group = (field, body) => body ? `<g data-field="${field}">${body}</g>` : '';
export const socialStyleHash = event => EVENT_FONT_STYLE_HASH[event];

// Exact pinned advances; fitting and emitted font/weight always agree. SVG text
// disables kerning/ligatures through its hash-authorized CSS. No shaping guess.
function fit(value, width, preferred, minimum, face) {
  let text = clean(value); let size = preferred;
  const measured = measureEventText(text, size, face);
  if (measured > width) size = Math.max(minimum, Math.floor(size * width / measured));
  if (measureEventText(text, size, face) > width) {
    const chars = [...text]; let lo = 0; let hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measureEventText(chars.slice(0, mid).join('') + '…', size, face) <= width) lo = mid;
      else hi = mid - 1;
    }
    text = chars.slice(0, lo).join('').trimEnd() + '…';
  }
  return { text, size, face };
}
function attributes(fitted, color, width, anchor = 'middle') {
  const { face, size } = fitted;
  return `text-anchor="${anchor}" fill="#${color}" font-family="'${face.alias}', ${face.family === 'Cardo' || face.family === 'Faculty Glyphic' ? 'serif' : 'sans-serif'}" font-size="${size}" font-weight="${face.weight}" data-face="${face.key}" data-max-width="${width}"`;
}
function text(value, x, y, color, width, preferred, minimum, face, anchor = 'middle') {
  const fitted = fit(value, width, preferred, minimum, face);
  return `<text x="${x}" y="${y}" ${attributes(fitted, color, width, anchor)}>${xml(fitted.text)}</text>`;
}
function curved(fitted, id, color, width) {
  return `<text ${attributes(fitted, color, width)}><textPath href="#${id}" startOffset="50%">${xml(fitted.text)}</textPath></text>`;
}
// Center actual fitted glyph ink on radial 463, not font line boxes. Each face
// has its own outline-derived vertical metrics (including cap overshoot).
function frameBaseline(fitted, top) {
  return 463 + (top ? -1 : 1) * fitted.size * eventInkCenter(fitted.text, fitted.face);
}
function arc(id, radius, top) {
  return `<path id="${id}" d="M ${540 - radius} 540 A ${radius} ${radius} 0 0 ${top ? 1 : 0} ${540 + radius} 540"/>`;
}
function portrait(profile, o, data, cy, radius, fonts) {
  if (!o.avatar) return '';
  // Keep the existing 2 MiB upstream social-photo allowance after base64
  // expansion; a smaller encoded limit silently replaces valid photos.
  const maxDataLength = 4 * Math.ceil((2 * 1024 * 1024) / 3) + 'data:image/jpeg;base64,'.length;
  const valid = typeof data === 'string' && data.length <= maxDataLength && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data);
  let body = `<defs><clipPath id="social-photo"><circle cx="540" cy="${cy}" r="${radius}"/></clipPath></defs>`;
  if (valid) body += `<image x="${540 - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#social-photo)" href="${data}"/>`;
  else {
    // Deriving initials from a hidden field is still an identity leak.
    const identity = clean(o.name ? profile.name : o.handle ? profile.userName : '');
    const initials = identity.split(/\s+/u).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('') || '?';
    body += `<circle cx="540" cy="${cy}" r="${radius}" fill="#${o.foreground}"/>`;
    body += text(initials, 540, cy + 42, o.layout === 'avatar' ? o.headerColor : o.nameColor, radius * 1.5, 132, 80, fonts.display);
  }
  body += `<circle cx="540" cy="${cy}" r="${radius - 1}" fill="none" stroke="#${o.headerColor}" stroke-opacity="0.15" stroke-width="2"/>`;
  return group('avatar', body);
}

function frameDecoration(artwork, o) {
  // Solid type strips remain above a user background, while the side wedges
  // expose that background. All decorations inherit the annulus clip.
  let body = `<path d="M 114 358 A 463 463 0 0 1 966 358 M 114 722 A 463 463 0 0 0 966 722" fill="none" stroke="#${o.foreground}" stroke-width="116"/>`;
  body += artwork.frameDecoration(o);
  return `<g data-decoration="frame">${body}</g>`;
}
export function renderSocial(profile, options = {}, avatarData = null) {
  const event = EVENTS.find(item => item.id === (options.event ?? 'asia-2027'));
  const role = ROLES.find(item => item.id === (options.role ?? 'attendee'));
  if (!event || !role || !['avatar', 'announcement'].includes(options.layout ?? 'avatar')) throw new ProfileError('invalid_option', 'Select a supported social layout, event and role.');
  const o = { ...DEFAULT_COLORS, ...event.colors, layout: 'avatar', event: event.id, role: role.id, avatar: true, name: true, handle: true, eventDetails: true, ...options };
  // Direct renderer callers get the same attribute safety as queryOptions.
  for (const key of Object.keys(DEFAULT_COLORS)) {
    if (!/^[0-9a-f]{6}$/i.test(o[key])) throw new ProfileError('invalid_color', `${key} must be a six-digit hex color without #.`);
    o[key] = o[key].toUpperCase();
  }
  const fonts = EVENT_FONTS[event.id];
  const layout = EVENT_LAYOUTS[event.id];
  const artwork = EVENT_ARTWORK[event.id];
  const details = o.eventDetails ? [event.dateLabel, event.location].filter(Boolean).join(' · ') : '';
  const name = o.name ? clean(profile.name) : '';
  const handle = o.handle && clean(profile.userName) ? '@' + clean(profile.userName) : '';
  const out = [];
  if (o.layout === 'avatar') {
    out.push(portrait(profile, o, avatarData, 540, 400, fonts));
    out.push('<defs><clipPath id="social-frame"><path clip-rule="evenodd" d="M 14 540 A 526 526 0 1 0 1066 540 A 526 526 0 1 0 14 540 Z M 140 540 A 400 400 0 1 0 940 540 A 400 400 0 1 0 140 540 Z"/></clipPath></defs><g clip-path="url(#social-frame)">');
    out.push(`<circle data-field="ring" cx="540" cy="540" r="463" fill="none" stroke="#${o.foreground}" stroke-width="126"/>`);
    out.push(`<circle cx="540" cy="540" r="524" fill="none" stroke="#${o.headerColor}" stroke-opacity="0.28" stroke-width="2"/>`);
    out.push(frameDecoration(artwork, o));
    const eventText = fit(event.label.toUpperCase(), 1100, 56, 48, fonts.display);
    const roleText = fit(role.statement.toUpperCase(), 900, 54, 48, fonts[layout.curvedRoleFace ?? 'emphasis']);
    out.push(`<defs>${arc('event-arc', frameBaseline(eventText, true), true)}${arc('role-arc', frameBaseline(roleText, false), false)}</defs>`);
    out.push(group('event', curved(eventText, 'event-arc', o.headerColor, 1100)));
    out.push(group('role', curved(roleText, 'role-arc', o.headerColor, 900)));
    out.push('</g>');
  } else {
    out.push(`<rect width="1080" height="1350" fill="#${o.foreground}"/>`);
    // Opaque, bounded type zones keep custom backgrounds from harming legibility.
    out.push(`<g data-decoration="type-ground" fill="#${o.foreground}"><path d="M 60 48 H 1020 V 336 H 60 Z M 60 990 H 1020 V 1156 H 60 Z${details ? ' M 60 1190 H 1020 V 1304 H 60 Z' : ''}"/></g>`);
    out.push(artwork.announcementDecoration(o));
    const editorial = layout.editorial ?? false;
    out.push(group('role', text(role.statement, editorial ? 76 : 540, 100, o.headerColor, 920, 38, 34, fonts.emphasis, editorial ? 'start' : 'middle')));
    out.push(group('event', artwork.announcementHeading(event, o, fonts, text)));
    out.push(portrait(profile, o, avatarData, 660, 300, fonts));
    if (name) out.push(group('name', text(name, editorial ? 76 : 540, 1064, o.nameColor, 912, 82, 38, fonts.display, editorial ? 'start' : 'middle')));
    if (handle) out.push(group('handle', text(handle, editorial ? 76 : 540, 1130, o.nameColor, 880, 30, 20, fonts.body, editorial ? 'start' : 'middle')));
    if (details) out.push(group('eventDetails', `<path d="M ${editorial ? '76 1200 H 1004' : '420 1200 H 660'}" fill="none" stroke="#${o.subHeaderColor}" stroke-opacity="0.4" stroke-width="${editorial ? 1 : 2}"/>` + text(details, editorial ? 76 : 540, 1268, o.subHeaderColor, 920, 29, 24, fonts.body, editorial ? 'start' : 'middle')));
  }
  const height = o.layout === 'avatar' ? 1080 : 1350;
  const title = `${event.label} — ${role.statement}`;
  const description = 'Self-reported WordCamp participation; not an official role verification. Only selected available fields are included.';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" role="img" aria-labelledby="title description" data-layout="${o.layout}" data-event="${event.id}"><title id="title">${xml(title)}</title><desc id="description">${description}</desc><style>${EVENT_FONT_CSS[event.id]}</style>${out.join('')}</svg>`;
}
