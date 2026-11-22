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
