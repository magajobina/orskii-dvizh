import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { build, createServer } from 'vite';
import { gameImages } from '../dev/game-images.ts';

test('web build emits same-size WebP and leaves source PNG and animated GIF intact', async t => {
  // Windows sandbox TEMP can contain '#', which Vite interprets as a URL fragment.
  const temporary = join(process.cwd(), '.vite');
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, 'orsk-webp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = await sharp({ create: { width: 128, height: 96, channels: 4, background: '#aabbcc80' } }).png().toBuffer();
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  await writeFile(join(root, 'photo.png'), original);
  await writeFile(join(root, 'animation.gif'), gif);
  await writeFile(join(root, 'main.js'), "import a from './photo.png?game-image'; import b from './animation.gif?game-image'; console.log(a,b)");
  const result = await build({ root, configFile: false, plugins: [gameImages()], logLevel: 'silent', build: { write: false, rollupOptions: { input: join(root, 'main.js') } } });
  const assets = result.output.filter(item => item.type === 'asset');
  const webp = assets.find(item => item.fileName.endsWith('.webp'));
  const metadata = await sharp(webp.source).metadata();
  assert.equal(metadata.width, 128); assert.equal(metadata.height, 96); assert.equal(metadata.hasAlpha, true);
  assert.deepEqual(Buffer.from(assets.find(item => item.fileName.endsWith('.gif')).source), gif);
  assert.deepEqual(await readFile(join(root, 'photo.png')), original);
  const server = await createServer({ root, configFile: false, plugins: [gameImages()], logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  t.after(() => server.close()); await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  const entry = (await server.transformRequest('/main.js')).code;
  const imported = entry.match(/from\s*["']([^"']+orsk-game-image[^"']+)["']/)?.[1];
  assert.ok(imported, entry);
  const module = await server.transformRequest(imported.replace('/@id/__x00__', '\0').replace(/\?import$/, ''));
  assert.match(module.code, /photo\.png\?import&url|photo\.png\?url/);
  const originalResponse = await fetch(url + '/photo.png');
  assert.equal(originalResponse.status, 200);
  assert.deepEqual(Buffer.from(await originalResponse.arrayBuffer()), original);
});
