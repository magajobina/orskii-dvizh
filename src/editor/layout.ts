import dagre from '@dagrejs/dagre';
import { outgoing } from './model.ts';
import type { Document } from './model';
import type { Node } from '../engine/engine';

export const cardHeight = (node: Node) => node.type === 'choice' ? 78 + node.options.length * 38 : node.type === 'scene' ? 196 : 138;
export function autoLayout(document: Document, chapterId?: string): Document {
  const entries = Object.entries(document.story.nodes).filter(([, node]) => chapterId === undefined || (node.chapterId ?? '') === chapterId);
  const ids = new Set(entries.map(([id]) => id));
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 45, marginx: 65, marginy: 65 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const [id, node] of entries) graph.setNode(id, { width: 250, height: cardHeight(node) });
  // Return-to-menu edges must not make Dagre move an answer to the left of
  // its menu. They remain in the story/UI, but do not determine forward ranks.
  const state = new Map<string, number>();
  const backEdges = new Set<string>();
  const roots = [document.story.entry, ...document.story.chapters.map(chapter => chapter.entry), ...ids];
  for (const root of roots) {
    if (!ids.has(root) || state.has(root)) continue;
    state.set(root, 1);
    const stack = [{ id: root, edges: outgoing(document.story.nodes[root]), index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edge = frame.edges[frame.index++];
      if (!edge) { state.set(frame.id, 2); stack.pop(); continue; }
      if (!ids.has(edge.target)) continue;
      if (state.get(edge.target) === 1) backEdges.add(`${frame.id}::${edge.handle}`);
      else if (!state.has(edge.target)) {
        state.set(edge.target, 1);
        stack.push({ id: edge.target, edges: outgoing(document.story.nodes[edge.target]), index: 0 });
      }
    }
  }
  for (const [id, node] of entries) for (const edge of outgoing(node)) {
    if (ids.has(edge.target) && !backEdges.has(`${id}::${edge.handle}`)) graph.setEdge(id, edge.target, {}, edge.handle);
  }
  // In LR layout Dagre's left/right ordering constraints become top/bottom.
  // Shared targets and contradictory orders cannot all be separated, so only
  // add acyclic constraints between distinct continuations of each menu.
  const constraints: { left: string; right: string }[] = [];
  const below = new Map<string, Set<string>>();
  function reaches(from: string, target: string, seen = new Set<string>()): boolean {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(below.get(from) ?? [])].some(id => reaches(id, target, seen));
  }
  for (const [id, node] of entries) if (node.type === 'choice') {
    const targets = [...new Set(node.options.map(option => option.next).filter(target => ids.has(target) && target !== id))];
    for (let i = 0; i < targets.length - 1; i++) {
      const left = targets[i], right = targets[i + 1];
      if (reaches(right, left)) continue;
      constraints.push({ left, right });
      if (!below.has(left)) below.set(left, new Set());
      below.get(left)!.add(right);
    }
  }
  dagre.layout(graph, { constraints });
  const positions = Object.fromEntries(entries.map(([id]) => {
    const node = graph.node(id);
    return [id, { x: node.x - 125, y: node.y - cardHeight(document.story.nodes[id]) / 2 }];
  }));
  return { ...document, layout: { ...document.layout, positions: { ...document.layout.positions, ...positions } } };
}

export function ensureLayout(document: Document): Document {
  if (Object.keys(document.story.nodes).every(id => document.layout.positions[id])) return document;
  const computed = autoLayout(document);
  return { ...computed, layout: { ...computed.layout, positions: { ...computed.layout.positions, ...document.layout.positions } } };
}
