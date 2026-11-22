import type { Node, Story } from '../engine/engine.ts';

export type Point = { x: number; y: number };
export type View = Point & { zoom: number };
export type Document = { schemaVersion: 1; story: Story; layout: { positions: Record<string, Point>; viewport: View } };
export type Issue = { nodeId?: string; message: string; severity: 'error' | 'warning' };
export type Clip = { kind: 'orsk-nodes'; nodes: Record<string, Node>; positions: Record<string, Point> };
export const kindNames = { text: 'Реплика', scene: 'Картинка', choice: 'Выбор', jump: 'Переход', end: 'Конец' };
export const emptyView = { x: 60, y: 60, zoom: 0.8 };

// Bypass legacy Ren'Py jump/label nodes while preserving all entry points.
export function simplifyTransitions(document: Document): Document {
  const next = structuredClone(document);
  function destination(id: string): string {
    const visited = new Set<string>();
    while (next.story.nodes[id]?.type === 'jump') {
      if (visited.has(id)) throw Error(`Цикл переходов: ${id}`);
      visited.add(id);
      id = (next.story.nodes[id] as Extract<Node, { type: 'jump' }>).next;
      if (!next.story.nodes[id]) throw Error(`Не найдена цель перехода: ${id}`);
    }
    return id;
  }
  next.story.entry = destination(next.story.entry);
  for (const chapter of next.story.chapters) chapter.entry = destination(chapter.entry);
  for (const node of Object.values(next.story.nodes)) {
    if ('next' in node) node.next = destination(node.next);
    if (node.type === 'choice') for (const option of node.options) option.next = destination(option.next);
  }
  for (const [id, node] of Object.entries(next.story.nodes)) if (node.type === 'jump') {
    delete next.story.nodes[id];
    delete next.layout.positions[id];
  }
  return next;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const validId = (id: string) => /^[\p{L}\p{N}_][\p{L}\p{N}_.:-]*$/u.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function parseDocument(input: unknown): Document {
  let value = input;
  if (object(value) && 'document' in value) value = value.document;
  if (object(value) && 'nodes' in value) value = { schemaVersion: 1, story: value, layout: { positions: {}, viewport: emptyView } };
  if (!object(value) || value.schemaVersion !== 1 || !object(value.story)) throw Error('Это не JSON сюжета или резервная копия редактора.');
  const s = value.story;
  if (s.version !== 1 || typeof s.entry !== 'string' || typeof s.cover !== 'string' || !Array.isArray(s.chapters) || !object(s.nodes)) throw Error('Неподдерживаемая структура сюжета.');
  const entries = Object.entries(s.nodes);
  if (entries.length === 0 || entries.length > 10000) throw Error('Допустимо от 1 до 10 000 блоков.');
  for (const [id, node] of entries) {
    if (!validId(id) || !object(node) || !['text', 'scene', 'choice', 'jump', 'end'].includes(String(node.type))) throw Error(`Некорректный блок ${id}.`);
    if (node.chapterId !== undefined && (typeof node.chapterId !== 'string' || !validId(node.chapterId))) throw Error(`${id}: некорректный ID главы.`);
    if (['text', 'scene', 'jump'].includes(String(node.type)) && typeof node.next !== 'string') throw Error(`${id}: переход должен быть строкой.`);
    if (node.type === 'text' && typeof node.text !== 'string') throw Error(`${id}: нет текста.`);
    if (node.type === 'scene' && typeof node.asset !== 'string') throw Error(`${id}: нет ID иллюстрации.`);
    if (node.type === 'choice') {
      if (!Array.isArray(node.options) || node.options.length > 100) throw Error(`${id}: некорректные варианты.`);
      for (const o of node.options) if (!object(o) || typeof o.id !== 'string' || !validId(o.id) || typeof o.text !== 'string' || typeof o.next !== 'string' || (o.once !== undefined && typeof o.once !== 'boolean')) throw Error(`${id}: некорректный вариант ответа.`);
      if (node.prompt !== undefined && typeof node.prompt !== 'string') throw Error(`${id}: некорректная подпись меню.`);
    }
  }
  for (const c of s.chapters) if (!object(c) || typeof c.id !== 'string' || !validId(c.id) || typeof c.title !== 'string' || typeof c.entry !== 'string' || typeof c.image !== 'string') throw Error('Некорректная глава.');
  const positions: Record<string, Point> = {};
  if (object(value.layout) && object(value.layout.positions)) for (const [id, p] of Object.entries(value.layout.positions)) {
    if (!validId(id) || !object(p) || !finite(p.x) || !finite(p.y)) throw Error('Некорректные координаты схемы.');
    if (Object.hasOwn(s.nodes, id)) positions[id] = { x: p.x, y: p.y };
  }
  const v = object(value.layout) && object(value.layout.viewport) ? value.layout.viewport : emptyView;
  const viewport = finite(v.x) && finite(v.y) && finite(v.zoom) && v.zoom > 0 && v.zoom <= 10 ? { x: v.x, y: v.y, zoom: v.zoom } : { ...emptyView };
  return { schemaVersion: 1, story: structuredClone(s) as unknown as Story, layout: { positions, viewport } };
}

export function outgoing(node: Node): { handle: string; target: string; label?: string }[] {
  if (node.type === 'choice') return node.options.map(o => ({ handle: `option:${o.id}`, target: o.next, label: o.text }));
  return 'next' in node ? [{ handle: 'next', target: node.next }] : [];
}

export function validateStory(story: Story, assetIds: string[]): Issue[] {
  const issues: Issue[] = [];
  const add = (message: string, nodeId?: string, severity: Issue['severity'] = 'error') => issues.push({ message, nodeId, severity });
  const exists = (id: string) => !!id && Object.hasOwn(story.nodes, id);
  if (!exists(story.entry)) add('Не задан существующий стартовый блок.');
  if (!assetIds.includes(story.cover)) add(`Не найдена обложка ${story.cover}.`);
  const optionIds = new Set<string>();
  for (const [id, node] of Object.entries(story.nodes)) {
    if (node.chapterId && !story.chapters.some(chapter => chapter.id === node.chapterId)) add(`Не найдена глава ${node.chapterId}.`, id);
    if (!node.chapterId) add('Блок не распределён по главам.', id, 'warning');
    for (const edge of outgoing(node)) if (!exists(edge.target)) add(`Не подключён переход ${edge.handle}.`, id);
    if (node.type === 'scene' && !assetIds.includes(node.asset)) add(`Не найдена иллюстрация ${node.asset}.`, id);
    if (node.type === 'text' && !node.text.trim()) add('Пустая реплика.', id, 'warning');
    if (node.type === 'choice') {
      if (!node.options.length) add('В меню нет вариантов.', id);
      if (node.prompt && story.nodes[node.prompt]?.type !== 'text') add('Подпись меню должна ссылаться на реплику.', id);
      if (node.options.length && node.options.every(o => o.once)) add('Все варианты одноразовые: при возврате меню может оказаться пустым.', id, 'warning');
      for (const option of node.options) {
        if (optionIds.has(option.id)) add(`Повторяется ID ответа ${option.id}.`, id);
        optionIds.add(option.id);
      }
    }
  }
  const chapterIds = new Set<string>();
  for (const chapter of story.chapters) {
    if (chapterIds.has(chapter.id)) add(`Повторяется ID главы ${chapter.id}.`);
    chapterIds.add(chapter.id);
    if (!exists(chapter.entry)) add(`Нет начала главы «${chapter.title}».`);
    if (!assetIds.includes(chapter.image)) add(`Нет иллюстрации главы «${chapter.title}».`);
  }
  // Only automatic cycles are invalid. Loops through dialogue or choices are intentional.
  const reported = new Set<string>();
  for (const id of Object.keys(story.nodes)) {
    let current = id;
    const path = new Set<string>();
    while (exists(current)) {
      const node = story.nodes[current];
      if (node.type !== 'scene' && node.type !== 'jump') break;
      if (path.has(current)) { if (!reported.has(current)) add('Цикл без реплики или выбора.', current); for (const key of path) reported.add(key); break; }
      path.add(current); current = node.next;
    }
  }
  const seen = new Set<string>();
  const queue = [story.entry, ...story.chapters.map(c => c.entry)];
  while (queue.length) {
    const id = queue.pop()!;
    if (!exists(id) || seen.has(id)) continue;
    seen.add(id); queue.push(...outgoing(story.nodes[id]).map(e => e.target));
  }
  for (const id of Object.keys(story.nodes)) if (!seen.has(id)) add('Блок недостижим из начала или глав.', id, 'warning');
  return issues;
}

export function connect(doc: Document, source: string, handle: string, target: string): Document {
  const next = structuredClone(doc);
  const node = next.story.nodes[source];
  if (!node || (target && !Object.hasOwn(next.story.nodes, target))) throw Error('Блок перехода не найден.');
  if (node.type === 'choice') {
    const option = node.options.find(o => `option:${o.id}` === handle);
    if (!option) throw Error('Вариант ответа не найден.');
    option.next = target;
  } else if ('next' in node && handle === 'next') node.next = target;
  else throw Error('У этого блока нет такого выхода.');
  return next;
}

export function removeNodes(doc: Document, ids: string[]): Document {
  const next = structuredClone(doc);
  const removed = new Set(ids);
  for (const id of ids) { delete next.story.nodes[id]; delete next.layout.positions[id]; }
  if (!Object.keys(next.story.nodes).length) throw Error('Оставьте хотя бы один блок.');
  for (const node of Object.values(next.story.nodes)) {
    if ('next' in node && removed.has(node.next)) node.next = '';
    if (node.type === 'choice') {
      for (const option of node.options) if (removed.has(option.next)) option.next = '';
      if (node.prompt && removed.has(node.prompt)) delete node.prompt;
    }
  }
  return next;
}

export function renameNode(doc: Document, from: string, to: string): Document {
  if (!validId(to) || Object.hasOwn(doc.story.nodes, to)) throw Error('ID занят или содержит недопустимые символы.');
  const next = structuredClone(doc);
  if (!next.story.nodes[from]) throw Error('Блок не найден.');
  next.story.nodes[to] = next.story.nodes[from]; delete next.story.nodes[from];
  if (next.layout.positions[from]) { next.layout.positions[to] = next.layout.positions[from]; delete next.layout.positions[from]; }
  if (next.story.entry === from) next.story.entry = to;
  for (const chapter of next.story.chapters) if (chapter.entry === from) chapter.entry = to;
  for (const node of Object.values(next.story.nodes)) {
    if ('next' in node && node.next === from) node.next = to;
    if (node.type === 'choice') {
      if (node.prompt === from) node.prompt = to;
      for (const option of node.options) if (option.next === from) option.next = to;
    }
  }
  return next;
}

export function makeClip(doc: Document, ids: string[]): Clip {
  return { kind: 'orsk-nodes', nodes: Object.fromEntries(ids.filter(id => doc.story.nodes[id]).map(id => [id, structuredClone(doc.story.nodes[id])])), positions: Object.fromEntries(ids.map(id => [id, doc.layout.positions[id] ?? { x: 0, y: 0 }])) };
}

export function pasteClip(doc: Document, clip: Clip, suffix: string, offset = 60): { document: Document; ids: string[] } {
  if (!clip || clip.kind !== 'orsk-nodes' || !object(clip.nodes) || Object.keys(clip.nodes).length > 1000) throw Error('Буфер не содержит блоков редактора.');
  const next = structuredClone(doc);
  const mapping = Object.fromEntries(Object.keys(clip.nodes).map((id, index) => [id, `copy-${suffix}-${index}`]));
  const destination = (id: string) => mapping[id] ?? (Object.hasOwn(next.story.nodes, id) ? id : '');
  for (const [oldId, original] of Object.entries(clip.nodes)) {
    const id = mapping[oldId];
    if (Object.hasOwn(next.story.nodes, id)) throw Error('Повторный ID вставки.');
    const node = structuredClone(original);
    if ('next' in node) node.next = destination(node.next);
    if (node.type === 'choice') {
      node.options = node.options.map((o, i) => ({ ...o, id: `${id}-answer-${i + 1}`, next: destination(o.next) }));
      if (node.prompt) node.prompt = destination(node.prompt) || undefined;
    }
    next.story.nodes[id] = node;
    const p = clip.positions?.[oldId] ?? { x: 0, y: 0 };
    next.layout.positions[id] = { x: p.x + offset, y: p.y + offset };
  }
  return { document: parseDocument(next), ids: Object.values(mapping) };
}

export function contextImage(story: Story, id: string): string {
  const queue = [id]; const seen = new Set<string>();
  const incoming = new Map<string, string[]>();
  for (const [source, node] of Object.entries(story.nodes)) for (const e of outgoing(node)) incoming.set(e.target, [...(incoming.get(e.target) ?? []), source]);
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const node = story.nodes[current];
    if (node?.type === 'scene') return node.asset;
    queue.push(...(incoming.get(current) ?? []));
  }
  return story.cover;
}

export type History = { past: Document[]; present: Document; future: Document[]; group?: string };
export type HistoryAction = { type: 'edit'; document: Document; group?: string } | { type: 'undo' | 'redo' | 'end-group' } | { type: 'reset'; document: Document } | { type: 'viewport'; viewport: View };
export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === 'reset') return { past: [], present: action.document, future: [] };
  if (action.type === 'end-group') return { ...state, group: undefined };
  if (action.type === 'viewport') return { ...state, present: { ...state.present, layout: { ...state.present.layout, viewport: action.viewport } } };
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous ? { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] } : state;
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next ? { past: [...state.past, state.present], present: next, future: state.future.slice(1) } : state;
  }
  if (action.type !== 'edit') return state;
  if (JSON.stringify(action.document) === JSON.stringify(state.present)) return state;
  const coalesce = action.group && action.group === state.group;
  return { past: coalesce ? state.past : [...state.past.slice(-99), state.present], present: action.document, future: [], group: action.group };
}
