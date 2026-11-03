import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('bundled Matt snapshot is dated, local, and sufficient for every card layout', async () => {
  const { MATT_DEMO } = await import('../public/matt-demo.js');
  assert.equal(MATT_DEMO.snapshotAt, '2026-11-03T13:59:50.532Z');
  assert.equal(MATT_DEMO.avatarPath, null);
  assert.deepEqual(MATT_DEMO.source, {
    profile: 'https://profiles.wordpress.org/matt/',
    avatar: 'https://secure.gravatar.com/avatar/33252cd1f33526af53580fcb1736172f06e6716f32afdd1be19ec3096d15dea5?s=1024&d=mp&r=g',
    social: 'https://en.gravatar.com/767fc9c115a1b989744c755db47feb60.json',
  });
  assert.deepEqual({
    userName: MATT_DEMO.profile.userName,
    name: MATT_DEMO.profile.name,
    profileUrl: MATT_DEMO.profile.profileUrl,
    memberSince: MATT_DEMO.profile.memberSince,
    joined: MATT_DEMO.profile.joined,
    location: MATT_DEMO.profile.location,
    teams: MATT_DEMO.profile.teams,
    badgeNames: MATT_DEMO.profile.badges.map(badge => badge.name),
    socialKeys: MATT_DEMO.profile.social.map(account => account.key),
  }, {
    userName: 'matt',
    name: 'Matt Mullenweg',
    profileUrl: 'https://profiles.wordpress.org/matt/',
    memberSince: 'April 4th, 2003',
    joined: 'Apr 2003',
    location: 'San Francisco, CA',
    teams: ['Core'],
    badgeNames: ['Core Contributor', 'Core Team', 'Meta Contributor', 'Plugin Developer', 'Theme Developer', 'Marketing Contributor', 'Photo Contributor', 'Photos Team', 'bbPress Contributor', 'WordCamp Organizer', 'WordCamp Speaker'],
    socialKeys: ['twitter', 'linkedin', 'flickr'],
  });
  assert.equal(MATT_DEMO.profile.fetchedAt, MATT_DEMO.snapshotAt);
  assert.equal(MATT_DEMO.profile.avatar, null, 'runtime must use generated initials rather than an external avatar URL');
});

test('third-party notice preserves snapshot provenance and confirms that no portrait is redistributed', async () => {
  const notice = await readFile(new URL('../public/THIRD-PARTY-NOTICES.txt', import.meta.url), 'utf8');
  assert.match(notice, /MATT DEMO PROFILE SNAPSHOT/);
  assert.match(notice, /https:\/\/profiles\.wordpress\.org\/matt\//);
  assert.match(notice, /captured on 2026-11-03/);
  assert.match(notice, /https:\/\/en\.gravatar\.com\/767fc9c115a1b989744c755db47feb60\.json/);
  assert.match(notice, /No portrait is\s+redistributed/);
  assert.match(notice, /renders initials instead/);
  assert.doesNotMatch(notice, /matt-demo-avatar\.jpg/);
});

test('the former bundled portrait is absent from the public source tree', async () => {
  await assert.rejects(readFile(new URL('../public/matt-demo-avatar.jpg', import.meta.url)), { code: 'ENOENT' });
});
