import { EVENTS, ROLES } from './events.js';
import { DEFAULT_COLORS, ProfileError } from './options.js';
import { EVENT_FONT_CSS, EVENT_FONT_STYLE_HASH, EVENT_FONTS, measureEventText, eventInkCenter } from './event-fonts.js';
import { xml } from './svg.js';

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

// Original vector adaptations of observed botanical accents, not event logos.
function leaf(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M 0 78 C -76 10 -48 -66 44 -98 C 66 -22 73 42 0 78 Z" fill="#00513B"/><path d="M 0 78 Q 12 -10 44 -98 M 9 27 L -28 -4 M 17 0 L 52 -23 M 25 -30 L -3 -52 M 34 -58 L 54 -62" fill="none" stroke="#8BB1C4" stroke-width="2"/></g>`;
}
function flower(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M 0 12 C -80 70 -82 -6 -31 -13 C -85 -73 -11 -92 4 -40 C 39 -101 88 -44 47 -13 C 112 7 62 70 25 31 C 17 92 -45 82 -21 29 Z" fill="#A52B20"/><path d="M -5 9 Q 25 -7 57 -53" fill="none" stroke="#FCC626" stroke-width="5"/></g>`;
}
function frameDecoration(event, o) {
  // Solid type strips remain above a user background, while the side wedges
  // expose that background. All decorations inherit the annulus clip.
  let body = `<path d="M 114 358 A 463 463 0 0 1 966 358 M 114 722 A 463 463 0 0 0 966 722" fill="none" stroke="#${o.foreground}" stroke-width="116"/>`;
  if (event.id === 'asia-2027') body += leaf(997, 534, 0.54) + flower(82, 553, 0.52);
  else if (event.id === 'india-2027') body += `<path d="M 36 514 H 110 M 970 564 H 1044" stroke="#${o.badgeLabelColor}" stroke-width="7"/><path d="M 36 564 H 110 M 970 514 H 1044" stroke="#3DD68C" stroke-width="7"/>`;
  else body += `<path d="M 40 540 H 110 M 970 540 H 1040" stroke="#${o.badgeLabelColor}" stroke-width="${event.id === 'us-2027' ? 5 : 2}"/>`;
  return `<g data-decoration="frame">${body}</g>`;
}
function announcementDecoration(event, o) {
  if (event.id === 'asia-2027') return `<g data-decoration="botanical"><defs><clipPath id="botanical-sides"><path d="M 0 335 H 194 V 965 H 0 Z M 886 335 H 1080 V 965 H 886 Z"/></clipPath></defs><g clip-path="url(#botanical-sides)">${leaf(1040, 425, 1.35)}${flower(42, 893, 1.25)}</g><path d="M 495 340 H 585" stroke="#FCC626" stroke-width="5"/></g>`;
  if (event.id === 'europe-2027') return `<g data-decoration="editorial" fill="none" stroke="#${o.headerColor}" stroke-width="1"><path d="M 76 130 H 1004 M 76 312 H 1004 M 76 980 H 1004"/></g>`;
  if (event.id === 'india-2027') return `<g data-decoration="typographic"><path d="M 76 128 H 1004 M 76 980 H 1004" stroke="#${o.subHeaderColor}" stroke-opacity="0.35"/><path d="M 940 173 H 984 V 217 H 940 Z" fill="#${o.badgeLabelColor}"/><path d="M 940 236 H 984 V 280 H 940 Z" fill="none" stroke="#3DD68C" stroke-width="2"/></g>`;
  return `<g data-decoration="template"><defs><linearGradient id="template-blue"><stop stop-color="#${o.headerColor}"/><stop offset="1" stop-color="#00A7F4"/></linearGradient></defs><path d="M 300 292 H 780" stroke="url(#template-blue)" stroke-width="6"/></g>`;
}
function announcementHeading(event, o, fonts) {
  if (event.id === 'asia-2027' || event.id === 'india-2027') {
    const asia = event.id === 'asia-2027'; const x = asia ? 540 : 76; const anchor = asia ? 'middle' : 'start';
    // Keep a literal separating space for accessible text and field consumers.
    const customHeader = o.headerColor !== event.colors.headerColor;
    const first = text('WordCamp ', x, asia ? 202 : 223, asia || customHeader ? o.headerColor : o.badgeLabelColor, asia ? 920 : 830, asia ? 101 : 122, 82, fonts.display, anchor).replace('>WordCamp</text>', '>WordCamp </text>');
    const last = text(asia ? 'Asia' : 'India', x, asia ? 316 : 326, customHeader ? o.headerColor : asia ? o.badgeLabelColor : '3DD68C', 830, asia ? 110 : 122, 82, fonts.display, anchor);
    return first + last;
  }
  const europe = event.id === 'europe-2027';
  return text(event.name, europe ? 76 : 540, europe ? 259 : 231, o.headerColor, 928, europe ? 89 : 98, 65, fonts.display, europe ? 'start' : 'middle');
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
  const details = o.eventDetails ? [event.dateLabel, event.location].filter(Boolean).join(' · ') : '';
  const name = o.name ? clean(profile.name) : '';
  const handle = o.handle && clean(profile.userName) ? '@' + clean(profile.userName) : '';
  const out = [];
  if (o.layout === 'avatar') {
    out.push(portrait(profile, o, avatarData, 540, 400, fonts));
    out.push('<defs><clipPath id="social-frame"><path clip-rule="evenodd" d="M 14 540 A 526 526 0 1 0 1066 540 A 526 526 0 1 0 14 540 Z M 140 540 A 400 400 0 1 0 940 540 A 400 400 0 1 0 140 540 Z"/></clipPath></defs><g clip-path="url(#social-frame)">');
    out.push(`<circle data-field="ring" cx="540" cy="540" r="463" fill="none" stroke="#${o.foreground}" stroke-width="126"/>`);
    out.push(`<circle cx="540" cy="540" r="524" fill="none" stroke="#${o.headerColor}" stroke-opacity="0.28" stroke-width="2"/>`);
    out.push(frameDecoration(event, o));
    const eventText = fit(event.label.toUpperCase(), 1100, 56, 48, fonts.display);
    const roleText = fit(role.statement.toUpperCase(), 900, 54, 48, event.id === 'asia-2027' ? fonts.display : fonts.emphasis);
    out.push(`<defs>${arc('event-arc', frameBaseline(eventText, true), true)}${arc('role-arc', frameBaseline(roleText, false), false)}</defs>`);
    out.push(group('event', curved(eventText, 'event-arc', o.headerColor, 1100)));
    out.push(group('role', curved(roleText, 'role-arc', o.headerColor, 900)));
    out.push('</g>');
  } else {
    out.push(`<rect width="1080" height="1350" fill="#${o.foreground}"/>`);
    // Opaque, bounded type zones keep custom backgrounds from harming legibility.
    out.push(`<g data-decoration="type-ground" fill="#${o.foreground}"><path d="M 60 48 H 1020 V 336 H 60 Z M 60 990 H 1020 V 1156 H 60 Z${details ? ' M 60 1190 H 1020 V 1304 H 60 Z' : ''}"/></g>`);
    out.push(announcementDecoration(event, o));
    const editorial = event.id === 'europe-2027' || event.id === 'india-2027';
    out.push(group('role', text(role.statement, editorial ? 76 : 540, 100, o.headerColor, 920, 38, 34, fonts.emphasis, editorial ? 'start' : 'middle')));
    out.push(group('event', announcementHeading(event, o, fonts)));
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
