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

test('downloads at low priority, at most two at once, deduplicates and prioritizes a new route', () => {
  const { pool, images, tick } = harness();
  pool.preload(['/a', '/b', '/c', '/a']);
  assert.equal(images.length, 0);
  tick();
  assert.deepEqual(images.map(image => image.src), ['/a', '/b']);
  assert.ok(images.every(image => image.fetchPriority === 'low' && image.decoding === 'async'));
  pool.preload(['/urgent', '/a', '/b', '/c']);
  images[0].onload();
  assert.equal(images[0].src, '');
  assert.equal(images.length, 2);
  tick();
  assert.equal(images[2].src, '/urgent');
  images[1].onerror();
  tick();
  assert.equal(images[3].src, '/c');
  images[2].onload(); images[3].onload();
  pool.preload(['/a', '/b', '/c', '/urgent']); tick();
  assert.equal(images.length, 4);
});

test('menu pauses new downloads, resuming keeps the cache and disposal aborts pending work', () => {
  const { pool, images, tick } = harness();
  pool.preload(['/a', '/b', '/c']);
  pool.pause(); tick(); assert.equal(images.length, 0);
  pool.preload(['/a', '/b', '/c']); tick();
  pool.pause(); images[0].onload(); tick();
  assert.equal(images.length, 2);
  pool.preload(['/a', '/b', '/c']); tick();
  assert.equal(images[2].src, '/c');
  pool.dispose(); tick();
  assert.ok(images.every(image => image.src === '' && image.onload === null && image.onerror === null));
});
