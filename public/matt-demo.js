const snapshotAt = '2026-11-03T13:59:50.532Z';

const badges = [
  ['badge-code dashicons dashicons-editor-code', 'Core Contributor'],
  ['badge-code-committer dashicons dashicons-editor-code', 'Core Team'],
  ['badge-meta-contributor dashicons dashicons-networking', 'Meta Contributor'],
  ['badge-plugins dashicons dashicons-admin-plugins', 'Plugin Developer'],
  ['badge-themes dashicons dashicons-admin-appearance', 'Theme Developer'],
  ['badge-marketing-contributor dashicons dashicons-format-status', 'Marketing Contributor'],
  ['badge-photo-contributor dashicons dashicons-camera', 'Photo Contributor'],
  ['badge-photos-team dashicons dashicons-camera', 'Photos Team'],
  ['badge-bbpress-contributor dashicons dashicons-buddicons-replies', 'bbPress Contributor'],
  ['badge-organizer dashicons dashicons-tickets', 'WordCamp Organizer'],
  ['badge-speaker dashicons dashicons-megaphone', 'WordCamp Speaker'],
].map(([className, name]) => Object.freeze({ class: className, name }));

const social = [
  { key: 'twitter', label: '@photomatt', url: 'https://x.com/photomatt' },
  { key: 'linkedin', label: 'mattm', url: 'https://www.linkedin.com/in/mattm' },
  { key: 'flickr', label: 'View Channel', url: 'https://flickr.com/photos/photomatt' },
].map(Object.freeze);

export const MATT_DEMO = Object.freeze({
  snapshotAt,
  avatarPath: null,
  source: Object.freeze({
    profile: 'https://profiles.wordpress.org/matt/',
    avatar: 'https://secure.gravatar.com/avatar/33252cd1f33526af53580fcb1736172f06e6716f32afdd1be19ec3096d15dea5?s=1024&d=mp&r=g',
    social: 'https://en.gravatar.com/767fc9c115a1b989744c755db47feb60.json',
  }),
  profile: Object.freeze({
    userName: 'matt',
    name: 'Matt Mullenweg',
    avatar: null,
    memberSince: 'April 4th, 2003',
    badges: Object.freeze(badges),
    profileUrl: 'https://profiles.wordpress.org/matt/',
    fetchedAt: snapshotAt,
    jobTitle: '',
    organization: '',
    jobLine: '',
    location: 'San Francisco, CA',
    joined: 'Apr 2003',
    userId: '1',
    website: Object.freeze({ label: 'ma.tt', url: 'https://profiles.wordpress.org/website-redirect/matt' }),
    github: Object.freeze({ label: 'github.com/m', url: 'https://github.com/m' }),
    slack: '@matt',
    social: Object.freeze(social),
    teams: Object.freeze(['Core']),
    socialUnavailable: false,
  }),
});
