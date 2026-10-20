import { DEFAULT_COLORS } from './options.js';
import { FONT_CSS, FONT_METRICS } from './fonts.js';

// Metrics come from the exact embedded fonts. Conservative fallback widths keep
// unsupported scripts readable in system fallback fonts without losing text.
export function measureText(value, size, face = 'sans') {
  if (face === 'mono') return [...String(value)].length * size * 0.66;
  const font = FONT_METRICS[face] || FONT_METRICS.sans;
  return [...String(value)].reduce((width, char) => width + (font.advances[char] ?? (/\p{Mark}/u.test(char) ? 0 : font.units)), 0) / font.units * size;
}
function fitLines(value, maxWidth, size, face = 'sans') {
  const lines = []; let line = '';
  for (const word of String(value).trim().split(/\s+/).filter(Boolean)) {
    if (line && measureText(line + ' ' + word, size, face) > maxWidth) { lines.push(line); line = ''; }
    if (measureText(word, size, face) > maxWidth) {
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line && measureText(line + char, size, face) > maxWidth) { lines.push(line); line = ''; }
        line += char;
      }
    } else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines;
}
function headerText(value, x, y, color, size, face = 'sans', weight = 400, extra = '') {
  const family = face === 'serif' ? "'Card Garamond', Georgia, serif" : face === 'mono' ? 'ui-monospace, Menlo, Consolas, monospace' : "'Card Inter', Arial, sans-serif";
  return `<text x="${x}" y="${y}" fill="#${color}" font-family="${family}" font-size="${size}" font-weight="${weight}"${extra}>${xml(value)}</text>`;
}
// Match the strict public username grammar without trusting page-provided URLs.
function profileLink(userName) {
  return typeof userName === 'string' && /^[a-z0-9][a-z0-9._-]{0,59}$/.test(userName) && !/\s/.test(userName)
    ? `https://profiles.wp.org/${userName}/` : null;
}

