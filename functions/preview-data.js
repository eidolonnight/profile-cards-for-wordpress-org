import { ProfileError, queryOptions, getProfile, getAvatarData, profileMaxAgeMs, apiHeaders, errorResponse } from './_profile.js';

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
// Clients released before size=all reject legacy envelopes above 15 minutes.
const LEGACY_MAX_AGE_MS = 15 * 60 * 1000;

function jsonResponse(value) {
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
    throw new ProfileError('preview_too_large', 'This profile is too large to preview safely. Please try a public card instead.', 502);
  }
  return new Response(body, { headers: { ...apiHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const params = url.searchParams;
    for (const key of params.keys()) {
      if (!['username', 'size'].includes(key) || params.getAll(key).length !== 1) throw new ProfileError('invalid_parameter', `Unsupported or repeated parameter: ${key.slice(0, 40)}.`);
    }
    const requestedSize = params.get('size');
    if (!['0', '320', '1024', 'all'].includes(requestedSize)) throw new ProfileError('invalid_option', 'size is required and must be 0, 320, 1024 or all.');
    // Reuse the exact card username validation, without adding preview-only options.
    params.delete('size');
    const { username } = queryOptions({ url: url.href });
    const profile = await getProfile(username);
    const avatar = async size => {
      // getAvatarData already bounds, type-checks and signature-checks raster bytes.
      const data = await getAvatarData(profile.avatar, globalThis.fetch, { size });
      return { size, data, status: data ? 'embedded' : 'initials' };
    };
    if (requestedSize === 'all') {
      const avatars = await Promise.all([320, 1024].map(avatar));
      return jsonResponse({ profile, avatars, maxAgeMs: profileMaxAgeMs(profile) });
    }
    const size = Number(requestedSize);
    const result = size === 0 ? { size, data: null, status: 'hidden' } : await avatar(size);
    return jsonResponse({ profile, avatar: result, maxAgeMs: Math.min(profileMaxAgeMs(profile), LEGACY_MAX_AGE_MS) });
  } catch (error) { return errorResponse(error); }
}
