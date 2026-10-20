import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvatarData, safeAvatar } from '../functions/_profile.js';

const url = n => `https://secure.gravatar.com/avatar/${n.toString(16).padStart(32, '0')}`;
const image = (length = 16) => { const bytes = new Uint8Array(length); bytes.set([137,80,78,71,13,10,26,10]); return new Response(bytes, { headers:{'Content-Type':'image/png'} }); };
const fresh = async id => (await import(`../functions/_profile.js?avatar-test=${id}`)).getAvatarData;

test('social high-res source is fixed and bounded; legacy default stays 320', async () => {
  const calls = []; const fetcher = async (u, init) => { calls.push(u); assert.equal(init.redirect,'manual'); assert.ok(init.signal instanceof AbortSignal); return image(300 * 1024); };
  assert.equal(safeAvatar(url(1) + '?s=9999'), url(1) + '?s=320&d=mp&r=g');
  assert.equal(await getAvatarData(url(1), fetcher), null);
  assert.ok(await getAvatarData(url(1), fetcher, {size:1024}));
  assert.deepEqual(calls, [url(1) + '?s=320&d=mp&r=g', url(1) + '?s=1024&d=404&r=g']);
  const fetch = await fresh('canonical'); const requested = [];
  assert.ok(await fetch(url(2).replace('secure.gravatar.com','0.gravatar.com') + '?s=1&url=https://evil.test/#ignored', async u => { requested.push(u); return image(); }, {size:1024}));
  assert.deepEqual(requested, [url(2) + '?s=1024&d=404&r=g']);
});

test('social avatar input rejects arbitrary URLs, hashes, sizes and redirects', async () => {
  const get = await fresh('invalid'); let calls = 0; const fetcher = async () => { calls++; return image(); };
  for (const size of [0, 319, 321, 2048, '1024', NaN, Infinity, null]) assert.equal(await get(url(3),fetcher,{size}), null);
  for (const u of ['http://secure.gravatar.com/avatar/'+'a'.repeat(32), url(3).replace('secure.gravatar.com','evil.test'), url(3).replace('secure.gravatar.com','secure.gravatar.com.evil.test'), url(3).replace('https://','https://user:password@'), url(3).replace('secure.gravatar.com','secure.gravatar.com:8080'), url(3)+'a', 'data:image/png;base64,abc']) assert.equal(await get(u,fetcher,{size:1024}),null);
  assert.equal(calls,0);
  assert.equal(await get(url(3), async () => new Response('',{status:302,headers:{Location:'https://evil.test/a'}}),{size:1024}),null);
});

test('social 2 MiB and legacy 256 KiB budgets enforce headers and streamed length', async () => {
  const get = await fresh('budgets');
  for (const [size, max] of [[320,256*1024],[1024,2*1024*1024]]) {
    assert.ok(await get(url(size),async () => image(max),{size}));
    assert.equal(await get(url(size+1),async () => image(max+1),{size}),null);
    assert.equal(await get(url(size+2),async () => new Response('x',{headers:{'Content-Type':'image/png','Content-Length':String(max+1)}}),{size}),null);
  }
});

test('signature checks reject masquerading payloads and recover on the next request', async () => {
  const get = await fresh('signatures'); let calls = 0;
  for (const type of ['image/png','image/jpeg','image/webp','text/html','image/svg+xml']) assert.equal(await get(url(55),async () => { calls++; return new Response('<svg/>',{headers:{'Content-Type':type}}); },{size:1024}),null);
  assert.ok(await get(url(55),async () => { calls++; return image(); },{size:1024})); assert.equal(calls,6);
  for (const [n,type,bytes] of [[56,'image/jpeg',[255,216,255,0]],[57,'image/webp',[82,73,70,70,0,0,0,0,87,69,66,80]]]) assert.ok(await get(url(n),async () => new Response(new Uint8Array(bytes),{headers:{'Content-Type':type}}),{size:1024}));
});

test('shared avatar cache coalesces matching source/size without mixing resolutions', async () => {
  const get = await fresh('coalescing'); let calls = 0; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const fetcher = async () => { calls++; await gate; return image(); };
  const a = get(url(60),fetcher,{size:1024}); const b = get(url(60).replace('secure.','www.'),fetcher,{size:1024});
  const c = get(url(60),fetcher); assert.equal(calls,2); release();
  const [one,two] = await Promise.all([a,b,c]); assert.equal(one,two);
  assert.equal(await get(url(60),fetcher,{size:1024}),one); assert.equal(calls,2);
});

test('at most eight distinct avatar fetches are pending; duplicates join and failures free slots', async () => {
  const get = await fresh('capacity'); const releases = []; let calls = 0;
  const fetcher = () => { calls++; return new Promise(resolve => releases.push(() => resolve(image()))); };
  const requests = Array.from({length:8},(_,i) => get(url(100+i),fetcher,{size:i%2?320:1024}));
  const duplicate = get(url(100),fetcher,{size:1024});
  assert.equal(await get(url(200),fetcher,{size:1024}),null); assert.equal(calls,8);
  releases.forEach(release => release()); await Promise.all([...requests,duplicate]);
  assert.equal(await get(url(200),async () => { throw new Error('offline'); },{size:1024}),null);
  assert.ok(await get(url(200),async () => image(),{size:1024}));
});

test('avatar cache evicts at 32 entries and expires at the existing TTL', async () => {
  const get = await fresh('count'); let calls=0; const fetcher=async () => {calls++;return image();};
  for(let i=0;i<33;i++) await get(url(300+i),fetcher,{size:1024});
  await get(url(332),fetcher,{size:1024}); assert.equal(calls,33);
  await get(url(300),fetcher,{size:1024}); assert.equal(calls,34);
  const original = Date.now;
  try { const now=original(); Date.now=() => now + 15*60*1000 + 1; await get(url(300),fetcher,{size:1024}); assert.equal(calls,35); } finally {Date.now=original;}
});

test('encoded data URI length rather than raw bytes bounds cache to 8 MiB across sizes', async () => {
  const get = await fresh('bytes'); let calls=0; const fetcher=async () => {calls++;return image(2*1024*1024);};
  for(let i=0;i<3;i++) await get(url(400+i),fetcher,{size:1024});
  await get(url(402),fetcher,{size:1024}); assert.equal(calls,3);
  await get(url(400),fetcher,{size:1024}); assert.equal(calls,4); // three encoded 2 MiB images exceed 8 MiB, even though raw bytes fit
  await get(url(450),async () => {calls++;return image(256*1024);});
  await get(url(400),fetcher,{size:1024}); assert.equal(calls,5);
});

test('avatar six-second timeout aborts and does not poison pending/cache state', async () => {
  const get = await fresh('timeout'); let aborted=false; const start=Date.now();
  const result=await get(url(500),async (_url,{signal}) => new Promise((_resolve,reject) => signal.addEventListener('abort',() => {aborted=true;reject(new Error('aborted'));},{once:true})),{size:1024});
  assert.equal(result,null); assert.equal(aborted,true); assert.ok(Date.now()-start < 8000);
  assert.ok(await get(url(500),async () => image(),{size:1024}));
});
