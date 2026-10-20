import { parseHTML } from 'linkedom/worker';
import { ProfileError } from '../shared/options.js';
export { ProfileError, DEFAULT_COLORS, queryOptions } from '../shared/options.js';

const TTL = 15 * 60 * 1000;
// Relative freshness for preview clients; use the same timestamp and TTL as the cache.
export function profileMaxAgeMs(profile, now = Date.now()) {
  const fetchedAt = Date.parse(profile.fetchedAt);
  return Number.isFinite(fetchedAt) ? Math.max(0, Math.min(TTL, Math.floor(fetchedAt + TTL - now))) : 0;
}
const cache = new Map();
const pending = new Map();
const avatars = new Map();
const avatarPending = new Map();
let avatarEncodedBytes = 0;
const AVATAR_CACHE_BYTES = 8 * 1024 * 1024;
const USER = /^[a-z0-9][a-z0-9._-]{0,59}$/;
const GRAVATAR = new Set(['secure.gravatar.com', 'www.gravatar.com', 'gravatar.com', '0.gravatar.com', '1.gravatar.com', '2.gravatar.com']);
const SOCIAL_KEY = /^[a-z0-9-]{1,40}$/;
const EXCLUDED_SOCIAL = new Set(['wordpress', 'blogger', 'yahoo', 'foursquare', 'tripit', 'goodreads']);
const GRAVATAR_HASH = /^(?:[a-f0-9]{32}|[a-f0-9]{64})$/;

const clean = (text) => (text || '').replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '').replace(/\s+/g, ' ').trim();
export function safeAvatar(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !GRAVATAR.has(url.hostname) || !/^\/avatar\/[a-f0-9]{32,64}$/i.test(url.pathname)) return null;
    // Only the avatar identity comes from the page. Do not relay arbitrary query strings.
    // Match the larger banner photo without increasing the bounded image budget.
    url.search = '?s=320&d=mp&r=g';
    return url.href;
  } catch { return null; }
}

