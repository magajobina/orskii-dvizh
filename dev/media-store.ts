import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mediaUsage } from '../src/content/mediaUsage.ts';
import type { Story } from '../src/engine/engine.ts';

export const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
type Kind = 'image' | 'audio';
type Catalog = Record<string, Record<string, unknown>>;
const fail = (message: string) => { throw Object.assign(Error(message), { status: 422 }); };

export function createMediaStore(root: string) {
  let queue: Promise<unknown> = Promise.resolve();
  const registryPath = (kind: Kind) => join(root, 'src/content', kind === 'image' ? 'assets.json' : 'audio.json');
  async function registry(kind: Kind): Promise<Catalog> {
    try { return JSON.parse(await readFile(registryPath(kind), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  }
  async function catalog() { return { images: await registry('image'), audio: await registry('audio') }; }
  async function saveRegistry(kind: Kind, assets: Catalog) {
    const temporary = `${registryPath(kind)}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, JSON.stringify(assets, null, 2) + '\n', 'utf8');
      await rename(temporary, registryPath(kind));
    } finally { await unlink(temporary).catch(() => {}); }
  }
  function mediaPath(kind: Kind, file: unknown) {
    if (typeof file !== 'string' || !file || basename(file) !== file || /[\\/:\x00-\x1f]/.test(file)) fail('Некорректный путь файла.');
    return join(root, 'src/assets', kind === 'image' ? 'illustrations' : 'audio', file as string);
  }
  async function removeItem(kind: Kind, id: string) {
    if (!['image', 'audio'].includes(kind)) fail('Неизвестный тип библиотеки.');
    const assets = await registry(kind);
    if (!Object.hasOwn(assets, id)) fail('Файл уже удалён или не найден.');
    const story = JSON.parse(await readFile(join(root, 'src/content/story.json'), 'utf8')) as Story;
    const uses = mediaUsage(story, kind, id);
    for (const [alias, item] of Object.entries(assets)) if (item.fallback === id) uses.push(`Замена для ${alias}`);
    if (uses.length) fail(`Файл используется. Сначала уберите привязки и сохраните сюжет:\n${uses.join('\n')}`);
    const asset = assets[id];
    const shared = Object.entries(assets).some(([other, item]) => other !== id && item.file && item.file === asset.file);
    const ticket = `${Date.now()}-${randomUUID()}`;
    const directory = join(root, '.editor-media-trash', ticket);
    let moved = false;
    const source = asset.file ? mediaPath(kind, asset.file) : undefined;
    if (source && !shared) {
      try {
        const actual = await realpath(source);
        const allowed = await realpath(join(root, 'src/assets', kind === 'image' ? 'illustrations' : 'audio'));
        if (!actual.startsWith(allowed + sep)) fail('Файл находится вне библиотеки.');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    await mkdir(directory, { recursive: true });
    if (source && !shared) {
      try { await rename(source, join(directory, asset.file as string)); moved = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    try {
      await writeFile(join(directory, 'metadata.json'), JSON.stringify({ kind, id, asset, moved }, null, 2));
      delete assets[id];
      await saveRegistry(kind, assets);
    } catch (error) {
      if (moved) await rename(join(directory, asset.file as string), source!);
      throw error;
    }
    return { ticket, id };
  }
  async function restoreItem(ticket: string) {
    if (!/^\d{13}-[a-f0-9-]{36}$/.test(ticket)) fail('Некорректная запись корзины.');
    const directory = resolve(root, '.editor-media-trash', ticket);
    const record = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8')) as { kind: Kind; id: string; asset: Record<string, unknown>; moved: boolean };
    if (!['image', 'audio'].includes(record.kind)) fail('Некорректный тип файла.');
    const assets = await registry(record.kind);
    if (Object.hasOwn(assets, record.id)) fail('Этот ID уже занят.');
    let restored: string | undefined;
    if (record.moved) {
      const destination = mediaPath(record.kind, record.asset.file);
      await copyFile(join(directory, record.asset.file as string), destination, constants.COPYFILE_EXCL);
      restored = destination;
    }
    try { assets[record.id] = record.asset; await saveRegistry(record.kind, assets); }
    catch (error) { if (restored) await unlink(restored); throw error; }
    return { id: record.id };
  }
  function serialize<T>(job: () => Promise<T>): Promise<T> {
    const result = queue.then(job); queue = result.catch(() => {}); return result;
  }

  async function trashEntries() {
    const workspace = await realpath(root);
    const directory = resolve(root, '.editor-media-trash');
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== join(workspace, '.editor-media-trash')) fail('Некорректный путь корзины.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const entries: { path: string; bytes: number }[] = [];
    for (const name of await readdir(directory)) {
      if (!/^\d{13}-[a-f0-9-]{36}$/.test(name)) continue;
      const target = resolve(directory, name);
      const info = await lstat(target);
      if (!info.isDirectory() || info.isSymbolicLink() || await realpath(target) !== join(workspace, '.editor-media-trash', name)) fail('Некорректная запись корзины.');
      let bytes = 0;
      for (const file of await readdir(target)) {
        const item = await lstat(join(target, file));
        if (!item.isFile() || item.isSymbolicLink()) fail('В корзине обнаружен посторонний каталог или ссылка.');
        bytes += item.size;
      }
      entries.push({ path: target, bytes });
    }
    return entries;
  }
  async function trashSummary() {
    const entries = await trashEntries();
    return { count: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
  }
  async function emptyTrash() {
    // Verify every absolute target before any recursive removal. Never follow links.
    const entries = await trashEntries();
    for (const entry of entries) await rm(entry.path, { recursive: true });
    return { count: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
  }

  async function store(kind: Kind, name: string, bytes: Buffer, width?: number, height?: number) {
    if (!['image', 'audio'].includes(kind)) fail('Неизвестный тип библиотеки.');
    if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) fail('Нужен непустой файл размером до 64 МиБ.');
    if (!name || name.length > 240 || /[\\/\x00-\x1f:]/.test(name)) fail('Некорректное имя файла.');
    const dot = name.lastIndexOf('.');
    const extension = name.slice(dot + 1).toLowerCase();
    const originalStem = name.slice(0, dot);
    const head = bytes.subarray(0, 12);
    const ascii = (start: number, end: number) => head.toString('ascii', start, end);
    const signatures: Record<string, boolean> = {
      png: bytes.length >= 24 && head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      jpg: head[0] === 255 && head[1] === 216 && head[2] === 255,
      jpeg: head[0] === 255 && head[1] === 216 && head[2] === 255,
      gif: ['GIF87a', 'GIF89a'].includes(ascii(0, 6)),
      webp: ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP',
      mp3: ascii(0, 3) === 'ID3' || (head[0] === 255 && (head[1] & 224) === 224),
      wav: ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE',
      ogg: ascii(0, 4) === 'OggS',
      m4a: ascii(4, 8) === 'ftyp',
      aac: head[0] === 255 && (head[1] & 246) === 240,
      flac: ascii(0, 4) === 'fLaC',
    };
    const allowed = kind === 'image' ? ['png', 'jpg', 'jpeg', 'gif', 'webp'] : ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    if (dot < 1 || !allowed.includes(extension) || !signatures[extension]) fail('Формат файла не поддерживается или содержимое не соответствует расширению.');
    if (kind === 'image') {
      if (extension === 'png') { width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20); }
      if (extension === 'gif') { width = bytes.readUInt16LE(6); height = bytes.readUInt16LE(8); }
      if (!Number.isInteger(width) || !Number.isInteger(height) || width! < 1 || height! < 1 || width! > 50000 || height! > 50000) fail('Не удалось определить размеры картинки.');
    }
    let stem = originalStem.normalize('NFC').replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^[._-]+|[._-]+$/g, '').slice(0, 120) || 'media';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) || ['constructor', 'prototype', '__proto__'].includes(stem)) stem = `media-${stem}`;
    const directory = join(root, 'src/assets', kind === 'image' ? 'illustrations' : 'audio');
    await mkdir(directory, { recursive: true });
    const assets = await registry(kind);
    const occupiedIds = new Set(Object.keys(assets).map(id => id.toLowerCase()));
    const occupiedFiles = new Set((await readdir(directory)).map(file => file.toLowerCase()));
    for (const item of Object.values(assets)) if (typeof item.file === 'string') occupiedFiles.add(item.file.toLowerCase());
    let id = stem, suffix = 2;
    while (occupiedIds.has(id.toLowerCase()) || occupiedFiles.has(`${id}.${extension}`.toLowerCase())) id = `${stem}-${suffix++}`;
    const file = `${id}.${extension}`;
    const destination = join(directory, file);
    const asset = kind === 'image' ? { file, width, height } : { file, title: originalStem, source: 'Локальный импорт', license: 'Не указана' };
    const temporary = `${registryPath(kind)}.tmp-${randomUUID()}`;
    await writeFile(destination, bytes, { flag: 'wx' });
    try {
      assets[id] = asset;
      await writeFile(temporary, JSON.stringify(assets, null, 2) + '\n', 'utf8');
      await rename(temporary, registryPath(kind));
    } catch (error) {
      await unlink(destination).catch(() => {});
      throw error;
    } finally { await unlink(temporary).catch(() => {}); }
    return { id, asset };
  }
  function upload(kind: Kind, name: string, bytes: Buffer, width?: number, height?: number) {
    const job = queue.then(() => store(kind, name, bytes, width, height));
    queue = job.catch(() => {});
    return job;
  }
  return { catalog, upload, remove: (kind: Kind, id: string) => serialize(() => removeItem(kind, id)), restore: (ticket: string) => serialize(() => restoreItem(ticket)), trash: () => serialize(trashSummary), emptyTrash: () => serialize(emptyTrash) };
}
