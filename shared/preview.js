import { ProfileError, queryOptions } from './options.js';
import { renderCard } from './svg.js';
import { renderSocial } from './social.js';

// Pure browser entry: only server-provided profile/photo data, never network I/O.
export function renderPreview(profile, queryString, avatarData = null) {
  if (typeof queryString !== 'string') throw new ProfileError('invalid_parameter', 'Preview options must be a query string.');
  const url = new URL('https://preview.invalid/card');
  url.search = queryString;
  const options = queryOptions({ url: url.href });
  if (!profile || profile.userName !== options.username) throw new ProfileError('profile_mismatch', 'The preview profile does not match the requested username.');
  const social = options.layout === 'avatar' || options.layout === 'announcement';
  const avatar = options.avatar && (social || options.header) ? avatarData : null;
  return social ? renderSocial(profile, options, avatar) : renderCard(profile, options, avatar);
}