// Optional metadata is bounded and ignored if malformed; it must not make an
// otherwise readable public profile fail. Link URLs are display-only, not fetch targets.
function textField(value, limit = 500) {
  if (typeof value !== 'string') return '';
  const text = clean(value);
  return text.length <= limit ? text : '';
}
function safeLink(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f-\u009f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
function personData(document, profileUrl) {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      if (!Array.isArray(data?.['@graph'])) continue;
      const person = data['@graph'].find(item => item && (item['@type'] === 'Person' || (Array.isArray(item['@type']) && item['@type'].includes('Person'))) && item['@id'] === `${profileUrl}#person` && (!item.url || item.url === profileUrl));
      if (person) return { jobTitle: textField(person.jobTitle), organization: textField(person.worksFor?.name) };
    } catch { /* JSON only: never evaluate page scripts or JSON-LD. */ }
  }
  return { jobTitle: '', organization: '' };
}
function socialAccounts(accounts) {
  const social = []; const seen = new Set();
  for (const account of accounts) {
    const key = account?.shortname;
    const url = safeLink(account?.url);
    if (account?.verified !== true || typeof key !== 'string' || key.trim() !== key || !SOCIAL_KEY.test(key) || EXCLUDED_SOCIAL.has(key) || !url || seen.has(key)) continue;
    seen.add(key);
    social.push({ key, label: textField(account.display, 240) || key, url });
  }
  return social;
}
function headerData(document, header, profileUrl, memberSince) {
  let { jobTitle, organization } = personData(document, profileUrl);
  const jobLine = textField(header.querySelector('.wp-p2-jobline')?.textContent);
  // Keep the raw job line, while recovering independent controls on older pages.
  if (!jobTitle && !organization && jobLine) {
    const parts = /^(.*?)\s+at\s+(.+)$/.exec(jobLine);
    jobTitle = parts ? parts[1] : jobLine;
    organization = parts ? parts[2] : '';
  } else if (!organization && jobTitle && jobLine.startsWith(`${jobTitle} at `)) {
    organization = jobLine.slice(jobTitle.length + 4);
  } else if (!jobTitle && organization && jobLine.endsWith(` at ${organization}`)) {
    jobTitle = jobLine.slice(0, -(organization.length + 4));
  }
  let website = null; let github = null; let slack = '';
  const anchors = [...header.querySelectorAll('.wp-p2-links > a')];
  for (const [index, anchor] of anchors.entries()) {
    const url = safeLink(anchor.getAttribute('href'));
    if (!url) continue;
    const parsed = new URL(url);
    const label = textField(anchor.textContent, 240);
    if (parsed.hostname === 'github.com' && !parsed.port) {
      if (!github) github = { label: label || parsed.hostname + parsed.pathname, url };
    } else if (url === 'https://make.wordpress.org/chat/') {
      slack = label.replace(/^Slack:\s*/i, '');
    } else if (index === 0) {
      website = { label: label || parsed.hostname, url };
    }
  }
  const teams = [];
  for (const row of header.querySelectorAll('.wp-p2-chip-row')) {
    if (clean(row.querySelector('.wp-p2-chip-label')?.textContent).toLowerCase() !== 'teams') continue;
    for (const chip of row.querySelectorAll('.wp-p2-chip')) {
      const team = textField(chip.textContent, 80);
      if (team && !teams.includes(team)) teams.push(team);
    }
  }
  const userId = document.querySelector('[data-tl-pager][data-user]')?.getAttribute('data-user');
  // Pre-rendered accounts are accepted only with explicit verification metadata.
  const social = socialAccounts([...header.querySelectorAll('#user-social-media-accounts a')].map(anchor => ({ shortname: anchor.getAttribute('data-shortname') || anchor.getAttribute('aria-label'), display: anchor.getAttribute('aria-label'), url: anchor.getAttribute('href'), verified: anchor.getAttribute('data-verified') === 'true' })));
  return { jobTitle, organization, jobLine: jobLine || [jobTitle, organization].filter(Boolean).join(' at '), location: textField(header.querySelector('.wp-p2-loc')?.textContent), joined: textField(header.querySelector('.wp-p2-joined')?.textContent || memberSince).replace(/^joined\s+/i, ''), userId: userId?.trim() === userId && /^[1-9][0-9]{0,19}$/.test(userId || '') ? userId : null, website, github, slack, social, teams };
}
function gravatarIdentity(document) {
  const script = document.querySelector('script#wporg-profiles-js-extra');
  if (!script) return { hash: null, unavailable: false };
  try {
    // Allow only the exact assignment plus WordPress's optional sourceURL comment.
    const match = /^\s*var\s+userProfileData\s*=\s*(\{[\s\S]*\})\s*;\s*(?:\/\/# sourceURL=wporg-profiles-js-extra\s*)?$/.exec(script.textContent);
    const data = match && JSON.parse(match[1]);
    if (typeof data?.gravatarHash === 'string' && [32, 64].includes(data.gravatarHash.length) && GRAVATAR_HASH.test(data.gravatarHash)) return { hash: data.gravatarHash, unavailable: false };
  } catch { /* Invalid or executable JavaScript is not profile JSON. */ }
  return { hash: null, unavailable: true };
}

function parseProfileData(html, username, now) {
  const { document } = parseHTML(html);
  const header = document.querySelector('header.site-header');
  const name = clean(header?.querySelector('h2')?.textContent);
  if (!name || name.length > 500) throw new ProfileError('profile_unreadable', 'WordPress.org returned a page we could not read. Please try again later.', 502);
  const identity = document.querySelector('meta[property="profile:username"]')?.getAttribute('content');
  if (identity && identity !== username) throw new ProfileError('profile_mismatch', 'WordPress.org returned a different profile. Please check the username.', 502);
  const memberSince = clean(document.querySelector('#user-member-since strong')?.textContent || header.querySelector('.wp-p2-joined')?.textContent?.replace(/^joined\s+/i, ''));
  let nodes = [...document.querySelectorAll('.wp-p2-badges-block .medal')];
  const legacy = nodes.length === 0;
  if (legacy) nodes = [...document.querySelectorAll('#user-badges .badge, #user-badges .item')];
  const seen = new Set();
  const badges = [];
  for (const node of nodes) {
    const name = clean(node.querySelector('.mn')?.textContent || (legacy ? (node.getAttribute('title') || node.textContent) : ''));
    if (!name || seen.has(name)) continue;
    if (name.length > 240 || badges.length >= 200) throw new ProfileError('profile_unreadable', 'This profile has an unsupported badge format.', 502);
    seen.add(name);
    const classes = `${node.className || ''} ${node.querySelector('.mi')?.className || ''}`.split(/\s+/).filter(c => /^(?:badge-[a-z0-9-]+|dashicons(?:-[a-z0-9-]+)?)$/.test(c));
    badges.push({ class: [...new Set(classes)].join(' '), name });
  }
  const profileUrl = `https://profiles.wordpress.org/${username}/`;
  const gravatar = gravatarIdentity(document);
  const profile = { userName: username, name, avatar: safeAvatar(header.querySelector('img.avatar')?.getAttribute('src')), memberSince, badges, profileUrl, fetchedAt: new Date(now).toISOString(), ...headerData(document, header, profileUrl, memberSince), socialUnavailable: gravatar.unavailable };
  return { profile, gravatarHash: gravatar.hash };
}

export function parseProfile(html, username, now = Date.now()) {
  return parseProfileData(html, username, now).profile;
}

export async function boundedFetch(url, { fetcher = globalThis.fetch, maxBytes = 1024 * 1024, accept = 'text/html', timeout = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: accept } });
    if (response.status === 404) throw new ProfileError('profile_not_found', 'No public WordPress.org profile was found for that username.', 404);
    if (response.status === 429) throw new ProfileError('upstream_busy', 'WordPress.org is limiting requests. Please try again later.', 503);
    if (!response.ok) throw new ProfileError('upstream_unavailable', 'The public profile service is unavailable. Please try again later.', 502);
    if (Number(response.headers.get('content-length')) > maxBytes) throw new ProfileError('upstream_too_large', 'The upstream response is too large.', 502);
    const chunks = []; let length = 0;
    if (!response.body) throw new ProfileError('upstream_empty', 'The public profile service returned an empty response.', 502);
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) { await reader.cancel(); throw new ProfileError('upstream_too_large', 'The upstream response is too large.', 502); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    return { body, type: (response.headers.get('content-type') || '').split(';')[0].toLowerCase() };
  } catch (error) {
    // Also close rejected status/header responses; clearing the timer alone leaves their bodies streaming.
    controller.abort();
    if (error instanceof ProfileError) throw error;
    throw new ProfileError('upstream_unavailable', 'The public profile service could not be reached. Please try again later.', 502);
  } finally { clearTimeout(timer); }
}

