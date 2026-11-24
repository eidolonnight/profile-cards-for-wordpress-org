import { EVENTS, ROLES } from './catalog.js';
import { DEFAULT_COLORS, ProfileError } from '../shared/options.js';
import { EVENT_FONT_CSS, EVENT_FONT_STYLE_HASH, EVENT_FONTS, measureEventText } from './fonts.js';
import { xml, contrastInk } from '../shared/svg.js';
import { EVENT_ARTWORK } from './artwork.js';
import { EVENT_FRAMES } from './frames.js';

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
// The offline frame-drawing tool letters interim artwork with the same fitting.
export { fit as fitEventText, attributes as eventTextAttributes };
// `area` is the photo circle and its bounding square. Avatar-frame artwork covers
// the photo edge itself, so it skips the outline.
function portrait(profile, o, data, area, fonts, outline = true) {
  if (!o.avatar) return '';
  const { cx, cy, r: radius } = area;
  // Keep the existing 2 MiB upstream social-photo allowance after base64
  // expansion; a smaller encoded limit silently replaces valid photos.
  const maxDataLength = 4 * Math.ceil((2 * 1024 * 1024) / 3) + 'data:image/jpeg;base64,'.length;
  const valid = typeof data === 'string' && data.length <= maxDataLength && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data);
  let body = `<defs><clipPath id="social-photo"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath></defs>`;
  if (valid) body += `<image x="${area.x}" y="${area.y}" width="${area.size}" height="${area.size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#social-photo)" href="${data}"/>`;
  else {
    // Deriving initials from a hidden field is still an identity leak.
    const identity = clean(o.name ? profile.name : o.handle ? profile.userName : '');
    const initials = identity.split(/\s+/u).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('') || '?';
    body += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#${o.foreground}"/>`;
    body += text(initials, cx, Math.round((cy + 42) * 100) / 100, o.layout === 'avatar' ? o.headerColor : o.nameColor, Math.round(radius * 1.5), 132, 80, fonts.display);
  }
  if (outline) body += `<circle cx="${cx}" cy="${cy}" r="${radius - 1}" fill="none" stroke="#${o.headerColor}" stroke-opacity="0.15" stroke-width="2"/>`;
  return group('avatar', body);
}

// Every avatar frame is PNG artwork: the photo sits under one image per role, which
// already carries the role, event and decoration. Only the builder renders this: it
// fetches the published PNG (events/frame-loader.js) and passes it in as a data URL,
// because an SVG shown or exported as an image cannot load a linked file. The server
// has no artwork. Circle crops the square artwork to its inscribed circle.
function frameArtwork(event, role, data, bandData, format = 'avatar frame') {
  const frames = Object.hasOwn(EVENT_FRAMES, event.id) ? EVENT_FRAMES[event.id] : null;
  if (!frames) throw new ProfileError('invalid_option', 'Avatar frames are not available for this event yet.');
  const frame = Object.hasOwn(frames.roles, role.id) ? frames.roles[role.id] : null;
  if (!frame) throw new ProfileError('invalid_option', `Select a participation role available for this event\u2019s ${format}.`);
  // Length pins the generated payload; the character class keeps the attribute safe.
  const loaded = [[data, frame], ...(bandData === undefined ? [] : [[bandData, frame.band]])];
  if (loaded.some(([value, record]) => typeof value !== 'string' || value.length !== record?.length || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))) throw new ProfileError('frame_unavailable', `The artwork for this ${format} could not be loaded.`, 500);
  return { photo: frames.photo, frame };
}
function avatarFrame(profile, o, event, role, avatarData, data, fonts) {
  if (!['circle', 'square'].includes(o.shape)) throw new ProfileError('invalid_option', 'shape must be circle or square.');
  const { photo } = frameArtwork(event, role, data);
  const body = portrait(profile, o, avatarData, photo, fonts, false) + `<image data-field="frame" width="1080" height="1080" href="${data}"/>`;
  return o.shape === 'circle' ? `<defs><clipPath id="social-shape"><circle cx="540" cy="540" r="540"/></clipPath></defs><g clip-path="url(#social-shape)">${body}</g>` : body;
}

