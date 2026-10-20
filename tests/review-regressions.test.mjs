import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { boundedFetch, parseProfile } from '../functions/_profile.js';
import { renderCard } from '../functions/_svg.js';

test('early upstream rejection closes a real streaming connection', async () => {
  let closed = false; let transmitted = 0;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Length': '1000000', 'Content-Type': 'text/html' }); res.flushHeaders();
    const interval = setInterval(() => { res.write('1234567890'); transmitted += 10; }, 10);
    res.on('close', () => { clearInterval(interval); closed = true; });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    // Allow a loaded test runner to receive headers; closure must happen well
    // before this deadline, proving rejection aborts rather than timing out.
    await assert.rejects(() => boundedFetch(`http://127.0.0.1:${server.address().port}/`, { maxBytes: 2, timeout: 5000 }), { code: 'upstream_too_large' });
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(closed, true, `response still open after ${transmitted} bytes`);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('invalid XML Unicode is removed while ordinary Unicode survives', () => {
  const profile = parseProfile('<header class="site-header"><h2>Name&#xFFFE; &#x1F600;</h2></header>', 'fixture');
  assert.ok(!profile.name.includes('\uFFFE')); assert.ok(profile.name.includes('😀'));
  profile.name += '\uFFFF\uD800';
  const svg = renderCard(profile, {});
  const result = spawnSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E; E.fromstring(sys.stdin.read())'], { input: svg, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.ok(svg.includes('😀'));
});