function remember(map, key, value, limit) { map.delete(key); map.set(key, value); while (map.size > limit) map.delete(map.keys().next().value); }
export async function getProfile(username, { refresh = false, fetcher = globalThis.fetch, now = Date.now() } = {}) {
  if (!USER.test(username)) throw new ProfileError('invalid_username', 'Invalid WordPress.org profile username.');
  const hit = cache.get(username);
  // A refresh bypasses the ordinary TTL, but not the minimum interval protecting the upstream.
  if (hit && now - hit.time < (refresh ? 60000 : TTL)) return hit.profile;
  if (pending.has(username)) return pending.get(username);
  if (pending.size >= 8) throw new ProfileError('busy', 'The card service is busy. Please try again shortly.', 503);
  const promise = (async () => {
    const result = await boundedFetch(`https://profiles.wordpress.org/${encodeURIComponent(username)}/`, { fetcher });
    if (!['text/html', 'application/xhtml+xml'].includes(result.type)) throw new ProfileError('profile_unreadable', 'WordPress.org returned an unexpected response.', 502);
    const { profile, gravatarHash } = parseProfileData(new TextDecoder().decode(result.body), username, now);
    if (gravatarHash) {
      try {
        // Only this fixed origin and a validated opaque hash can become a request.
        // Website, account, JSON-LD and avatar URLs never determine this URL.
        // Use the canonical English endpoint directly; www redirects here.
        const social = await boundedFetch(`https://en.gravatar.com/${gravatarHash}.json`, { fetcher, maxBytes: 256 * 1024, accept: 'application/json', timeout: 4000 });
        if (social.type !== 'application/json') throw new Error('Unexpected social response type');
        const data = JSON.parse(new TextDecoder().decode(social.body));
        const entry = data?.entry?.[0];
        if (!Array.isArray(data?.entry) || !entry || typeof entry !== 'object' || (entry.accounts !== undefined && !Array.isArray(entry.accounts))) throw new Error('Unexpected social response');
        profile.social = socialAccounts(entry.accounts ?? []);
      } catch { profile.socialUnavailable = true; }
    }
    remember(cache, username, { time: now, profile }, 128);
    return profile;
  })();
  pending.set(username, promise);
  try { return await promise; } finally { pending.delete(username); }
}

