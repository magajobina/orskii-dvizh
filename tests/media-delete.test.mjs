import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMediaStore } from '../dev/media-store.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6H1QAAAAASUVORK5CYII=', 'base64');
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'orsk-delete-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/content'), { recursive: true });
  await writeFile(join(root, 'src/content/assets.json'), '{}');
  await writeFile(join(root, 'src/content/audio.json'), '{}');
  const story = { version: 1, entry: 'end', cover: 'cover', chapters: [], nodes: { end: { type: 'end' } } };
  await writeFile(join(root, 'src/content/story.json'), JSON.stringify(story));
  return { root, story, media: createMediaStore(root) };
}

test('image/audio removal updates registry, keeps recoverable bytes, and undo restores originals', async t => {
  const { root, media } = await setup(t);
  for (const [kind, name, bytes, catalog] of [['image', 'photo.png', png, 'images'], ['audio', 'sound.mp3', Buffer.from('ID3test-audio'), 'audio']]) {
    const { id, asset } = await media.upload(kind, name, bytes);
    const path = join(root, 'src/assets', kind === 'image' ? 'illustrations' : 'audio', asset.file);
    const { ticket } = await media.remove(kind, id);
    assert.equal((await media.catalog())[catalog][id], undefined);
    await assert.rejects(readFile(path), { code: 'ENOENT' });
    assert.deepEqual(await readFile(join(root, '.editor-media-trash', ticket, asset.file)), bytes);
    await createMediaStore(root).restore(ticket);
    assert.deepEqual(await readFile(path), bytes);
    assert.deepEqual((await media.catalog())[catalog][id], asset);
    await assert.rejects(media.restore(ticket));
  }
});

test('used assets and fallback targets cannot be removed, even by calling the API directly', async t => {
  const { root, media, story } = await setup(t);
  const { id } = await media.upload('image', 'cover.png', png);
  await assert.rejects(media.remove('image', id), /Обложка/);
  const sound = await media.upload('audio', 'voice.mp3', Buffer.from('ID3voice'));
  story.nodes.first = { type: 'text', text: 'Test', next: 'end', audio: sound.id };
  await writeFile(join(root, 'src/content/story.json'), JSON.stringify(story));
  await assert.rejects(media.remove('audio', sound.id), /Блок first/);
  const unused = await media.upload('image', 'unused.png', png);
  const assets = (await media.catalog()).images;
  assets.alias = { fallback: unused.id };
  await writeFile(join(root, 'src/content/assets.json'), JSON.stringify(assets));
  await assert.rejects(media.remove('image', unused.id), /Замена для alias/);
});

test('shared files remain intact; traversal and restoring over a new file are refused', async t => {
  const { root, media } = await setup(t);
  const image = await media.upload('image', 'shared.png', png);
  const assets = (await media.catalog()).images;
  assets.other = { ...image.asset };
  assets.escape = { file: '../outside.png' };
  await writeFile(join(root, 'src/content/assets.json'), JSON.stringify(assets));
  const { ticket } = await media.remove('image', image.id);
  assert.deepEqual(await readFile(join(root, 'src/assets/illustrations/shared.png')), png);
  await media.restore(ticket);
  await assert.rejects(media.remove('image', 'escape'), /путь/);
  await assert.rejects(media.restore('../../escape'), /корзины/);
  const unused = await media.upload('image', 'other-file.png', png);
  const deleted = await media.remove('image', unused.id);
  const destination = join(root, 'src/assets/illustrations', unused.asset.file);
  await writeFile(destination, 'new contents');
  await assert.rejects(media.restore(deleted.ticket));
  assert.equal(await readFile(destination, 'utf8'), 'new contents');
});

test('emptying trash permanently frees stored files but preserves active and restored assets', async t => {
  const { root, media } = await setup(t);
  assert.deepEqual(await media.trash(), { count: 0, bytes: 0 });
  const active = await media.upload('image', 'active.png', png);
  const removed = await media.upload('image', 'removed.png', png);
  const restored = await media.upload('audio', 'restored.mp3', Buffer.from('ID3voice'));
  const removedTicket = await media.remove('image', removed.id);
  const restoredTicket = await media.remove('audio', restored.id);
  await media.restore(restoredTicket.ticket);
  const before = await media.trash();
  assert.equal(before.count, 2);
  assert.ok(before.bytes > png.length);
  const catalog = await media.catalog();
  assert.deepEqual(await media.emptyTrash(), before);
  assert.deepEqual(await media.trash(), { count: 0, bytes: 0 });
  await assert.rejects(readFile(join(root, '.editor-media-trash', removedTicket.ticket, removed.asset.file)), { code: 'ENOENT' });
  await assert.rejects(media.restore(removedTicket.ticket));
  assert.deepEqual(await media.catalog(), catalog);
  assert.deepEqual(await readFile(join(root, 'src/assets/illustrations', active.asset.file)), png);
  assert.equal(await readFile(join(root, 'src/assets/audio', restored.asset.file), 'utf8'), 'ID3voice');
  assert.deepEqual(await media.emptyTrash(), { count: 0, bytes: 0 });
});

test('trash cleanup refuses unexpected subdirectories before deleting anything', async t => {
  const { root, media } = await setup(t);
  const image = await media.upload('image', 'photo.png', png);
  const { ticket } = await media.remove('image', image.id);
  await mkdir(join(root, '.editor-media-trash', ticket, 'unexpected'));
  await assert.rejects(media.emptyTrash(), /посторонний/);
  assert.deepEqual(await readFile(join(root, '.editor-media-trash', ticket, image.asset.file)), png);
});
