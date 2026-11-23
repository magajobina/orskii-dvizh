import test from 'node:test';
import assert from 'node:assert/strict';
import { start, advance, back } from '../src/engine/engine.ts';
import { shakeAnimation } from '../src/engine/shake.ts';
import { parseDocument } from '../src/editor/model.ts';

const story = () => ({ version: 1, entry: 'picture', cover: 'cover', chapters: [], nodes: {
  picture: { type: 'scene', asset: 'cover', shake: { variant: 'impact', durationMs: 999999 }, next: 'first' },
  first: { type: 'text', text: 'Один', audio: 'door-knock', next: 'second' },
  second: { type: 'text', text: 'Два', next: 'plain' },
  plain: { type: 'scene', asset: 'cover', next: 'end' },
  end: { type: 'end' },
} });

test('scene effects survive dialogue and rollback; a new unshaken scene resets them', () => {
  const s = story();
  const first = start(s);
  assert.equal(first.sceneNode, 'picture');
  assert.equal(first.sceneEvent, 1);
  const second = advance(s, first);
  assert.equal(second.sceneNode, 'picture');
  assert.equal(second.sceneEvent, 1);
  const end = advance(s, second);
  assert.equal(end.sceneNode, 'plain');
  assert.equal(end.sceneEvent, 2);
  assert.deepEqual(back(end), second);
});

test('media settings roundtrip in backups and malformed durations/audio are rejected', () => {
  assert.deepEqual(parseDocument(JSON.parse(JSON.stringify(story()))).story, story());
  for (const duration of [0, -1, Infinity, '1000']) {
    const s = story(); s.nodes.picture.shake.durationMs = duration;
    assert.throws(() => parseDocument(s), /тряски/);
  }
  const s = story(); s.nodes.first.audio = { url: 'bad' };
  assert.throws(() => parseDocument(s), /аудио/);
});

test('tremble ends at the requested duration; legacy variants use the same retained effect', () => {
  const calls = [];
  const element = { animate: (frames, options) => { calls.push({ frames, options }); return { cancel() {} }; } };
  for (const variant of ['tremble', 'impact', 'sway']) {
    for (const durationMs of [1, 1250, 999999]) {
      shakeAnimation(element, { variant, durationMs });
      const { options } = calls.at(-1);
      assert.equal(options.duration * options.iterations, durationMs);
      assert.ok(Number.isFinite(options.iterations));
    }
  }
  assert.equal(shakeAnimation(element), undefined);
  assert.deepEqual(calls[0].frames, calls[3].frames);
  assert.deepEqual(calls[3].frames, calls[6].frames);
});

test('text delay roundtrips in backups and rejects invalid values', () => {
  const s = story(); s.nodes.first.delayMs = 1500;
  assert.equal(parseDocument(JSON.parse(JSON.stringify(s))).story.nodes.first.delayMs, 1500);
  for (const value of [-1, Infinity, '1000', null]) {
    s.nodes.first.delayMs = value;
    assert.throws(() => parseDocument(s), /задержка/);
  }
  s.nodes.first.delayMs = 0;
  assert.equal(parseDocument(s).story.nodes.first.delayMs, 0);
});