function forgetAvatar(url) {
  const entry = avatars.get(url);
  if (entry) { avatarEncodedBytes -= entry.data.length; avatars.delete(url); }
}

export async function getAvatarData(avatar, fetcher = globalThis.fetch, { size = 320 } = {}) {
  if (size !== 320 && size !== 1024) return null;
  let url = safeAvatar(avatar);
  if (!url) return null;
  if (size === 1024) {
    const hash = new URL(url).pathname.slice('/avatar/'.length).toLowerCase();
    if (!GRAVATAR_HASH.test(hash)) return null;
    // High-resolution photos use one fixed origin and fail to initials when
    // absent, rather than silently embedding Gravatar's generic default photo.
    url = `https://secure.gravatar.com/avatar/${hash}?s=1024&d=404&r=g`;
  }
  const hit = avatars.get(url);
  if (hit && Date.now() - hit.time < TTL) {
    avatars.delete(url); avatars.set(url, hit);
    return hit.data;
  }
  if (hit) forgetAvatar(url);
  if (avatarPending.has(url)) return avatarPending.get(url);
  if (avatarPending.size >= 8) return null;
  const promise = (async () => {
    try {
      const { body, type } = await boundedFetch(url, { fetcher, maxBytes: size === 1024 ? 2 * 1024 * 1024 : 256 * 1024, accept: 'image/png,image/jpeg,image/webp', timeout: 6000 });
      const png = type === 'image/png' && body[0] === 137 && body[1] === 80 && body[2] === 78 && body[3] === 71;
      const jpg = type === 'image/jpeg' && body[0] === 255 && body[1] === 216 && body[2] === 255;
      const webp = type === 'image/webp' && new TextDecoder().decode(body.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(body.slice(8, 12)) === 'WEBP';
      if (!png && !jpg && !webp) return null;
      let binary = '';
      for (let i = 0; i < body.length; i += 8192) binary += String.fromCharCode(...body.subarray(i, i + 8192));
      const data = `data:${type};base64,${btoa(binary)}`;
      forgetAvatar(url);
      avatars.set(url, { time: Date.now(), data }); avatarEncodedBytes += data.length;
      while (avatars.size > 32 || avatarEncodedBytes > AVATAR_CACHE_BYTES) forgetAvatar(avatars.keys().next().value);
      return data;
    } catch { return null; }
  })();
  avatarPending.set(url, promise);
  try { return await promise; } finally { avatarPending.delete(url); }
}

export const apiHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
export function errorResponse(error) {
  const known = error instanceof ProfileError;
  return Response.json({ error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'The card could not be generated. Please try again.' } }, { status: known ? error.status : 500, headers: apiHeaders });
}
