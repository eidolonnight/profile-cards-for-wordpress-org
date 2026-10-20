import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom/worker';

const root = new URL('../', import.meta.url);

test('builder offers both social formats while preserving profile/classic choices', async () => {
  const { document } = parseHTML(await readFile(new URL('public/index.html', root), 'utf8'));
  assert.deepEqual([...document.querySelectorAll('#layout option:not([hidden])')].map(option => [option.value, option.textContent]), [['profile', 'Landscape banner'], ['square', 'Vertical card'], ['avatar', 'WordCamp avatar frame'], ['announcement', 'WordCamp social card']]);
  assert.equal(document.querySelector('#layout option[selected]').value, 'profile');
  assert.ok(document.querySelector('#layout option[value="classic"][hidden]'));
  assert.equal(document.querySelectorAll('#display-settings > legend').length, 1);
  assert.equal(document.querySelectorAll('#profile-fields legend').length, 0);
  assert.ok(document.querySelector('#display-settings #name'));
  assert.ok(document.querySelector('#profile-link-setting #link'));
  for (const id of ['event', 'role', 'eventDetails']) {
    assert.ok(document.getElementById(id), id);
    assert.ok(document.querySelector(`label[for="${id}"]`), `accessible ${id} label`);
  }
  assert.ok(document.getElementById('event-settings').hasAttribute('hidden'));
  assert.ok(document.getElementById('event-controls').hasAttribute('disabled'));
  assert.ok(document.querySelector('#event-source[rel="noopener noreferrer"]'));
  assert.ok(document.getElementById('retry-events'));
  assert.match(document.getElementById('role-help').textContent, /self-reported/i);
  assert.match(document.getElementById('layout-help').textContent, /4:5/);
  assert.ok(document.querySelector('.controls #display-settings'));
  assert.ok(document.querySelector('.result #card-preview'));
  assert.equal(document.querySelectorAll('#userId,#website,#github,#slack,#linkColor').length, 0);
  assert.equal(document.getElementById('social').getAttribute('type'), 'checkbox');
  assert.equal(document.getElementById('social').hasAttribute('checked'), true);
  assert.ok(document.querySelector('.about #role-help'));
  assert.equal(document.getElementById('role').getAttribute('aria-describedby'), 'role-help');
});

test('new catalog and renderer are explicitly allowlisted for staging and local serving', async () => {
  const stage = await readFile(new URL('tools/stage.mjs', root), 'utf8');
  const serve = await readFile(new URL('tools/serve.mjs', root), 'utf8');
  for (const name of ['_events.js', '_social.js', 'events.js']) assert.ok(stage.includes(`functions/${name}`), name);
  assert.ok(serve.includes("'../functions/events.js'"));
  assert.ok(serve.includes("'/events'"));
});
