import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMediaStore } from '../dev/media-store.ts';
import { createEditorStore } from '../dev/editor-store.ts';
import { storyEditorPlugin } from '../dev/editor-plugin.ts';
import { createServer } from 'vite';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6H1QAAAAASUVORK5CYII=', 'base64');
const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]);
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'orsk-media-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/content'), { recursive: true });
  await writeFile(join(root, 'src/content/assets.json'), JSON.stringify({ cover: { file: 'cover.png', width: 1, height: 1 } }));
  await writeFile(join(root, 'src/content/audio.json'), '{}');
  await writeFile(join(root, 'src/content/story.json'), JSON.stringify({ version: 1, entry: 'end', cover: 'cover', chapters: [], nodes: { end: { type: 'end' } } }));
  return root;
}

test('imports images/audio byte-for-byte, registers metadata and survives reopening', async t => {
  const root = await workspace(t);
  const media = createMediaStore(root);
  const image = await media.upload('image', 'Новая картинка.png', png, 999, 999);
  assert.equal(image.id, 'Новая-картинка');
  assert.deepEqual(image.asset, { file: 'Новая-картинка.png', width: 1, height: 1 });
  const audio = await media.upload('audio', 'Стук в дверь.mp3', mp3);
  assert.equal(audio.asset.title, 'Стук в дверь');
  assert.deepEqual(await readFile(join(root, 'src/assets/illustrations', image.asset.file)), png);
  assert.deepEqual(await readFile(join(root, 'src/assets/audio', audio.asset.file)), mp3);
  const reopened = await createMediaStore(root).catalog();
  assert.deepEqual(reopened.images[image.id], image.asset);
  assert.deepEqual(reopened.audio[audio.id], audio.asset);
});

test('concurrent uploads and existing unregistered files never overwrite each other', async t => {
  const root = await workspace(t);
  await mkdir(join(root, 'src/assets/illustrations'), { recursive: true });
  await writeFile(join(root, 'src/assets/illustrations/photo.png'), 'original');
  const media = createMediaStore(root);
  const results = await Promise.all(['photo.png', 'PHOTO.PNG', 'photo.png'].map(name => media.upload('image', name, png)));
  assert.equal(results.length, new Set(results.map(item => item.id.toLowerCase())).size);
  assert.equal(await readFile(join(root, 'src/assets/illustrations/photo.png'), 'utf8'), 'original');
  assert.equal(Object.keys((await media.catalog()).images).length, 4);
  const reserved = await media.upload('audio', 'CON.mp3', mp3);
  assert.equal(reserved.id, 'media-CON');
});

test('invalid formats, traversal and invalid dimensions write no files or registry entries', async t => {
  const root = await workspace(t);
  const media = createMediaStore(root);
  for (const [kind, name, bytes] of [
    ['image', '../escape.png', png], ['image', 'C:\\escape.png', png],
    ['image', 'fake.png', Buffer.from('not an image')], ['image', 'image.svg', Buffer.from('<svg/>')],
    ['audio', 'script.js', mp3], ['audio', 'empty.mp3', Buffer.alloc(0)], ['bad', 'a.png', png],
    ['image', 'tiny.jpg', Buffer.from([255, 216, 255])],
  ]) await assert.rejects(media.upload(kind, name, bytes));
  assert.deepEqual(Object.keys((await media.catalog()).images), ['cover']);
  assert.deepEqual((await media.catalog()).audio, {});
  assert.ok(!(await readdir(join(root, 'src'))).includes('assets'));
});

test('saving a story immediately accepts a just-uploaded image without server restart', async t => {
  const root = await workspace(t);
  const media = createMediaStore(root);
  const store = createEditorStore(root, async () => Object.keys((await media.catalog()).images));
  const project = await store.read();
  const image = await media.upload('image', 'new-cover.png', png);
  project.document.story.cover = image.id;
  const saved = await store.save(project.document, project.revision);
  assert.equal(saved.document.story.cover, image.id);
});

test('local HTTP upload is protected, serves new files and updates the library without full reload', async t => {
  const root = await workspace(t);
  await mkdir(join(root, 'src/assets/illustrations'), { recursive: true });
  await mkdir(join(root, 'src/assets/audio'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.js"></script>');
  await writeFile(join(root, 'src/main.js'), "import a from './content/assets.json'; import b from './content/audio.json'; const images=import.meta.glob('./assets/illustrations/*',{eager:true,query:'?url',import:'default'}); const audio=import.meta.glob('./assets/audio/*',{eager:true,query:'?url',import:'default'}); console.log(a,b,images,audio);");
  const server = await createServer({ root, configFile: false, plugins: [storyEditorPlugin()], server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  t.after(() => server.close());
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await fetch(url + '/src/main.js');
  const events = [];
  const send = server.ws.send.bind(server.ws);
  server.ws.send = (...args) => { events.push(args[0]); return send(...args); };
  const path = '/__editor/media?kind=image&name=uploaded.png';
  assert.equal((await fetch(url + path, { method: 'POST', body: png })).status, 403);
  assert.equal((await fetch(url + path, { method: 'POST', body: png, headers: { 'X-Orsk-Editor': '1', Origin: 'http://elsewhere.invalid' } })).status, 403);
  const response = await fetch(url + path, { method: 'POST', body: png, headers: { 'X-Orsk-Editor': '1', 'Content-Type': 'application/octet-stream' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 'uploaded');
  const catalog = await (await fetch(url + '/__editor/media')).json();
  assert.equal(catalog.images.uploaded.width, 1);
  assert.deepEqual(Buffer.from(await (await fetch(url + '/src/assets/illustrations/uploaded.png')).arrayBuffer()), png);
  // A barrier after the watcher event, not an arbitrary UI sleep.
  await server.watcher.close();
  assert.ok(events.some(event => event.type === 'custom' && event.event === 'orsk-media-changed'));
  assert.ok(!events.some(event => event.type === 'full-reload' || event.type === 'update'), JSON.stringify(events));
});
