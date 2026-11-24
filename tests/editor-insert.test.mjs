import test from 'node:test';
import assert from 'node:assert/strict';
import { insertBefore } from '../src/editor/insert.ts';
import { cardHeight } from '../src/editor/layout.ts';
import { historyReducer, parseDocument, validateStory } from '../src/editor/model.ts';

function fixture() {
  const doc = parseDocument({ version: 1, entry: 'first', cover: 'cover', chapters: [
    { id: 'one', title: 'Один', entry: 'first', image: 'cover' },
    { id: 'two', title: 'Два', entry: 'other', image: 'cover' },
  ], nodes: {
    first: { type: 'text', text: 'Первая', next: 'picture', chapterId: 'one' },
    picture: { type: 'scene', asset: 'cover', next: 'menu', chapterId: 'one' },
    menu: { type: 'choice', prompt: 'first', chapterId: 'one', options: [
      { id: 'again', text: 'Снова', next: 'picture', once: true }, { id: 'leave', text: 'Конец', next: 'end' },
    ] },
    end: { type: 'end', chapterId: 'one' },
    other: { type: 'end', chapterId: 'two' },
  } });
  doc.layout.positions = { first: { x: 100, y: 150 }, picture: { x: 450, y: 100 }, menu: { x: 800, y: 100 }, end: { x: 1150, y: 100 }, other: { x: 450, y: 300 } };
  return doc;
}

test('inserts before the selected scene, redirects all incoming ports and preserves the continuation', () => {
  const doc = fixture(), snapshot = structuredClone(doc);
  const result = insertBefore(doc, 'picture', 'inserted', { type: 'text', text: 'Новая', next: '' });
  assert.equal(result.story.nodes.first.next, 'inserted');
  assert.equal(result.story.nodes.menu.options[0].next, 'inserted');
  assert.equal(result.story.nodes.menu.options[0].once, true);
  assert.equal(result.story.nodes.menu.options[1].next, 'end');
  assert.equal(result.story.nodes.inserted.next, 'picture');
  assert.equal(result.story.nodes.picture.next, 'menu');
  assert.equal(result.story.nodes.inserted.chapterId, 'one');
  assert.equal(result.story.nodes.menu.prompt, 'first');
  assert.deepEqual(result.layout.positions.other, doc.layout.positions.other);
  assert.deepEqual(result.layout.positions.first, doc.layout.positions.first);
  assert.equal(result.layout.positions.picture.x, doc.layout.positions.picture.x + 350);
  assert.equal(result.layout.positions.inserted.y + cardHeight(result.story.nodes.inserted) / 2, result.layout.positions.picture.y + cardHeight(result.story.nodes.picture) / 2);
  assert.deepEqual(validateStory(result.story, ['cover']).filter(issue => issue.severity === 'error'), []);
  assert.deepEqual(doc, snapshot);
});

test('inserting before an entry updates game/chapter starts but not dialogue prompt references', () => {
  const doc = fixture();
  const result = insertBefore(doc, 'first', 'new-picture', { type: 'scene', asset: 'cover', next: '' });
  assert.equal(result.story.entry, 'new-picture');
  assert.equal(result.story.chapters[0].entry, 'new-picture');
  assert.equal(result.story.chapters[1].entry, 'other');
  assert.equal(result.story.nodes['new-picture'].next, 'first');
  assert.equal(result.story.nodes.menu.prompt, 'first');
});

test('one undo restores connections, entries and layout; redo restores the complete insertion', () => {
  const doc = fixture();
  const result = insertBefore(doc, 'first', 'inserted', { type: 'text', text: 'Новая', next: '' });
  const changed = historyReducer({ present: doc, past: [], future: [] }, { type: 'edit', document: result });
  const undone = historyReducer(changed, { type: 'undo' });
  assert.deepEqual(undone.present, doc);
  assert.deepEqual(historyReducer(undone, { type: 'redo' }).present, result);
  assert.throws(() => insertBefore(doc, 'missing', 'new', { type: 'text', text: '', next: '' }));
  assert.throws(() => insertBefore(doc, 'first', 'menu', { type: 'text', text: '', next: '' }));
});
