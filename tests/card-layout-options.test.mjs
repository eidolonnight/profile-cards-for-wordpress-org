import test from 'node:test';
import assert from 'node:assert/strict';
import { queryOptions } from '../functions/_profile.js';
const query = suffix => queryOptions(new Request('https://local.test/card?username=fixture' + suffix));
test('Square has independent explicit routing while legacy no-layout stays classic', () => {
  assert.equal(query('').layout, 'classic');
  assert.equal(query('&layout=classic').layout, 'classic');
  const square = query('&layout=square');
  assert.equal(square.layout, 'square'); assert.equal(square.badges, true); assert.equal(square.avatar, true);
  assert.equal(query('&layout=square&badges=false&link=true').badges, false);
  assert.equal(query('&layout=square&link=true').link, true);
  assert.equal(query('&layout=profile&header=false&link=true').link, true);
  for (const value of ['&event=asia-2027', '&role=attendee', '&eventDetails=false']) assert.throws(() => query('&layout=square' + value));
});
