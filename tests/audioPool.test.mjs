import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioPool, storyAudioURLs } from '../src/engine/audioPool.ts';

test('preloads only referenced, available audio and deduplicates shared files', () => {
  const story = { nodes: {
    a: { type: 'text', audio: 'knock' },
    b: { type: 'text', audio: 'alias' },
    c: { type: 'text', audio: 'missing' },
    d: { type: 'text' },
    e: { type: 'scene', asset: 'unused' },
  } };
  const registry = { knock: '/knock.wav', alias: '/knock.wav', unused: '/unused.mp3' };
  assert.deepEqual(storyAudioURLs(story, id => registry[id]), ['/knock.wav']);
});

function harness(fetcher = async () => new Blob(['audio'])) {
  const created = [], revoked = [];
  let blobs = 0;
  const pool = new AudioPool(url => {
    const sound = { src: url, loads: 0, plays: 0, pauses: 0,
      load() { this.loads++; }, play() { this.plays++; },
      pause() { this.pauses++; }, removeAttribute() { this.src = ''; },
    };
    created.push(sound); return sound;
  }, fetcher, { createObjectURL: () => 'blob:' + ++blobs, revokeObjectURL: url => revoked.push(url) });
  return { pool, created, revoked };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('full audio downloads become local blobs, never autoplay, and reuse warmed elements', async () => {
  const fetched = [];
  const { pool, created, revoked } = harness(async url => { fetched.push(url); return new Blob(['audio']); });
  pool.preload(['/knock.wav', '/fart.mp3', '/knock.wav']); await flush();
  assert.deepEqual(fetched, ['/knock.wav', '/fart.mp3']);
  assert.equal(created.length, 2);
  assert.ok(created.every(sound => sound.src.startsWith('blob:') && sound.plays === 0 && sound.loads === 1));
  assert.equal(await pool.prepare('/knock.wav'), created[0]);
  pool.preload(['/knock.wav']); await flush(); assert.equal(fetched.length, 2);
  pool.dispose(); assert.equal(revoked.length, 2);
  assert.ok(created.every(sound => sound.pauses === 1 && sound.src === ''));
});

test('audio queue is bounded and a route change puts nearby sound before distant sounds', async () => {
  const calls = [];
  const { pool } = harness((url, signal) => new Promise(resolve => calls.push({ url, signal, resolve })));
  pool.preload(['/a', '/b', '/c']); await flush(); assert.equal(calls.length, 2);
  pool.preload(['/urgent', '/c']); calls[0].resolve(new Blob(['a'])); await flush();
  assert.equal(calls[2].url, '/urgent');
  pool.dispose(); assert.ok(calls.every(call => call.signal.aborted || call.url === '/a'));
});

test('failed audio fetches retry, and disposal prevents late completions from recreating media', async () => {
  let count = 0;
  const { pool, created } = harness(async () => { if (++count === 1) throw Error('network'); return new Blob(['ok']); });
  pool.preload(['/a']); await flush(); assert.equal(count, 2); assert.equal(created.length, 1);
  let finish;
  const late = harness(() => new Promise(resolve => { finish = resolve; }));
  late.pool.preload(['/late']); await flush(); late.pool.dispose(); finish(new Blob(['late'])); await flush();
  assert.equal(late.created.length, 0);
});

test('disposed playback preparation cannot create a new cold sound after navigation', async () => {
  let finish;
  const { pool, created } = harness(() => new Promise(resolve => { finish = resolve; }));
  const prepared = pool.prepare('/late');
  await flush(); pool.dispose(); finish(new Blob(['late']));
  await assert.rejects(prepared, { name: 'AbortError' });
  assert.equal(created.length, 0);
});
