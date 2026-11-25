import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom/worker';

const root = new URL('../', import.meta.url);

test('builder leads with the default WordCamp social card while preserving profile/classic choices', async () => {
  const { document } = parseHTML(await readFile(new URL('public/index.html', root), 'utf8'));
  assert.deepEqual([...document.querySelectorAll('#layout option:not([hidden])')].map(option => [option.value, option.textContent]), [['announcement', 'WordCamp social card'], ['avatar', 'WordCamp avatar frame'], ['square', 'Vertical profile card'], ['profile', 'Landscape profile banner']]);
  assert.equal(document.querySelector('#layout option[selected]').value, 'announcement');
  assert.ok(document.querySelector('#layout option[value="classic"][hidden]'));
  assert.equal(document.querySelectorAll('#display-settings > legend').length, 1);
  assert.equal(document.querySelectorAll('#profile-fields legend').length, 0);
  assert.ok(document.querySelector('#display-settings #name'));
  assert.ok(document.querySelector('#profile-link-setting #link'));
  assert.ok(document.getElementById('event'));
  assert.ok(document.querySelector('label[for="event"]'), 'accessible event label');
  // Formats are tiles and roles are chips. Each mirrors a select that holds the value and is never shown.
  assert.deepEqual([...document.querySelectorAll('#format-options[role="radiogroup"] > label.format-option')].map(tile => [tile.querySelector('input[type="radio"][name="format"]').value, tile.querySelector('.format-name').textContent, tile.getAttribute('for'), tile.querySelector('input').id, tile.querySelector('input').hasAttribute('checked')]),
    [['announcement', 'WordCamp social card', 'format-announcement', 'format-announcement', true], ['avatar', 'WordCamp avatar frame', 'format-avatar', 'format-avatar', false], ['square', 'Vertical profile card', 'format-square', 'format-square', false], ['profile', 'Landscape profile banner', 'format-profile', 'format-profile', false]]);
  assert.equal(document.getElementById('format-options').getAttribute('aria-labelledby'), 'format-title');
  assert.equal(document.getElementById('format-title').textContent, 'What would you like to make?');
  for (const art of document.querySelectorAll('.format-art')) { assert.equal(art.getAttribute('aria-hidden'), 'true'); assert.ok(art.querySelector('svg')); }
  assert.equal(document.querySelector('.format-option img'), null, 'tiles are drawn, not example cards');
  for (const id of ['layout', 'role']) assert.ok(document.getElementById(id).hasAttribute('hidden'), `${id} holds the value and is not shown`);
  const roles = document.getElementById('role-setting');
  assert.equal(roles.tagName, 'FIELDSET');
  assert.equal(roles.querySelector('legend').textContent, 'I’m…');
  assert.ok(roles.querySelector('#role-options'));
  assert.ok(document.querySelector('#event-controls #role-setting'), 'the chips are disabled with the other event controls');
  // The event options have no visible heading; the group keeps a name for assistive technology.
  assert.equal(document.querySelector('#event-settings legend:not(#shape-setting legend):not(#role-setting legend)'), null);
  assert.equal(document.body.textContent.includes('Your WordCamp'), false);
  assert.equal(document.getElementById('event-controls').getAttribute('aria-label'), 'WordCamp');
  assert.equal(document.getElementById('eventDetails'), null);
  assert.equal(document.body.textContent.includes('Event dates'), false);
  assert.ok(document.getElementById('event-settings').hasAttribute('hidden'));
  assert.ok(document.getElementById('event-controls').hasAttribute('disabled'));
  assert.ok(document.querySelector('#event-source[rel="noopener noreferrer"]'));
  assert.ok(document.getElementById('retry-events'));
  assert.match(document.getElementById('role-help').textContent, /self-reported/i);
  // The format menu has no help text under it.
  assert.equal(document.getElementById('layout-help'), null);
  assert.equal(document.getElementById('layout').hasAttribute('aria-describedby'), false);
  assert.equal(document.querySelector('.layout-setting .field-help'), null);
  assert.ok(document.querySelector('.controls #display-settings'));
  assert.ok(document.querySelector('.result #card-preview'));
  assert.equal(document.querySelectorAll('#userId,#website,#github,#slack,#linkColor').length, 0);
  assert.equal(document.getElementById('social').getAttribute('type'), 'checkbox');
  assert.equal(document.getElementById('social').hasAttribute('checked'), true);
  assert.ok(document.querySelector('.about #role-help'));
  assert.equal(document.getElementById('role-setting').getAttribute('aria-describedby'), 'role-help');
  // The official-site link sits with the event menu; retrying stays outside the group that disables.
  assert.ok(document.querySelector('.event-field > #event-source'));
  assert.equal(document.getElementById('retry-events').closest('fieldset'), null);
});

test('new catalog and renderer are explicitly allowlisted for staging and local serving', async () => {
  const stage = await readFile(new URL('tools/stage.mjs', root), 'utf8');
  const serve = await readFile(new URL('tools/serve.mjs', root), 'utf8');
  for (const name of ['_events.js', '_social.js', 'events.js']) assert.ok(stage.includes(`functions/${name}`), name);
  assert.ok(serve.includes("'../functions/events.js'"));
  assert.ok(serve.includes("'/events'"));
});
