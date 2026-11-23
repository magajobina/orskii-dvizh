import { readFile, writeFile, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseDocument, validateStory } from '../src/editor/model.ts';
import type { Document } from '../src/editor/model.ts';

export function createEditorStore(root: string, assetIds: string[] | (() => Promise<string[]>)) {
  const storyPath = join(root, 'src/content/story.json');
  const layoutPath = join(root, 'src/content/editor-layout.json');
  const directory = join(root, '.editor-backups');
  let queue: Promise<unknown> = Promise.resolve();
  async function read() {
    const storyText = await readFile(storyPath, 'utf8');
    let layoutText = '';
    try { layoutText = await readFile(layoutPath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const document = parseDocument({ schemaVersion: 1, story: JSON.parse(storyText), layout: layoutText ? JSON.parse(layoutText) : undefined });
    const revision = createHash('sha256').update(storyText + '\0' + layoutText).digest('hex');
    return { document, revision, storyText, layoutText };
  }
  async function backup(input: unknown, label = 'Ручная копия') {
    const document = parseDocument(input);
    await mkdir(directory, { recursive: true });
    const id = `${Date.now()}-${randomUUID()}.json`;
    const createdAt = new Date().toISOString();
    const safeLabel = String(label).slice(0, 160);
    await writeFile(join(directory, id), JSON.stringify({ format: 'orsk-story-backup', version: 1, createdAt, label: safeLabel, document }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    return { id, createdAt, label: safeLabel, nodes: Object.keys(document.story.nodes).length };
  }
  const validBackup = (id: string) => /^\d{13}-[a-f0-9-]{36}\.json$/.test(id);
  async function getBackup(id: string) {
    if (!validBackup(id)) throw Error('Некорректный ID резервной копии.');
    const raw = JSON.parse(await readFile(join(directory, id), 'utf8'));
    return { ...raw, document: parseDocument(raw) };
  }
  async function backups() {
    await mkdir(directory, { recursive: true });
    const names = (await readdir(directory)).filter(validBackup).sort().reverse();
    const result = [];
    for (const id of names) {
      try {
        const item = await getBackup(id);
        result.push({ id, label: String(item.label), createdAt: String(item.createdAt), nodes: Object.keys(item.document.story.nodes).length });
      } catch { result.push({ id, label: 'Повреждённый файл', createdAt: '', nodes: 0, broken: true }); }
    }
    return result;
  }
  async function doSave(input: unknown, revision: string) {
    const document = parseDocument(input);
    const errors = validateStory(document.story, typeof assetIds === 'function' ? await assetIds() : assetIds).filter(issue => issue.severity === 'error');
    if (errors.length) throw Object.assign(Error(errors.map(issue => `${issue.nodeId ?? 'Сюжет'}: ${issue.message}`).join('\n')), { status: 422 });
    const current = await read();
    if (current.revision !== revision) throw Object.assign(Error('JSON проекта изменён снаружи. Сначала экспортируйте свой черновик и перезагрузите редактор.'), { status: 409 });
    const savedBackup = await backup(current.document, 'Перед сохранением');
    const suffix = `.tmp-${randomUUID()}`;
    const storyTemp = storyPath + suffix;
    const layoutTemp = layoutPath + suffix;
    try {
      await writeFile(storyTemp, JSON.stringify(document.story, null, 2) + '\n', 'utf8');
      await writeFile(layoutTemp, JSON.stringify(document.layout, null, 2) + '\n', 'utf8');
      await rename(layoutTemp, layoutPath);
      await rename(storyTemp, storyPath);
    } catch (error) {
      await writeFile(storyPath, current.storyText, 'utf8');
      if (current.layoutText) await writeFile(layoutPath, current.layoutText, 'utf8');
      else await unlink(layoutPath).catch(() => {});
      throw error;
    } finally {
      await unlink(storyTemp).catch(() => {});
      await unlink(layoutTemp).catch(() => {});
    }
    const result = await read();
    return { document: result.document, revision: result.revision, backup: savedBackup };
  }
  function save(input: unknown, revision: string) {
    const job = queue.then(() => doSave(input, revision));
    queue = job.catch(() => {});
    return job;
  }
  return { read, backup, backups, getBackup, save };
}
