import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { start, advance, availableOptions, choose, back } from '../src/engine/engine.ts';
const story = JSON.parse(readFileSync(new URL('../src/content/story.json', import.meta.url)));

test('caption waits for a separate click; choices block generic advance; back restores both stages', () => {
  const caption = start(story, 'line-50', 'bg-polina-anya');
  assert.equal(story.nodes[caption.current].type, 'text');
  const options = advance(story, caption);
  assert.equal(story.nodes[options.current].type, 'choice');
  assert.equal(advance(story, options), options);
  const response = choose(story, options, 'line-52');
  assert.match(story.nodes[response.current].text, /бухать всё равно/);
  assert.deepEqual(back(response), options);
  assert.deepEqual(back(options), caption);
});

test('nested persuasion, cross-section jumps and scene changes continue normally', () => {
  let state = start(story, story.chapters[1].entry, story.chapters[1].image);
  for (let i = 0; story.nodes[state.current].type !== 'choice' && i < 30; i++) state = advance(story, state);
  assert.equal(story.nodes[state.current].type, 'choice');
  const refusal = choose(story, state, 'line-304');
  assert.equal(story.nodes[refusal.current].type, 'text');
  assert.match(story.nodes[refusal.current].text, /пропуск в лучшую жизнь/);
  const secondMenu = advance(story, refusal);
  assert.equal(story.nodes[secondMenu.current].type, 'choice');
  const accepted = choose(story, secondMenu, story.nodes[secondMenu.current].options[0].id);
  assert.match(story.nodes[accepted.current].text, /забирает ваши деньги/);
  const flight = advance(story, accepted);
  assert.equal(flight.scene, 'polet');
  assert.equal(back(flight).scene, accepted.scene);
});

test('every branch is traversable, all menu alternatives and ending are reachable', () => {
  const visited = new Set();
  const queue = [start(story)];
  let alternatives = 0;
  while (queue.length) {
    const state = queue.pop();
    if (visited.has(state.current)) continue;
    visited.add(state.current);
    const node = story.nodes[state.current];
    if (node.type === 'text') queue.push(advance(story, state));
    if (node.type === 'choice') for (const option of node.options) { alternatives++; queue.push(choose(story, state, option.id)); }
  }
  // Four former chapter shortcuts are navigation, not narrative choices.
  assert.equal(alternatives, 51);
  assert.ok([...visited].some(id => story.nodes[id].type === 'end'));
  assert.equal([...visited].filter(id => story.nodes[id].type === 'text').length, 112);
});

test('false choices disappear after the refusal response and eventually leave only agreement', () => {
  const initial = start(story, 'line-369', 'limonchella');
  assert.equal(story.nodes[initial.current].options.length, 3);
  const vodkaRefusal = choose(story, initial, 'line-372');
  assert.match(story.nodes[vodkaRefusal.current].text, /не должны нажраться/);
  const nextCaption = advance(story, vodkaRefusal);
  assert.equal(story.nodes[nextCaption.current].type, 'text');
  const remaining = advance(story, nextCaption);
  const options = story.nodes[remaining.current].options;
  assert.equal(options.length, 2);
  assert.ok(options.every(option => !option.text.includes('Запить')));
  const beer = options.find(option => option.text.startsWith('Заказать пиво'));
  const beerRefusal = choose(story, remaining, beer.id);
  assert.match(story.nodes[beerRefusal.current].text, /всё равно заставят/);
  const lastCaption = advance(story, beerRefusal);
  const finalMenu = advance(story, lastCaption);
  assert.equal(story.nodes[finalMenu.current].options.length, 1);
  assert.match(story.nodes[finalMenu.current].options[0].text, /^Согласиться/);
  assert.deepEqual(back(beerRefusal), remaining);
});

for (const order of [['line-52', 'line-55'], ['line-55', 'line-52']]) {
  test(`balcony false choices return to the same menu and disappear in order ${order.join(', ')}`, () => {
    let state = advance(story, start(story, 'line-50', 'bg-polina-anya'));
    assert.equal(state.current, 'line-49');
    for (const [index, id] of order.entries()) {
      const before = state;
      const response = choose(story, state, id);
      assert.equal(story.nodes[response.current].type, 'text');
      assert.equal(response.scene, 'bg-polina-anya');
      assert.deepEqual(back(response), before);
      state = advance(story, response);
      assert.equal(state.current, 'line-49');
      assert.equal(story.nodes[state.current].prompt, 'line-50');
      assert.equal(availableOptions(story, state).length, 2 - index);
      assert.ok(availableOptions(story, state).every(option => !order.slice(0, index + 1).includes(option.id)));
      assert.equal(choose(story, state, id), state);
    }
    assert.deepEqual(availableOptions(story, state).map(option => option.id), ['line-58']);
    const forward = choose(story, state, 'line-58');
    assert.equal(forward.scene, 'bg-alik-yarik-v-trusah');
    assert.match(story.nodes[forward.current].text, /Вы пошли в комнату/);
    assert.equal(availableOptions(story, start(story, 'line-49')).length, 3);
  });
}