// Original, local 24-unit line drawings: never copy/inject upstream SVG or classes.
const BADGE_PATHS = {
  'editor-code': 'M8 6 2 12l6 6m8-12 6 6-6 6M14 3l-4 18',
  networking: 'M12 7v4M5 16v-5h14v5M9 2h6v5H9zM2 16h6v6H2zM16 16h6v6h-6z',
  'admin-page': 'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8',
  'format-status': 'M3 3h18v14H10l-6 5v-5H3zM7 8h10M7 12h7',
  camera: 'M3 6h5l2-3h4l2 3h5v15H3zM16 13a4 4 0 1 1-8 0 4 4 0 1 1 8 0',
  'video-alt2': 'M2 3h20v15H2zM9 7l7 4-7 4zM8 22h8M12 18v4',
  tickets: 'M3 4h18v5a3 3 0 0 0 0 6v5H3v-5a3 3 0 0 0 0-6zM15 5v3m0 3v2m0 3v3',
  // A medal/check makes unknown contributions meaningful without guessing a team.
  fallback: 'M17 9a5 5 0 1 1-10 0 5 5 0 1 1 10 0M9 9l2 2 4-4M8 13l-3 8 7-3 7 3-3-8',
};
// Source: profiles.wordpress.org theme style.css --badge-color declarations.
// Snapshot and hash: evidence/revision-14/badge-colors.md (project evidence).
const BADGE_COLORS = {
  "badge-themes": "4E3288",
  "badge-themes-reviewer": "4E3288",
  "badge-plugins": "F06723",
  "badge-plugins-reviewer": "F06723",
  "badge-community": "11799D",
  "badge-community-contributor": "11799D",
  "badge-meta": "AEADAD",
  "badge-meta-contributor": "AEADAD",
  "badge-code-committer": "CD0000",
  "badge-code": "CD0000",
  "badge-support": "33B4CE",
  "badge-support-contributor": "33B4CE",
  "badge-wordpress-tv": "73AD30",
  "badge-wordpress-tv-contributor": "73AD30",
  "badge-organizer": "F7AD43",
  "badge-speaker": "F7AD43",
  "badge-wordcamp-volunteer": "F7AD43",
  "badge-accessibility": "11799D",
  "badge-accessibility-contributor": "11799D",
  "badge-documentation": "3B7236",
  "badge-documentation-contributor": "3B7236",
  "badge-mobile": "FBA16C",
  "badge-training": "E9C02D",
  "badge-training-contributor": "E9C02D",
  "badge-translation-editor": "C32283",
  "badge-translation-contributor": "C32283",
  "badge-design": "EEC26A",
  "badge-design-contributor": "EEC26A",
  "badge-marketing": "47BEA7",
  "badge-marketing-contributor": "47BEA7",
  "badge-media-corps-team": "139F94",
  "badge-media-corps-contributor": "139F94",
  "badge-wp-cli": "424242",
  "badge-wp-cli-contributor": "424242",
  "badge-hosting": "5358A6",
  "badge-hosting-contributor": "5358A6",
  "badge-tide": "1526FF",
  "badge-tide-contributor": "1526FF",
  "badge-security-team": "00CC3A",
  "badge-security-contributor": "00CC3A",
  "badge-bbpress": "2D8E42",
  "badge-bbpress-contributor": "2D8E42",
  "badge-test": "008080",
  "badge-test-contributor": "008080",
  "badge-patterns-team": "924BB3",
  "badge-pattern-author": "924BB3",
  "badge-photos-team": "CB00F0",
  "badge-photo-contributor": "CB00F0",
  "badge-sustainability-team": "177F6A",
  "badge-sustainability-contributor": "177F6A",
  "badge-playground": "3858E9",
  "badge-playground-contributor": "3858E9",
  "badge-core-ai-team": "7A00DF",
  "badge-core-ai-contributor": "7A00DF",
  "badge-buddypress": "D84800",
  "badge-buddypress-contributor": "D84800",
  "badge-openverse": "C52B9B",
  "badge-openverse-contributor": "C52B9B",
  "badge-performance-team": "0073AA",
  "badge-performance-contributor": "0073AA",
  "badge-credits-graduate": "AE47F2",
  "badge-credits-mentor": "AE47F2",
  "badge-campus-connect-organizer": "3858E9",
  "badge-campus-connect-participant": "3858E9",
  "badge-pathways-contributor": "A8804F",
  "badge-pathways-maintainer": "A8804F"
};
// Exact public badge labels are a fallback for old records without classes.
const BADGE_NAMES = {
  'Core Contributor': 'badge-code',
  'Meta Contributor': 'badge-meta-contributor', 'Documentation Contributor': 'badge-documentation-contributor',
  'Marketing Contributor': 'badge-marketing-contributor', 'Marketing Team': 'badge-marketing',
  'Media Corps Contributor': 'badge-media-corps-contributor', 'Media Corps Team': 'badge-media-corps-team',
  'Photo Contributor': 'badge-photo-contributor', 'WordPress.tv Contributor': 'badge-wordpress-tv-contributor',
  'WordPress.tv Team': 'badge-wordpress-tv', 'WordCamp Organizer': 'badge-organizer',
};
const MODERN_DEFAULTS = { ...DEFAULT_COLORS, header: true, avatar: true, name: true, jobTitle: true, organization: true, handle: true, location: true, joined: true, teams: true, badges: true, badgeNames: true, link: true, social: true, omitTeams: [], omitSocial: [] };
function jobLine(profile, o) {
  const job = o.jobTitle ? profile.jobTitle || '' : '';
  const org = o.organization ? profile.organization || '' : '';
  return job && org ? `${job} at ${org}` : job || org || (o.jobTitle && o.organization ? profile.jobLine || '' : '');
}
function luminance(hex) {
  const rgb = hex.match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrastInk(color, background, minimum = 4.5) {
  const bg = luminance(background); const fg = luminance(color);
  return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= minimum ? color : bg > 0.179 ? '000000' : 'FFFFFF';
}
function badgeGrid(badges, o, width, start = 0, size = 40, fontSize = 22, columns = 0) {
  const gap = 12; const labelGap = 12; const lineHeight = fontSize * 1.4;
  const columnWidth = columns ? (width - gap * (columns - 1)) / columns : 0;
  const maxCell = columns ? columnWidth : o.badgeNames ? Math.min(width, width > 800 ? 590 : 304) : size;
  const out = []; let x = 0; let y = start; let rowHeight = 0;
  for (const badge of badges) {
    const tokens = String(badge.class || '').split(/\s+/);
    const category = tokens.map(token => token.replace(/^dashicons-/, '')).find(token => Object.hasOwn(BADGE_PATHS, token)) || 'fallback';
    const colorKey = tokens.find(token => Object.hasOwn(BADGE_COLORS, token)) || (Object.hasOwn(BADGE_NAMES, badge.name) ? BADGE_NAMES[badge.name] : '');
    const color = BADGE_COLORS[colorKey] || o.badgeLabelColor;
    const ink = contrastInk('FFFFFF', color);
    const labelColor = contrastInk(o.badgeLabelColor, o.foreground);
    const name = badge.name || 'Contributor';
    const labelWidth = maxCell - size - labelGap;
    const lines = o.badgeNames ? fitLines(name, labelWidth, fontSize) : [];
    const cellWidth = lines.length ? size + labelGap + Math.max(...lines.map(line => measureText(line, fontSize))) : size;
    const cellHeight = Math.max(size, lines.length * lineHeight);
    // Fixed columns keep every row's origins identical, even with hidden labels.
    // Advance by the tallest cell so wrapped labels never overlap the next row.
    if (columns ? out.length && out.length % columns === 0 : x && x + cellWidth > width) { x = 0; y += rowHeight + gap; rowHeight = 0; }
    if (columns) x = out.length % columns * (columnWidth + gap);
    const label = xml(name);
    const glyph = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#${color}" stroke="#${contrastInk(color, o.foreground, 3)}" stroke-width="1"/><g aria-hidden="true" transform="translate(${size * 0.2} ${size * 0.2}) scale(${size * 0.6 / 24})" fill="none" stroke="#${ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${BADGE_PATHS[category]}"/></g>`;
    const textY = (cellHeight - lines.length * lineHeight) / 2 + fontSize;
    const text = lines.map((line, i) => headerText(line, size + labelGap, textY + i * lineHeight, labelColor, fontSize, 'sans', 400, ` data-max-width="${labelWidth}" aria-hidden="true"`)).join('');
    out.push(`<g data-field="badges" data-badge="${label}" data-square-badge="${label}" data-badge-color="${color}" data-x="${x}" data-y="${y}" data-size="${size}" data-width="${cellWidth}" data-height="${cellHeight}" role="img" aria-label="${label}" color="#${color}" transform="translate(${x} ${y})"><title>${label}</title>${glyph}${text}</g>`);
    x += cellWidth + gap; rowHeight = Math.max(rowHeight, cellHeight);
  }
  return { body: out.join(''), bottom: out.length ? y + rowHeight : start };
}
// These URLs are display-only. Neither this module nor the browser preview fetches them.
function safeSocialUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f-\u009f]/u.test(value)) return null;
  try {
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(decodeURIComponent(value))) return null;
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
// Local vector glyphs. Unknown services deliberately get a link, never a guessed brand.
const SOCIAL_PATHS = {
  link: 'M10 14l4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  website: 'M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0M2 12h20M12 2c-6 5-6 15 0 20 6-5 6-15 0-20',
  github: 'M8 21v-4c-4 1-5-2-5-2m5 2c-5-1-6-4-5-7 0-2 0-3 1-5l4 2a12 12 0 0 1 8 0l4-2c1 2 1 3 1 5 1 3 0 6-5 7v4',
  twitter: 'M4 3h4l12 18h-4zM20 3 4 21',
  linkedin: 'M4 9v12M4 3v1M10 21V9m0 5c0-6 10-6 10 0v7',
  facebook: 'M14 22V12h5l1-5h-6V5c0-2 2-2 5-2V1h-4c-4 0-6 2-6 6v5H5v5h4v5',
  instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5M17 12a5 5 0 1 1-10 0 5 5 0 1 1 10 0M18 6h.01',
  youtube: 'M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3M10 8l6 4-6 4z',
  flickr: 'M10 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0M22 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0',
};
const SOCIAL_LABELS = { website: 'Website', github: 'GitHub', twitter: 'X / Twitter', x: 'X / Twitter', linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', flickr: 'Flickr', mastodon: 'Mastodon', bluesky: 'Bluesky', threads: 'Threads', tiktok: 'TikTok', tumblr: 'Tumblr', vimeo: 'Vimeo', dribbble: 'Dribbble', stackoverflow: 'Stack Overflow' };
function socialGrid(profile, o, width, start = 0, centered = false) {
  if (!o.social) return { body: '', bottom: start };
  // profile.social is already verified by the canonical parser; explicit false
  // is also rejected for direct consumers, without requiring a new data schema.
  const records = [{ key: 'website', url: profile.website?.url }, { key: 'github', url: profile.github?.url }, ...(Array.isArray(profile.social) ? profile.social : [])];
  const selected = []; const seen = new Set(); const columns = Math.max(1, Math.floor((width + 12) / 56));
  for (const record of records) {
    const key = record?.key; const url = safeSocialUrl(record?.url);
    if (typeof key !== 'string' || !/^[a-z0-9-]{1,40}$/.test(key) || !url || record.verified === false || o.omitSocial.includes(key) || seen.has(url)) continue;
    seen.add(url);
    selected.push({ record, key, url });
  }
  // Filter first: each visible row (including the last partial row) centers on
  // its actual icon count, never on omitted, unsafe or duplicate records.
  const out = selected.map(({ record, key, url }, index) => {
    const icon = key === 'x' ? 'twitter' : Object.hasOwn(SOCIAL_PATHS, key) ? key : 'link';
    const platform = Object.hasOwn(SOCIAL_LABELS, key) ? SOCIAL_LABELS[key] : String(record.label || key);
    const label = xml(`${o.header && o.name && profile.name ? profile.name : 'Profile'} — ${platform}`);
    const rowStart = Math.floor(index / columns) * columns;
    const rowCount = Math.min(columns, selected.length - rowStart);
    const shift = centered ? (width - (rowCount * 56 - 12)) / 2 : 0;
    const x = index % columns * 56 + shift; const y = start + Math.floor(index / columns) * 56;
    return `<a data-social="${key}" data-icon="${icon}" href="${xml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label}" transform="translate(${x} ${y})"><title>${label}</title><rect width="44" height="44" rx="8" fill="#${o.foreground}" stroke="#${contrastInk(o.linkColor, o.foreground)}"/><g aria-hidden="true" focusable="false" transform="translate(10 10)" fill="none" stroke="#${contrastInk(o.linkColor, o.foreground)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${SOCIAL_PATHS[icon]}"/></g></a>`;
  });
  return { body: out.length ? `<g data-field="social">${out.join('')}</g>` : '', bottom: out.length ? start + (Math.ceil(out.length / columns) - 1) * 56 + 44 : start };
}
// Shared inline metadata for both modern formats. Each row wraps complete text;
// links stay next to the handle, rather than drifting below contribution badges.
function metadata(profile, o, width, start, size, centered = false) {
  const items = []; const out = []; const target = o.link ? profileLink(profile.userName) : null;
  if (o.header && o.handle && profile.userName) items.push({ key: 'handle', text: '@' + profile.userName, color: o.headerColor });
  if (target) items.push({ key: 'link', text: `profiles.wp.org/${profile.userName}/`, color: o.linkColor, target });
  if (o.header && o.location && profile.location) items.push({ key: 'location', text: profile.location, color: o.subHeaderColor });
  if (o.header && o.joined && (profile.joined || profile.memberSince)) items.push({ key: 'joined', text: 'joined ' + (profile.joined || profile.memberSince), color: o.subHeaderColor });
  const lineHeight = size * 1.5; const gap = size * 1.3; let y = start; let x = 0; let row = [];
  const flush = () => {
    if (!row.length) return;
    const shift = centered ? (width - x) / 2 : 0;
    for (const item of row) {
      const text = headerText(item.line, item.x + shift, y + size, item.color, size, 'sans', 400, ` data-max-width="${width - 4}"`);
      out.push({ ...item, markup: text });
    }
    y += lineHeight; x = 0; row = [];
  };
  for (const item of items) {
    const lines = fitLines(item.text, width - 4, size);
    for (const [i, line] of lines.entries()) {
      const w = measureText(line, size);
      if (row.length && (i || x + gap + w > width - 2)) flush();
      if (row.length) x += gap;
      row.push({ ...item, line, x }); x += w;
    }
  }
  flush();
  // A wrapped profile link remains one accessible link and one keyboard stop.
  const fields = new Map();
  for (const item of out) {
    if (!fields.has(item.key)) fields.set(item.key, { target: item.target, text: [] });
    fields.get(item.key).text.push(item.markup);
  }
  const body = [...fields].map(([key, item]) => {
    const text = item.text.join('');
    return `<g data-field="${key}">${item.target ? `<a href="${xml(item.target)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text}</g>`;
  }).join('');
  return { body, bottom: y };
}

function renderProfile(profile, options, avatarData) {
  const o = { ...MODERN_DEFAULTS, ...options };
  if (!Object.hasOwn(options, 'linkColor')) o.linkColor = o.subHeaderColor;
  const inset = 44; const top = 84;
  const showAvatar = o.header && o.avatar;
  // Lay out copy once in local coordinates, BEFORE choosing the avatar diameter.
  // A fixed column avoids a text-height/avatar-width circular layout dependency.
  const x = 0; const available = showAvatar ? 1236 : 1620; const right = available;
  const out = []; let cursor = 0; let bottom = 0; let pieces = 0;
  const field = (name, body) => { if (body) { out.push(`<g data-field="${name}">${body}</g>`); pieces++; } };
  const linesBlock = (name, value, size, face, weight, color, lineHeight, gap, baseline = size * 0.82) => {
    if (!value) return;
    const lines = fitLines(value, available - 4, size, face);
    field(name, lines.map((line, index) => headerText(line, x, cursor + baseline + index * lineHeight, color, size, face, weight)).join(''));
    bottom = cursor + lines.length * lineHeight; cursor = bottom + gap;
  };
  if (o.header) {
    if (o.name) linesBlock('name', profile.name, 88, 'serif', 500, o.nameColor, 90, 10, 66);
    linesBlock('jobLine', jobLine(profile, o), 28, 'sansBold', 600, o.headerColor, 38, 16, 25);
  }
  const meta = metadata(profile, o, available, cursor, 26);
  if (meta.body) { out.push(meta.body); pieces++; bottom = meta.bottom; cursor = bottom + 26; }
  const social = socialGrid(profile, o, available, cursor);
  if (social.body) { out.push(social.body); pieces++; bottom = social.bottom; cursor = bottom + 24; }
  if (o.header) {
    const teams = o.teams ? (profile.teams || []).filter(team => !o.omitTeams.includes(team)) : [];
    if (teams.length) {
      let tx = x + 110; let ty = cursor; let rowHeight = 60;
      let body = headerText('TEAMS', x, ty + 38, o.subHeaderColor, 20, 'mono', 400, ' letter-spacing="2"');
      for (const team of teams) {
        const lines = fitLines(team, available - 44, 24, 'sansBold');
        const chipWidth = Math.max(...lines.map(line => measureText(line, 24, 'sansBold'))) + 40;
        const chipHeight = Math.max(60, lines.length * 32 + 24);
        if (tx > x && tx + chipWidth > right - 2) { ty += rowHeight + 12; tx = x; rowHeight = 60; }
        body += `<g data-team="${xml(team)}"><rect x="${tx}" y="${ty}" width="${chipWidth}" height="${chipHeight}" rx="${Math.min(30, chipHeight / 2)}" fill="#${o.foreground}" stroke="#${o.headerColor}" stroke-opacity="0.14" stroke-width="2"/>${lines.map((line, i) => headerText(line, tx + 20, ty + 39 + i * 32, o.badgeLabelColor, 24, 'sansBold', 600)).join('')}</g>`;
        tx += chipWidth + 12; rowHeight = Math.max(rowHeight, chipHeight);
      }
      field('teams', body); bottom = Math.max(bottom, ty + rowHeight); cursor = ty + rowHeight + 24;
    }
  }
  // Match the selected identity/social/team block, excluding contribution badges
  // and trailing whitespace. Social rows now belong to this measured block.
  const textHeight = bottom;
  const avatarSize = showAvatar ? textHeight || 320 : 0;
  const copyX = showAvatar ? inset + avatarSize + 64 : inset;
  const textBody = out.splice(0).join('');
  if (textBody) out.push(`<g data-profile-text="true" data-text-height="${textHeight}" data-text-width="${available}" transform="translate(${copyX} ${top})">${textBody}</g>`);
  if (showAvatar) {
    const valid = typeof avatarData === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarData);
    const centerX = inset + avatarSize / 2; const centerY = top + avatarSize / 2;
    let avatar = `<defs><clipPath id="profile-avatar"><circle cx="${centerX}" cy="${centerY}" r="${avatarSize / 2}"/></clipPath></defs>`;
    if (valid) avatar += `<image x="${inset}" y="${top}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#profile-avatar)" href="${avatarData}"/>`;
    else {
      const initials = String(profile.name || profile.userName || '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('');
      const size = Math.min(65, avatarSize * 0.3);
      avatar += `<circle cx="${centerX}" cy="${centerY}" r="${avatarSize / 2}" fill="#${o.nameColor}" fill-opacity="0.08"/>` + headerText(initials, centerX, centerY + size * 0.35, o.nameColor, size, 'sans', 500, ' text-anchor="middle"');
    }
    avatar += `<circle cx="${centerX}" cy="${centerY}" r="${avatarSize / 2 - 0.5}" fill="none" stroke="#${o.headerColor}" stroke-opacity="0.13"/>`;
    field('avatar', avatar);
  }
  const extras = [];
  if (o.badges && profile.badges?.length) {
    const grid = badgeGrid(profile.badges, o, available, textHeight ? textHeight + 24 : 0);
    extras.push(grid.body); bottom = grid.bottom; pieces++;
  }
  if (extras.length) out.push(`<g data-profile-extras="true" transform="translate(${copyX} ${top})">${extras.join('')}</g>`);

  const height = Math.ceil(Math.max(bottom, avatarSize) + top * 2);
  // Pathological copy expands the canvas, not the column: preserve every line
  // and keep the matched avatar beside it, never overlapping it or going portrait.
  const width = Math.max(1708, copyX + available + inset, height + 1);
  const title = o.header && o.name && profile.name ? `${profile.name} — WordPress.org profile` : 'WordPress.org profile card';
  const description = pieces ? 'Public WordPress.org profile card. Only selected available fields are included.' : 'Empty card. All content is omitted.';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="${o.link || o.social ? 'group' : 'img'}" aria-labelledby="title description" data-layout="profile"><title id="title">${xml(title)}</title><desc id="description">${description}</desc><style>${FONT_CSS}</style><rect width="${width}" height="${height}" fill="#${o.foreground}"/>${out.join('')}</svg>`;
}

function renderSquare(profile, options, avatarData) {
  const o = { ...MODERN_DEFAULTS, ...options };
  o.linkColor = options.linkColor || o.subHeaderColor;
  const out = [headerText('WORDPRESS.ORG', 40, 42, o.headerColor, 13, 'sansBold', 600, ' letter-spacing="1.5"')];
  let y = 74;
  const centered = (field, value, size, color, weight, lineHeight, gap) => {
    if (!value) return;
    const face = weight === 600 ? 'sansBold' : 'sans';
    const rows = fitLines(value, 636, size, face);
    out.push(`<g data-field="${field}">${rows.map((line, i) => headerText(line, 360, y + size * 0.85 + i * lineHeight, color, size, face, weight, ' text-anchor="middle" data-max-width="640"')).join('')}</g>`);
    y += rows.length * lineHeight + gap;
  };
  if (o.header) {
    if (o.avatar) {
      const valid = typeof avatarData === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarData);
      let body = `<defs><clipPath id="square-avatar"><circle cx="360" cy="${y + 56}" r="56"/></clipPath></defs>`;
      if (valid) body += `<image x="304" y="${y}" width="112" height="112" preserveAspectRatio="xMidYMid slice" clip-path="url(#square-avatar)" href="${avatarData}"/>`;
      else {
        const initials = String(profile.name || profile.userName || '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('');
        body += `<circle cx="360" cy="${y + 56}" r="56" fill="#${o.nameColor}" fill-opacity="0.08"/>` + headerText(initials, 360, y + 68, o.nameColor, 34, 'sans', 500, ' text-anchor="middle"');
      }
      out.push(`<g data-field="avatar">${body}</g>`); y += 142;
    }
    if (o.name) centered('name', profile.name, 34, o.nameColor, 600, 42, 10);
    centered('jobLine', jobLine(profile, o), 20, o.headerColor, 600, 29, 12);
  }
  const meta = metadata(profile, o, 640, y, 18, true);
  if (meta.body) { out.push(`<g transform="translate(40 0)">${meta.body}</g>`); y = meta.bottom + 18; }
  const social = socialGrid(profile, o, 640, y, true);
  if (social.body) { out.push(`<g transform="translate(40 0)">${social.body}</g>`); y = social.bottom + 20; }
  if (o.header && o.teams) {
    const teams = (profile.teams || []).filter(team => !o.omitTeams.includes(team));
    if (teams.length) {
      const rows = []; let row = []; let rowWidth = 0; let rowHeight = 0;
      const flush = () => { if (row.length) rows.push({ items: row, width: rowWidth, height: rowHeight }); row = []; rowWidth = 0; rowHeight = 0; };
      for (const team of teams) {
        const lines = fitLines(team, 596, 17, 'sansBold');
        const width = Math.max(...lines.map(line => measureText(line, 17, 'sansBold'))) + 36;
        const height = Math.max(42, lines.length * 25 + 16);
        if (row.length && rowWidth + 10 + width > 640) flush();
        if (row.length) rowWidth += 10;
        row.push({ team, lines, x: rowWidth, width, height }); rowWidth += width; rowHeight = Math.max(rowHeight, height);
      }
      flush(); const body = [];
      for (const row of rows) {
        for (const item of row.items) {
          const x = (720 - row.width) / 2 + item.x;
          body.push(`<g data-team="${xml(item.team)}"><rect x="${x}" y="${y}" width="${item.width}" height="${item.height}" rx="21" fill="#${o.foreground}" stroke="#${o.headerColor}" stroke-opacity="0.14"/>${item.lines.map((line, i) => headerText(line, x + 18, y + 29 + i * 25, o.badgeLabelColor, 17, 'sansBold', 600, ' data-max-width="596"')).join('')}</g>`);
        }
        y += row.height + 10;
      }
      out.push(`<g data-field="teams">${body.join('')}</g>`); y += 14;
    }
  }
  if (o.badges) {
    out.push(`<path d="M40 ${y}H680" stroke="#${o.headerColor}" stroke-opacity="0.18"/>`); y += 30;
    out.push(headerText('CONTRIBUTOR BADGES', 40, y, o.headerColor, 13, 'sansBold', 600, ' letter-spacing="1.2"')); y += 24;
    if (!profile.badges?.length) centered('badges-empty', 'No public badges on this profile yet.', 16, o.subHeaderColor, 400, 25, 0);
    else {
      const grid = badgeGrid(profile.badges, o, 640, y, 40, 16, 3);
      out.push(`<g transform="translate(40 0)">${grid.body}</g>`); y = grid.bottom + 24;
    }
  }
  // Preserve every selected item. Dense cards scale as a whole, never clip or truncate.
  const height = Math.max(720, y + 26);
  const scale = Math.min(1, 720 / height);
  const x = (720 - 720 * scale) / 2; const top = (720 - height * scale) / 2;
  const title = o.header && o.name && profile.name ? `${profile.name} — WordPress.org profile` : 'WordPress.org profile card';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720" role="${o.link || o.social ? 'group' : 'img'}" aria-labelledby="title description" data-layout="square"><title id="title">${xml(title)}</title><desc id="description">Square WordPress.org profile card. Only selected available fields are included.</desc><style>${FONT_CSS}</style><rect width="720" height="720" fill="#${o.foreground}"/><g data-square-content="true" data-content-height="${height}" data-scale="${scale}" transform="translate(${x} ${top}) scale(${scale})">${out.join('')}</g></svg>`;
}

export function renderCard(profile, options = {}, avatarData = null) {
  if (options.layout === 'profile') return renderProfile(profile, options, avatarData);
  if (options.layout === 'square') return renderSquare(profile, options, avatarData);
  return renderClassic(profile, options, avatarData);
}
export const xml = (value) => String(value).replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
function wrap(value, width) {
  const words = String(value).split(/\s+/); const lines = []; let line = '';
  for (let word of words) {
    if (line && [...line + ' ' + word].length > width) { lines.push(line); line = ''; }
    while ([...word].length > width) { if (line) { lines.push(line); line = ''; } lines.push([...word].slice(0, width).join('')); word = [...word].slice(width).join(''); }
    if (word) line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
function text(lines, x, y, color, size = 16, weight = 400, lineHeight = 23) {
  return `<text x="${x}" y="${y}" fill="#${color}" font-size="${size}" font-weight="${weight}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? lineHeight : 0}">${xml(line)}</tspan>`).join('')}</text>`;
}

function renderClassic(profile, options, avatarData = null, wrapText = wrap) {
  const o = { ...DEFAULT_COLORS, header: true, avatar: true, badges: true, link: false, ...options };
  const out = []; const width = 720; let y = 42;
  out.push(text(['WORDPRESS.ORG'], 36, y, o.headerColor, 13, 700)); y += 30;
  if (o.header) {
    const x = o.avatar ? 136 : 36;
    const nameLines = wrapText(profile.name, o.avatar ? 32 : 38, 684 - x, 27);
    const nameY = y + 21;
    if (o.avatar) {
      if (avatarData && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarData)) {
        out.push(`<defs><clipPath id="avatar"><circle cx="76" cy="${y + 36}" r="36"/></clipPath></defs><image x="40" y="${y}" width="72" height="72" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)" href="${avatarData}"/>`);
      } else {
        const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join('');
        out.push(`<circle cx="76" cy="${y + 36}" r="36" fill="#${o.headerColor}" fill-opacity="0.1"/>`, text([initials], 53, y + 45, o.nameColor, 25, 600));
      }
    }
    out.push(text(nameLines, x, nameY, o.nameColor, 27, 600, 33));
    const handleY = nameY + (nameLines.length - 1) * 33 + 29;
    const handleLines = wrapText(`@${profile.userName}`, o.avatar ? 45 : 54, 684 - x, 16);
    out.push(text(handleLines, x, handleY, o.subHeaderColor, 16, 400));
    y = Math.max(y + 96, handleY + (handleLines.length - 1) * 23 + 26);
    if (profile.memberSince) {
      const lines = wrapText(`Member since ${profile.memberSince}`, 60, 648, 15);
      out.push(text(lines, 36, y + 3, o.subHeaderColor, 15)); y += lines.length * 23 + 12;
    }
  }
  if (o.badges) {
    y += 14;
    out.push(`<path d="M36 ${y}H684" stroke="#${o.headerColor}" stroke-opacity="0.2"/>`); y += 34;
    out.push(text(['CONTRIBUTOR BADGES'], 36, y, o.headerColor, 13, 700)); y += 34;
    if (!profile.badges.length) { out.push(text(['No public badges on this profile yet.'], 36, y, o.subHeaderColor, 16)); y += 25; }
    for (let i = 0; i < profile.badges.length; i += 2) {
      const pair = profile.badges.slice(i, i + 2).map(b => wrapText(b.name, 27, 288, 16));
      const rowHeight = Math.max(...pair.map(lines => lines.length)) * 22 + 22;
      pair.forEach((lines, j) => {
        const x = 36 + j * 332;
        out.push(`<circle cx="${x + 10}" cy="${y - 5}" r="10" fill="#${o.badgeLabelColor}" fill-opacity="0.12"/><path d="M${x + 5} ${y - 5}l3 3 6-6" fill="none" stroke="#${o.badgeLabelColor}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`, text(lines, x + 28, y, o.badgeLabelColor, 16, 400, 22));
      });
      y += rowHeight;
    }
  }
  if (o.link) {
    y += 14;
    const label = `profiles.wordpress.org/${profile.userName}/`;
    const lines = wrapText(label, 66, 648, 14);
    out.push(`<a href="${xml(profile.profileUrl)}" target="_blank" rel="noopener noreferrer">${text(lines, 36, y, o.subHeaderColor, 14)}</a>`);
    y += lines.length * 23;
  }
  const height = Math.max(116, y + 22);
  const description = `Public WordPress.org profile for ${profile.name}. ${profile.badges.length} badges.${o.avatar && o.header && !avatarData ? ' Avatar unavailable; initials shown.' : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">${xml(profile.name)} — WordPress.org profile</title><desc id="description">${xml(description)}</desc><rect x="0.5" y="0.5" width="719" height="${height - 1}" rx="12" fill="#${o.foreground}" stroke="#${o.headerColor}" stroke-opacity="0.2"/><g font-family="system-ui, -apple-system, Segoe UI, sans-serif">${out.join('')}</g></svg>`;
}
