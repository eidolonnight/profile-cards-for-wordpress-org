import { ProfileError, queryOptions, getProfile, getAvatarData, profileMaxAgeMs, apiHeaders, errorResponse } from './_profile.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const params = url.searchParams;
    for (const key of params.keys()) {
      if (!['username', 'size'].includes(key) || params.getAll(key).length !== 1) throw new ProfileError('invalid_parameter', `Unsupported or repeated parameter: ${key.slice(0, 40)}.`);
    }
    const requestedSize = params.get('size');
    if (!['0', '320', '1024'].includes(requestedSize)) throw new ProfileError('invalid_option', 'size is required and must be 0, 320 or 1024.');
    // Reuse the exact card username validation, without adding preview-only options.
    params.delete('size');
    const { username } = queryOptions({ url: url.href });
    const size = Number(requestedSize);
    const profile = await getProfile(username);
    // getAvatarData already bounds, type-checks and signature-checks raster bytes.
    const data = size === 0 ? null : await getAvatarData(profile.avatar, globalThis.fetch, { size });
    return Response.json({ profile, avatar: { size, data, status: size === 0 ? 'hidden' : data ? 'embedded' : 'initials' }, maxAgeMs: profileMaxAgeMs(profile) }, { headers: apiHeaders });
  } catch (error) { return errorResponse(error); }
}