// A 4:5 social card made from the edition's square avatar-frame artwork: the frame, with
// the photo under it, below its band. The band continues the frame's background to the top
// of the card and carries the name and username, set in the edition's body face like the
// artwork's own lines of text. The artwork already states the role, event, dates and place.
const FRAME_CARD_BAND = 270;
function frameCard(profile, o, event, role, avatarData, data, bandData, fonts, name, handle) {
  const { photo, frame } = frameArtwork(event, role, data, bandData, 'social card');
  // Artwork is not recolored: lettering takes whichever edition color reads on its ground.
  const { nameColor, foreground } = event.colors;
  const ink = contrastInk(nameColor, frame.ground) === nameColor ? nameColor : contrastInk(foreground, frame.ground);
  // The ground color under everything keeps the card opaque behind a photo that is not.
  const out = [`<rect width="1080" height="1350" fill="#${frame.ground}"/>`];
  out.push(`<image data-field="band" width="1080" height="${Math.round(frame.band.height * 108000 / frame.width) / 100}" href="${bandData}"/>`);
  out.push(`<g transform="translate(0 ${FRAME_CARD_BAND})">${portrait(profile, { ...o, ...event.colors }, avatarData, photo, fonts, false)}<image data-field="frame" width="1080" height="1080" href="${data}"/></g>`);
  if (name) out.push(group('name', text(name, 540, handle ? 156 : 188, ink, 960, 64, 34, fonts.body)));
  if (handle) out.push(group('handle', text(handle, 540, name ? 210 : 178, ink, 880, 35.5, 20, fonts.body)));
  return out.join('');
}

export function renderSocial(profile, options = {}, avatarData = null, frameData = null, bandData = null) {
  const event = EVENTS.find(item => item.id === (options.event ?? 'asia-2027'));
  const role = ROLES.find(item => item.id === (options.role ?? 'attendee'));
  if (!event || !role || !['avatar', 'announcement'].includes(options.layout ?? 'avatar')) throw new ProfileError('invalid_option', 'Select a supported social layout, event and role.');
  const o = { ...DEFAULT_COLORS, ...event.colors, layout: 'avatar', shape: 'circle', event: event.id, role: role.id, avatar: true, name: true, handle: true, ...options };
  // Direct renderer callers get the same attribute safety as queryOptions.
  for (const key of Object.keys(DEFAULT_COLORS)) {
    if (!/^[0-9a-f]{6}$/i.test(o[key])) throw new ProfileError('invalid_color', `${key} must be a six-digit hex color without #.`);
    o[key] = o[key].toUpperCase();
  }
  const fonts = EVENT_FONTS[event.id];
  // Dates and location are part of every social card, not an option.
  const details = [event.dateLabel, event.location].filter(Boolean).join(' · ');
  const name = o.name ? clean(profile.name) : '';
  const handle = o.handle && clean(profile.userName) ? '@' + clean(profile.userName) : '';
  const out = [];
  if (o.layout === 'avatar') out.push(avatarFrame(profile, o, event, role, avatarData, frameData, fonts));
  else if (event.frameCard) out.push(frameCard(profile, o, event, role, avatarData, frameData, bandData, fonts, name, handle));
  else {
    const artwork = EVENT_ARTWORK[event.id];
    out.push(`<rect width="1080" height="1350" fill="#${o.foreground}"/>`);
    // Opaque, bounded type zones keep custom backgrounds from harming legibility.
    out.push(`<g data-decoration="type-ground" fill="#${o.foreground}"><path d="M 60 48 H 1020 V 336 H 60 Z M 60 990 H 1020 V 1156 H 60 Z${details ? ' M 60 1190 H 1020 V 1304 H 60 Z' : ''}"/></g>`);
    out.push(artwork.announcementDecoration(o));
    out.push(group('role', text(role.statement, 76, 100, o.headerColor, 920, 38, 34, fonts.emphasis, 'start')));
    out.push(group('event', artwork.announcementHeading(event, o, fonts, text)));
    out.push(portrait(profile, o, avatarData, { cx: 540, cy: 660, r: 300, x: 240, y: 360, size: 600 }, fonts));
    if (name) out.push(group('name', text(name, 76, 1064, o.nameColor, 912, 82, 38, fonts.display, 'start')));
    if (handle) out.push(group('handle', text(handle, 76, 1130, o.nameColor, 880, 30, 20, fonts.body, 'start')));
    if (details) out.push(group('eventDetails', `<path d="M 76 1200 H 1004" fill="none" stroke="#${o.subHeaderColor}" stroke-opacity="0.4" stroke-width="1"/>` + text(details, 76, 1268, o.subHeaderColor, 920, 29, 24, fonts.body, 'start')));
  }
  const height = o.layout === 'avatar' ? 1080 : 1350;
  const title = `${event.label} — ${role.statement}`;
  const description = 'Self-reported WordCamp participation; not an official role verification. Only selected available fields are included.';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" role="img" aria-labelledby="title description" data-layout="${o.layout}" data-event="${event.id}"${o.layout === 'avatar' ? ` data-shape="${o.shape}"` : ''}><title id="title">${xml(title)}</title><desc id="description">${description}</desc><style>${EVENT_FONT_CSS[event.id]}</style>${out.join('')}</svg>`;
}
