import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout, cardHeight } from '../src/editor/layout.ts';
import { parseDocument } from '../src/editor/model.ts';
import { createCameraMemory, CAMERA_KEY } from '../src/editor/camera.ts';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('camera survives reopening with independent positions and zooms for each chapter', () => {
  const disk = storage();
  const memory = createCameraMemory(disk);
  memory.remember('arrival', { x: -1234, y: 567, zoom: .34 });
  memory.activate('flight');
  memory.remember('flight', { x: 321, y: -456, zoom: 1.7 });
  memory.activate('arrival');
  const reopened = createCameraMemory(disk);
  assert.equal(reopened.activeChapter(), 'arrival');
  assert.deepEqual(reopened.view('arrival'), { x: -1234, y: 567, zoom: .34 });
  assert.deepEqual(reopened.view('flight'), { x: 321, y: -456, zoom: 1.7 });
  const snapshot = reopened.view('flight'); snapshot.x = 0;
  assert.equal(reopened.view('flight').x, 321);
  reopened.remember('', { x: 1, y: 2, zoom: .5 });
  assert.deepEqual(createCameraMemory(disk).view(''), { x: 1, y: 2, zoom: .5 });
});

test('bad camera preferences cannot poison coordinates or prevent editing', () => {
  const disk = storage(); disk.setItem(CAMERA_KEY, '{broken');
  assert.equal(createCameraMemory(disk).activeChapter(), undefined);
  disk.setItem(CAMERA_KEY, JSON.stringify({ version: 1, views: { 'chapter:a': { x: 1, y: 2, zoom: -1 } } }));
  const memory = createCameraMemory(disk);
  assert.equal(memory.view('a'), undefined);
  memory.remember('a', { x: Infinity, y: 0, zoom: 1 });
  assert.equal(memory.view('a'), undefined);
  const unavailable = createCameraMemory({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  unavailable.remember('a', { x: 1, y: 2, zoom: .5 });
  assert.deepEqual(unavailable.view('a'), { x: 1, y: 2, zoom: .5 });
});

function branching() {
  return parseDocument({ version: 1, entry: 'menu', cover: 'cover', chapters: [{ id: 'one', title: 'Первая', entry: 'menu', image: 'cover' }], nodes: {
    // Deliberately insert targets in a different order from the answer ports.
    c: { type: 'text', text: 'Третий', next: 'merge', chapterId: 'one' },
    b: { type: 'text', text: 'Второй', next: 'merge', chapterId: 'one' },
    a: { type: 'text', text: 'Первый', next: 'merge', chapterId: 'one' },
    menu: { type: 'choice', chapterId: 'one', options: ['a', 'b', 'c'].map(id => ({ id: `answer-${id}`, text: id, next: id })) },
    merge: { type: 'end', chapterId: 'one' },
    elsewhere: { type: 'end', chapterId: 'two' },
  } });
}

function assertAnswerOrder(doc) {
  const ids = [...new Set(doc.story.nodes.menu.options.map(option => option.next))];
  for (let index = 1; index < ids.length; index++) {
    const above = doc.layout.positions[ids[index - 1]], below = doc.layout.positions[ids[index]];
    assert.ok(above.y + cardHeight(doc.story.nodes[ids[index - 1]]) < below.y, `${ids[index - 1]} must be above ${ids[index]} without overlap`);
  }
}

test('layout follows answer port order, including reordered options, without changing story or other chapters', () => {
  const doc = branching(); doc.layout.positions.elsewhere = { x: 23, y: 42 };
  const snapshot = structuredClone(doc.story);
  const result = autoLayout(doc, 'one');
  assertAnswerOrder(result);
  assert.deepEqual(result.story, snapshot);
  assert.deepEqual(result.layout.positions.elsewhere, { x: 23, y: 42 });
  result.story.nodes.menu.options.reverse();
  assertAnswerOrder(autoLayout(result, 'one'));
});

test('choice loops and a shared target do not duplicate cards or break constrained layout', () => {
  const doc = branching();
  doc.story.nodes.a.next = 'menu'; doc.story.nodes.b.next = 'menu';
  doc.story.nodes.menu.options.push({ id: 'again', text: 'Ещё раз', next: 'b' });
  const result = autoLayout(doc, 'one');
  assertAnswerOrder(result);
  for (const point of Object.values(result.layout.positions)) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
});

function longBranches() {
  const doc = branching();
  // Insert each column in a different order, as happens after manual editing.
  for (const id of ['b', 'c', 'a']) doc.story.nodes[`reply-${id}`] = { type: 'text', text: id, next: 'merge', chapterId: 'one' };
  for (const id of ['c', 'a', 'b']) doc.story.nodes[`picture-${id}`] = { type: 'scene', asset: 'cover', next: `reply-${id}`, chapterId: 'one' };
  for (const id of ['a', 'b', 'c']) doc.story.nodes[id].next = `picture-${id}`;
  return doc;
}

function center(doc, id) {
  return doc.layout.positions[id].y + cardHeight(doc.story.nodes[id]) / 2;
}

function assertNoOverlap(doc, chapter = 'one') {
  const ids = Object.keys(doc.story.nodes).filter(id => doc.story.nodes[id].chapterId === chapter);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = doc.layout.positions[ids[i]], b = doc.layout.positions[ids[j]];
    const separated = Math.abs(a.x - b.x) >= 250 || a.y + cardHeight(doc.story.nodes[ids[i]]) <= b.y || b.y + cardHeight(doc.story.nodes[ids[j]]) <= a.y;
    assert.ok(separated, `overlap: ${ids[i]} / ${ids[j]}`);
  }
}

test('branch order and straight continuations survive every column, not just the first answers', () => {
  const original = longBranches();
  for (const order of [['a', 'b', 'c'], ['c', 'a', 'b']]) {
    const doc = structuredClone(original);
    doc.story.nodes.menu.options = order.map(id => ({ id, text: id, next: id }));
    const result = autoLayout(doc, 'one');
    for (const prefix of ['', 'picture-', 'reply-']) {
      for (let i = 1; i < order.length; i++) assert.ok(center(result, prefix + order[i - 1]) < center(result, prefix + order[i]), `${prefix} must follow answer order`);
    }
    for (const id of order) {
      assert.equal(center(result, id), center(result, `picture-${id}`));
      assert.equal(center(result, `picture-${id}`), center(result, `reply-${id}`));
    }
    assertNoOverlap(result);
    assert.deepEqual(result.story, doc.story);
    assert.deepEqual(autoLayout(result, 'one').layout.positions, result.layout.positions);
  }
});

test('nested branches, unequal lengths, shared joins and loops keep separate lanes without overlaps', () => {
  const doc = longBranches();
  doc.story.nodes['picture-a'] = { type: 'choice', chapterId: 'one', options: [
    { id: 'upper', text: 'Верх', next: 'nested-upper' }, { id: 'lower', text: 'Низ', next: 'nested-lower' },
  ] };
  doc.story.nodes['nested-lower'] = { type: 'text', text: 'Низ', next: 'reply-a', chapterId: 'one' };
  doc.story.nodes['nested-upper'] = { type: 'text', text: 'Верх', next: 'extra', chapterId: 'one' };
  doc.story.nodes.extra = { type: 'text', text: 'Длиннее', next: 'reply-a', chapterId: 'one' };
  doc.story.nodes['reply-c'].next = 'menu';
  const result = autoLayout(doc, 'one');
  assert.ok(center(result, 'nested-upper') < center(result, 'nested-lower'));
  assert.ok(center(result, 'nested-lower') < center(result, 'reply-b'));
  assert.ok(center(result, 'reply-a') < center(result, 'merge'));
  assertNoOverlap(result);
  assert.deepEqual(result.story, doc.story);
});
