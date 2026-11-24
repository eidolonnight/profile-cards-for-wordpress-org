import { queryOptions, getProfile, getAvatarData, apiHeaders, errorResponse, ProfileError } from './_profile.js';
import { renderCard } from './_svg.js';
import { renderSocial, socialStyleHash } from './_social.js';
import { FONT_STYLE_HASH } from './_fonts.js';
import { EVENTS } from './_events.js';
export async function GET(request) {
  try {
    const options = queryOptions(request);
    // Avatar frames, and social cards derived from them, are composed in the builder from
    // the published PNGs; this route has no artwork.
    if (options.layout === 'avatar') throw new ProfileError('invalid_option', 'layout must be classic, profile, square or announcement.');
    if (options.layout === 'announcement' && EVENTS.find(event => event.id === options.event).frameCard) throw new ProfileError('invalid_option', 'This event\u2019s social card is not available from this route.');
    const profile = await getProfile(options.username, { refresh: options.refresh });
    const social = options.layout === 'announcement';
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
