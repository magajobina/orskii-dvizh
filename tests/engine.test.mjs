import test from 'node:test';
import assert from 'node:assert/strict';
import { start, advance, availableOptions, choose, back } from '../src/engine/engine.ts';

// Independent of the author's editable story and illustration IDs.
const story = {
  version: 1, entry: 'intro', cover: 'cover', chapters: [
    { id: 'first', entry: 'intro', title: 'First', image: 'cover' },
    { id: 'second', entry: 'new-scene', title: 'Second', image: 'second-image' },
  ],
  nodes: {
    intro: { type: 'text', text: 'Choose a route.', next: 'menu', chapterId: 'first' },
    menu: { type: 'choice', prompt: 'intro', options: [
      { id: 'try-a', text: 'A', once: true, next: 'refusal-a' },
      { id: 'try-b', text: 'B', once: true, next: 'refusal-b' },
      { id: 'go', text: 'Continue', next: 'jump' },
    ] },
    'refusal-a': { type: 'text', text: 'Try again.', next: 'menu' },
    'refusal-b': { type: 'text', text: 'Another route.', next: 'menu' },
    jump: { type: 'jump', next: 'new-scene' },
    'new-scene': { type: 'scene', asset: 'second-image', next: 'arrival', chapterId: 'second' },
    arrival: { type: 'text', text: 'Arrived.', next: 'nested' },
    nested: { type: 'choice', options: [{ id: 'finish', text: 'Finish', next: 'end' }] },
    end: { type: 'end' },
  },
};

test('caption waits for a separate click; choices block generic advance; back restores both stages', () => {
  const caption = start(story);
  const menu = advance(story, caption);
  assert.equal(menu.current, 'menu');
  assert.equal(advance(story, menu), menu);
  const reply = choose(story, menu, 'try-a');
  assert.equal(reply.current, 'refusal-a');
  assert.deepEqual(back(reply), menu);
  assert.deepEqual(back(menu), caption);
});

for (const order of [['try-a', 'try-b'], ['try-b', 'try-a']]) {
  test(`one-time answers disappear after returning in either order: ${order}`, () => {
    let state = advance(story, start(story));
    for (const [index, id] of order.entries()) {
      const previous = state;
      const reply = choose(story, state, id);
      assert.deepEqual(back(reply), previous);
      state = advance(story, reply);
      assert.equal(state.current, 'menu');
      assert.equal(availableOptions(story, state).length, 2 - index);
      assert.ok(availableOptions(story, state).every(option => !order.slice(0, index + 1).includes(option.id)));
      assert.equal(choose(story, state, id), state);
    }
    assert.deepEqual(availableOptions(story, state).map(option => option.id), ['go']);
    assert.equal(availableOptions(story, start(story, 'menu')).length, 3);
  });
}

test('jumps and scenes settle automatically; back restores image and chapter', () => {
  const menu = advance(story, start(story));
  const arrival = choose(story, menu, 'go');
  assert.equal(arrival.current, 'arrival');
  assert.equal(arrival.scene, 'second-image');
  assert.equal(arrival.chapterId, 'second');
  assert.equal(back(arrival).scene, 'cover');
  assert.equal(back(arrival).chapterId, 'first');
  assert.deepEqual(back(arrival), menu);
  const ending = choose(story, advance(story, arrival), 'finish');
  assert.equal(ending.current, 'end');
  assert.equal(advance(story, ending), ending);
});

test('unavailable choices and back without history are harmless', () => {
  const initial = start(story);
  assert.equal(back(initial), initial);
  assert.equal(choose(story, initial, 'go'), initial);
  assert.equal(choose(story, advance(story, initial), 'missing').current, 'menu');
});
