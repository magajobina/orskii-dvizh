import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';
import { createEditorStore } from './editor-store.ts';
import assets from '../src/content/assets.json';

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw Object.assign(Error('Нужен JSON.'), { status: 415 });
  const buffers: Buffer[] = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8 * 1024 * 1024) throw Object.assign(Error('Файл больше 8 МиБ.'), { status: 413 });
    buffers.push(Buffer.from(chunk));
  }
  const parsed = JSON.parse(Buffer.concat(buffers).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Некорректный запрос.');
  return parsed;
}

export function storyEditorPlugin(): Plugin {
  return {
    name: 'orsk-local-story-editor', apply: 'serve',
    configureServer(server) {
      const store = createEditorStore(server.config.root, Object.keys(assets));
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0] ?? '';
        if (!path.startsWith('/__editor/')) return next();
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        try {
          const host = request.headers.host ?? '';
          const hostname = new URL(`http://${host}`).hostname;
          if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) throw Object.assign(Error('Редактор доступен только локально.'), { status: 403 });
          if (request.method !== 'GET') {
            if (request.headers['x-orsk-editor'] !== '1' || (request.headers.origin && new URL(request.headers.origin).host !== host)) throw Object.assign(Error('Запрос из другого источника запрещён.'), { status: 403 });
          }
          let result: unknown;
          if (path === '/__editor/project' && request.method === 'GET') {
            const project = await store.read(); result = { document: project.document, revision: project.revision };
          } else if (path === '/__editor/project' && request.method === 'PUT') {
            const input = await body(request); result = await store.save(input.document, String(input.revision ?? ''));
          } else if (path === '/__editor/backups' && request.method === 'GET') result = await store.backups();
          else if (path === '/__editor/backups' && request.method === 'POST') {
            const input = await body(request); result = await store.backup(input.document, String(input.label ?? 'Ручная копия'));
          } else if (path.startsWith('/__editor/backups/') && request.method === 'GET') result = await store.getBackup(path.slice('/__editor/backups/'.length));
          else throw Object.assign(Error('Неизвестная команда редактора.'), { status: 404 });
          response.end(JSON.stringify(result));
        } catch (error) {
          response.statusCode = (error as { status?: number }).status ?? 400;
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Ошибка редактора.' }));
        }
      });
    },
    handleHotUpdate(context) {
      if (/\/src\/content\/(story|editor-layout)\.json$/.test(context.file.replaceAll('\\', '/'))) {
        context.server.ws.send({ type: 'custom', event: 'orsk-story-saved', data: {} });
        return [];
      }
    },
  };
}
