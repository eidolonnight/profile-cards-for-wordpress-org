import { queryOptions, getProfile, getAvatarData, apiHeaders, errorResponse } from './_profile.js';
import { renderCard } from './_svg.js';
import { renderSocial, socialStyleHash } from './_social.js';
import { FONT_STYLE_HASH } from './_fonts.js';
export async function GET(request) {
  try {
    const options = queryOptions(request);
    const profile = await getProfile(options.username, { refresh: options.refresh });
    const social = options.layout === 'avatar' || options.layout === 'announcement';
    const showAvatar = options.avatar && (social || options.header);
    const avatar = showAvatar ? await getAvatarData(profile.avatar, globalThis.fetch, { size: social ? 1024 : 320 }) : null;
    const csp = options.layout === 'profile' || options.layout === 'square' || social
      ? `default-src 'none'; img-src data:; font-src data:; style-src '${social ? socialStyleHash(options.event) : FONT_STYLE_HASH}'; base-uri 'none'; frame-ancestors 'none'`
      : "default-src 'none'; img-src data:; style-src 'none'; base-uri 'none'; frame-ancestors 'none'";
    const filename = social ? `${options.username}-${options.event}-${options.layout}.svg` : `${options.username}-wordpress.svg`;
    const svg = social ? renderSocial(profile, options, avatar) : renderCard(profile, options, avatar);
    return new Response(svg, { headers: { ...apiHeaders, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Disposition': `inline; filename="${filename}"`, 'Content-Security-Policy': csp, 'X-Profile-Avatar': avatar ? 'embedded' : showAvatar ? 'initials' : 'hidden' } });
  } catch (error) { return errorResponse(error); }
}
