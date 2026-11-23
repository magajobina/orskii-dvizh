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

test('background loading never plays sounds and playback reuses the warmed element', () => {
  const created = [];
  const pool = new AudioPool(url => {
    const sound = { src: url, loads: 0, plays: 0, pauses: 0,
      load() { this.loads++; }, play() { this.plays++; },
      pause() { this.pauses++; }, removeAttribute() { this.src = ''; },
    };
    created.push(sound);
    return sound;
  });
  pool.preload(['/knock.wav', '/fart.mp3', '/knock.wav']);
  pool.preload(['/knock.wav']);
  assert.equal(created.length, 2);
  for (const sound of created) {
    assert.equal(sound.preload, 'auto');
    assert.equal(sound.loads, 1);
    assert.equal(sound.plays, 0);
  }
  assert.equal(pool.get('/knock.wav'), created[0]);
  pool.get('/knock.wav').play();
  assert.equal(created[0].plays, 1);
  assert.equal(created[0].loads, 1);
  pool.dispose();
  assert.ok(created.every(sound => sound.pauses === 1 && sound.src === ''));
  assert.notEqual(pool.get('/knock.wav'), created[0]);
});
