export type Option = { id: string; text: string; next: string; once?: boolean };
export type Shake = { variant: 'tremble' | 'impact' | 'sway'; durationMs: number };
export type Node = (
  | { type: 'text'; text: string; next: string; audio?: string; delayMs?: number }
  | { type: 'scene'; asset: string; next: string; shake?: Shake }
  | { type: 'jump'; next: string }
  | { type: 'choice'; options: Option[]; prompt?: string }
  | { type: 'end' }) & { chapterId?: string };
export type Chapter = { id: string; title: string; entry: string; image: string };
export type Story = { version: number; entry: string; cover: string; chapters: Chapter[]; nodes: Record<string, Node> };
export type Frame = { current: string; scene: string; hiddenOptions: Record<string, string[]>; chapterId?: string; sceneNode?: string; sceneEvent?: number };
export type State = Frame & { history: Frame[] };

function settle(story: Story, initial: Frame): Frame {
  const frame = { ...initial };
  for (let count = 0; count < 1000; count++) {
    const node = story.nodes[frame.current];
    if (!node) throw new Error(`Unknown story node: ${frame.current}`);
    if (node.chapterId) frame.chapterId = node.chapterId;
    if (node.type === 'scene') {
      frame.scene = node.asset;
      frame.sceneNode = frame.current;
      frame.sceneEvent = (frame.sceneEvent ?? 0) + 1;
    }
    if (node.type !== 'scene' && node.type !== 'jump') return frame;
    frame.current = node.next;
  }
  throw new Error('Automatic story loop');
}

export function start(story: Story, entry = story.entry, scene = story.cover): State {
  return { ...settle(story, { current: entry, scene, hiddenOptions: {} }), history: [] };
}

function move(story: Story, state: State, next: string, hiddenOptions = state.hiddenOptions): State {
  const { history, ...previous } = state;
  const frame = settle(story, { ...previous, current: next, hiddenOptions });
  return { ...frame, history: [...history, previous] };
}

export function availableOptions(story: Story, state: State): Option[] {
  const node = story.nodes[state.current];
  const hidden = state.hiddenOptions[state.current] ?? [];
  return node.type === 'choice' ? node.options.filter(option => !hidden.includes(option.id)) : [];
}

export function advance(story: Story, state: State): State {
  const node = story.nodes[state.current];
  return node.type === 'text' ? move(story, state, node.next) : state;
}

export function choose(story: Story, state: State, id: string): State {
  const node = story.nodes[state.current];
  if (node.type !== 'choice') return state;
  const option = availableOptions(story, state).find(option => option.id === id);
  if (!option) return state;
  const hiddenOptions = option.once ? {
    ...state.hiddenOptions,
    [state.current]: [...(state.hiddenOptions[state.current] ?? []), option.id],
  } : state.hiddenOptions;
  return move(story, state, option.next, hiddenOptions);
}

export function back(state: State): State {
  const frame = state.history.at(-1);
  return frame ? { ...frame, history: state.history.slice(0, -1) } : state;
}
