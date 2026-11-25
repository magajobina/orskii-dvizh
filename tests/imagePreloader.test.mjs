import test from 'node:test';
import assert from 'node:assert/strict';
import { ImagePreloader, storyImageURLs } from '../src/engine/imagePreloader.ts';

test('nearby branch images come first, loops terminate and unused library images are excluded', () => {
  const story = { cover: 'cover', chapters: [{ entry: 'old', image: 'chapter-cover' }], nodes: {
    old: { type: 'scene', asset: 'old', next: 'menu' },
    menu: { type: 'choice', options: [{ next: 'left' }, { next: 'right' }] },
    left: { type: 'scene', asset: 'near-left', next: 'menu' },
    right: { type: 'scene', asset: 'near-right', next: 'alias' },
    alias: { type: 'scene', asset: 'same-file', next: 'missing' },
    detached: { type: 'scene', asset: 'detached', next: 'missing' },
  } };
  const files = { cover: '/cover', old: '/old', 'near-left': '/left', 'near-right': '/right', 'same-file': '/left', detached: '/detached', 'chapter-cover': '/chapter', unused: '/unused' };
  assert.deepEqual(storyImageURLs(story, 'menu', id => files[id]), ['/left', '/right', '/old', '/detached', '/cover', '/chapter']);
});

function harness() {
  const jobs = [], images = [];
  const pool = new ImagePreloader(() => {
    const image = { src: '', onload: null, onerror: null, removeAttribute() { this.src = ''; } };
    images.push(image); return image;
  }, job => {
    const task = { run: job, cancelled: false }; jobs.push(task);
    return () => { task.cancelled = true; };
  });
  const tick = () => { const batch = jobs.splice(0); batch.forEach(task => { if (!task.cancelled) task.run(); }); };
  return { pool, images, tick };
}

test('nearest pictures stay decoded, distant ones are released and route changes reprioritize', () => {
  const { pool, images, tick } = harness();
  pool.preload(['/a', '/b', '/c', '/d', '/e', '/f', '/g']); tick();
  assert.equal(images.length, 2);
  assert.equal(images[0].fetchPriority, 'high');
  images[0].onload(); images[1].onload(); tick();
  assert.equal(images[0].src, '/a');
  pool.preload(['/urgent', '/c', '/d', '/e', '/f', '/g', '/a']);
  assert.equal(images[0].src, '');
  images[2].onload(); tick();
  assert.equal(images[4].src, '/urgent');
  assert.equal(images[4].fetchPriority, 'high');
  pool.dispose();
  assert.ok(images.every(image => image.src === '' && image.onload === null && image.onerror === null));
});

test('failed downloads retry rather than being marked ready; retries are bounded', () => {
  const { pool, images, tick } = harness();
  pool.preload(['/a']); tick(); images[0].onerror(); tick();
  assert.equal(images[1].src, '/a');
  images[1].onload(); pool.preload(['/a']); tick();
  assert.equal(images.length, 2);
  pool.preload(['/broken']); tick();
  for (let i = 2; i < 5; i++) { images[i].onerror(); tick(); }
  assert.equal(images.length, 5);
});

test('pause stops new jobs; resume keeps successful lookahead; dispose aborts requests', () => {
  const { pool, images, tick } = harness();
  pool.preload(['/a', '/b', '/c']); pool.pause(); tick();
  assert.equal(images.length, 0);
  pool.preload(['/a', '/b', '/c']); tick();
  pool.pause(); images[0].onload(); tick(); assert.equal(images.length, 2);
  pool.preload(['/a', '/b', '/c']); tick(); assert.equal(images[2].src, '/c');
  pool.dispose(); tick(); assert.ok(images.every(image => image.src === ''));
});
