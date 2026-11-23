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
    if (ids.has(edge.target) && !backEdges.has(`${id}::${edge.handle}`)) graph.setEdge(id, edge.target, { weight: node.type === 'choice' ? 1 : 8 }, edge.handle);
  }
  // First determine forward columns. Then carry each answer's lane through
  // its whole continuation, rather than constraining only the first target.
  dagre.layout(graph);
  const lanes = new Map<string, number[]>();
  const ordered = [...ids].sort((a, b) => graph.node(a).x - graph.node(b).x || graph.node(a).y - graph.node(b).y);
  for (const id of ordered) {
    const incoming = (graph.inEdges(id) ?? []).map(edge => {
      const source = document.story.nodes[edge.v];
      const lane = lanes.get(edge.v) ?? [];
      if (source.type !== 'choice') return lane;
      // Several answers may intentionally lead to the same block. Keep that
      // block in the lane of its first answer instead of treating it as a join.
      return [...lane, source.options.findIndex(option => option.next === id)];
    });
    // A shared continuation belongs to the common parent lane, not whichever
    // answer happened to be visited first. Return edges are already excluded.
    const common = [...(incoming[0] ?? [])];
    for (const lane of incoming.slice(1)) {
      let length = 0;
      while (length < common.length && common[length] === lane[length]) length++;
      common.length = length;
    }
    lanes.set(id, common);
  }
  const columns = new Map<number, string[]>();
  for (const id of ordered) {
    const x = graph.node(id).x;
    if (!columns.has(x)) columns.set(x, []);
    columns.get(x)!.push(id);
  }
  const constraints: { left: string; right: string }[] = [];
  for (const column of columns.values()) {
    column.sort((a, b) => {
      const upper = lanes.get(a)!, lower = lanes.get(b)!;
      for (let i = 0; i < Math.min(upper.length, lower.length); i++) {
        if (upper[i] !== lower[i]) return upper[i] - lower[i];
      }
      return upper.length - lower.length || graph.node(a).y - graph.node(b).y;
    });
    // One total order per column cannot create contradictory constraints.
    // In LR layout Dagre's left/right constraints mean top/bottom.
    for (let i = 1; i < column.length; i++) {
      constraints.push({ left: column[i - 1], right: column[i] });
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
