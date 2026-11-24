import type { Node } from '../engine/engine';
import type { Document } from './model';
import { validId } from './model.ts';
import { cardHeight } from './layout.ts';

export function insertBefore(document: Document, target: string, id: string, node: Extract<Node, { type: 'text' | 'scene' }>): Document {
  if (!document.story.nodes[target]) throw Error('Выбранный блок не найден.');
  if (!validId(id) || Object.hasOwn(document.story.nodes, id)) throw Error('ID нового блока занят или некорректен.');
  const next = structuredClone(document);
  const selected = next.story.nodes[target];
  // Prompt references name a dialogue, not a transition, so leave them alone.
  for (const existing of Object.values(next.story.nodes)) {
    if ('next' in existing && existing.next === target) existing.next = id;
    if (existing.type === 'choice') for (const option of existing.options) if (option.next === target) option.next = id;
  }
  if (next.story.entry === target) next.story.entry = id;
  for (const chapter of next.story.chapters) if (chapter.entry === target) chapter.entry = id;
  const inserted = { ...node, next: target, chapterId: selected.chapterId };
  next.story.nodes[id] = inserted;
  const origin = { ...(next.layout.positions[target] ?? { x: 100, y: 100 }) };
  // Make one column of room without relaying out the user's whole graph.
  for (const [key, position] of Object.entries(next.layout.positions)) {
    if (next.story.nodes[key]?.chapterId === selected.chapterId && position.x >= origin.x) position.x += 350;
  }
  next.layout.positions[id] = { x: origin.x, y: origin.y + (cardHeight(selected) - cardHeight(inserted)) / 2 };
  return next;
}
