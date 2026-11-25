import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryPhotos, nextPhoto } from '../src/gallery/catalog.ts';

test('gallery includes unused library photos and GIFs, skips aliases and duplicate files', () => {
  assert.deepEqual(galleryPhotos({
    scene: { file: 'scene.jpg' },
    unused: { file: 'unused.png' },
    animation: { file: 'cat.gif' },
    alias: { fallback: 'scene' },
    duplicate: { file: 'scene.jpg' },
    empty: {},
  }), [
    { id: 'scene', file: 'scene.jpg' },
    { id: 'unused', file: 'unused.png' },
    { id: 'animation', file: 'cat.gif' },
  ]);
});

test('lightbox wraps in both directions and handles empty/single-photo libraries', () => {
  assert.equal(nextPhoto(2, 1, 3), 0);
  assert.equal(nextPhoto(0, -1, 3), 2);
  assert.equal(nextPhoto(1, 1, 3), 2);
  assert.equal(nextPhoto(0, -1, 1), 0);
  assert.equal(nextPhoto(0, 1, 0), -1);
});
