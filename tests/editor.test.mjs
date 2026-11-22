import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simplifyTransitions, parseDocument, validateStory, makeClip, pasteClip, removeNodes, renameNode, connect, historyReducer } from '../src/editor/model.ts';
import { createEditorStore } from '../dev/editor-store.ts';

const story = () => ({ version: 1, entry: 'intro', cover: 'cover', chapters: [{ id: 'chapter', title: 'Глава', entry: 'intro', image: 'cover' }], nodes: {
  intro: { type: 'text', text: 'Привет', next: 'menu', chapterId: 'chapter' },
  menu: { type: 'choice', prompt: 'intro', chapterId: 'chapter', options: [{ id: 'yes', text: 'Да', next: 'reply', once: true }, { id: 'leave', text: 'Уйти', next: 'end' }] },
  reply: { type: 'text', text: 'Ответ', next: 'end', chapterId: 'chapter' },
  end: { type: 'end', chapterId: 'chapter' },
} });
const document = () => parseDocument(story());

test('editor validates references and automatic cycles but accepts intentional menu loops', () => {
  const doc = document();
  assert.equal(validateStory(doc.story, ['cover']).filter(i => i.severity === 'error').length, 0);
  doc.story.nodes.reply.next = 'menu';
  assert.equal(validateStory(doc.story, ['cover']).filter(i => i.severity === 'error').length, 0);
  doc.story.nodes.reply = { type: 'jump', next: 'reply', chapterId: 'chapter' };
  assert.ok(validateStory(doc.story, ['cover']).some(i => i.message.includes('Цикл')));
  doc.story.nodes.reply.next = 'missing';
  assert.ok(validateStory(doc.story, ['cover']).some(i => i.message.includes('переход')));
});

test('copy/paste remaps internal links, menu prompt and answer IDs without changing original blocks', () => {
  const doc = document();
  doc.layout.positions.intro = { x: 10, y: 20 };
  doc.layout.positions.menu = { x: 300, y: 20 };
  const clip = makeClip(doc, ['intro', 'menu']);
  const result = pasteClip(doc, clip, 'test');
  const [intro, menu] = result.ids;
  assert.equal(result.document.story.nodes[intro].next, menu);
  assert.equal(result.document.story.nodes[menu].prompt, intro);
  assert.equal(result.document.story.nodes[menu].options[0].next, 'reply');
  assert.notEqual(result.document.story.nodes[menu].options[0].id, 'yes');
  assert.deepEqual(result.document.layout.positions[intro], { x: 70, y: 80 });
  assert.equal(doc.story.nodes.intro.next, 'menu');
  assert.equal(result.document.story.nodes[intro].chapterId, 'chapter');
});

test('cut leaves repairable incoming connections; undo restores nodes and layout; grouped typing is one undo', () => {
  const doc = document();
  doc.layout.positions.reply = { x: 100, y: 200 };
  let h = { present: doc, past: [], future: [] };
  const cut = removeNodes(doc, ['reply']);
  assert.equal(cut.story.nodes.menu.options[0].next, '');
  h = historyReducer(h, { type: 'edit', document: cut });
  h = historyReducer(h, { type: 'undo' });
  assert.deepEqual(h.present, doc);
  h = historyReducer(h, { type: 'redo' });
  assert.equal(h.present.story.nodes.reply, undefined);
  h = historyReducer(h, { type: 'undo' });
  for (const text of ['Н', 'Но', 'Новый текст']) {
    const next = structuredClone(h.present); next.story.nodes.intro.text = text;
    h = historyReducer(h, { type: 'edit', document: next, group: 'intro:text' });
  }
  h = historyReducer(h, { type: 'undo' });
  assert.equal(h.present.story.nodes.intro.text, 'Привет');
  assert.deepEqual(h.present.layout.positions.reply, { x: 100, y: 200 });
});

test('renaming updates entry points, choices, captions and chapter references', () => {
  const doc = document();
  const renamed = renameNode(doc, 'intro', 'welcome');
  assert.equal(renamed.story.entry, 'welcome');
  assert.equal(renamed.story.chapters[0].entry, 'welcome');
  assert.equal(renamed.story.nodes.menu.prompt, 'welcome');
  assert.equal(renamed.story.nodes.intro, undefined);
  const linked = connect(renamed, 'menu', 'option:yes', 'end');
  assert.equal(linked.story.nodes.menu.options[0].next, 'end');
  assert.throws(() => renameNode(doc, 'intro', 'menu'));
});

test('JSON backup roundtrip includes chapter, story and viewport; rejects malformed input', () => {
  const doc = document(); doc.layout.viewport = { x: -200, y: 40, zoom: .65 };
  const restored = parseDocument(JSON.parse(JSON.stringify({ format: 'orsk-story-backup', document: doc })));
  assert.deepEqual(restored, doc);
  assert.throws(() => parseDocument({ schemaVersion: 99 }));
  assert.throws(() => parseDocument({ ...story(), nodes: { '__bad id': { type: 'end' } } }));
});

test('local store saves project JSON, automatically backs up, restores complete snapshots and detects file conflicts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orsk-editor-test-'));
  try {
    await mkdir(join(root, 'src/content'), { recursive: true });
    await writeFile(join(root, 'src/content/story.json'), JSON.stringify(story()), 'utf8');
    const store = createEditorStore(root, ['cover']);
    const original = await store.read();
    const doc = structuredClone(original.document); doc.story.nodes.intro.text = 'Изменено'; doc.layout.positions.intro = { x: 20, y: 40 };
    const saved = await store.save(doc, original.revision);
    assert.equal(JSON.parse(await readFile(join(root, 'src/content/story.json'), 'utf8')).nodes.intro.text, 'Изменено');
    assert.deepEqual(JSON.parse(await readFile(join(root, 'src/content/editor-layout.json'), 'utf8')).positions.intro, { x: 20, y: 40 });
    const backups = await store.backups(); assert.equal(backups.length, 1);
    const backup = await store.getBackup(backups[0].id);
    assert.equal(backup.document.story.nodes.intro.text, 'Привет');
    await assert.rejects(store.save(doc, original.revision), e => e.status === 409);
    assert.equal((await store.backups()).length, 1);
    const restored = await store.save(backup.document, saved.revision);
    assert.equal(restored.document.story.nodes.intro.text, 'Привет');
    assert.equal((await store.backups()).length, 2);
    const invalid = structuredClone(doc); invalid.story.nodes.intro.next = 'not-there';
    await assert.rejects(store.save(invalid, restored.revision), e => e.status === 422);
    assert.equal((await store.read()).document.story.nodes.intro.text, 'Привет');
    await assert.rejects(store.getBackup('../../story.json'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('legacy jumps collapse into direct edges, including chapter entries and choice returns', () => {
  const doc = document();
  doc.story.entry = 'label'; doc.story.chapters[0].entry = 'label';
  doc.story.nodes.label = { type: 'jump', next: 'hop', chapterId: 'chapter' };
  doc.story.nodes.hop = { type: 'jump', next: 'intro', chapterId: 'chapter' };
  doc.story.nodes.reply.next = 'label';
  doc.story.nodes.menu.options[0].next = 'label';
  doc.layout.positions.label = { x: 10, y: 10 };
  const clean = simplifyTransitions(doc);
  assert.equal(clean.story.entry, 'intro');
  assert.equal(clean.story.chapters[0].entry, 'intro');
  assert.equal(clean.story.nodes.reply.next, 'intro');
  assert.equal(clean.story.nodes.menu.options[0].next, 'intro');
  assert.equal(clean.story.nodes.menu.options[0].once, true);
  assert.equal(clean.story.nodes.menu.prompt, 'intro');
  assert.equal(clean.story.nodes.label, undefined);
  assert.equal(clean.layout.positions.label, undefined);
  assert.ok(doc.story.nodes.label);
});

test('jump cleanup refuses broken targets and cycles without mutating the original', () => {
  const doc = document(); doc.story.entry = 'broken';
  doc.story.nodes.broken = { type: 'jump', next: 'missing' };
  assert.throws(() => simplifyTransitions(doc), /Не найдена/);
  doc.story.nodes.broken.next = 'loop'; doc.story.nodes.loop = { type: 'jump', next: 'broken' };
  assert.throws(() => simplifyTransitions(doc), /Цикл/);
  assert.equal(doc.story.nodes.broken.next, 'loop');
});
