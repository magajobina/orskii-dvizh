import type { Story } from './engine';

export function storyImageURLs(story: Story, current: string, resolve: (id: string) => string | undefined): string[] {
  const urls = new Set<string>();
  const visited = new Set<string>();
  function add(asset: string) { const url = resolve(asset); if (url) urls.add(url); }
  function walk(root: string) {
    const queue = [root];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      if (visited.has(id)) continue;
      visited.add(id);
      const node = story.nodes[id];
      if (!node) continue;
      if (node.type === 'scene') add(node.asset);
      if (node.type === 'choice') queue.push(...node.options.map(option => option.next));
      else if ('next' in node) queue.push(node.next);
    }
  }
  // Nearby scenes (including alternative answers) precede the rest of the story.
  walk(current);
  for (const chapter of story.chapters) walk(chapter.entry);
  for (const id of Object.keys(story.nodes)) walk(id);
  add(story.cover);
  for (const chapter of story.chapters) add(chapter.image);
  return [...urls];
}

type Defer = (job: () => void) => () => void;
const defer: Defer = job => {
  const timer = setTimeout(job, 150);
  return () => clearTimeout(timer);
};

export class ImagePreloader {
  private completed = new Set<string>();
  private retained = new Map<string, HTMLImageElement>();
  private warm = new Set<string>();
  private attempts = new Map<string, number>();
  private running = new Map<HTMLImageElement, string>();
  private pending: string[] = [];
  private active = false;
  private scheduled?: () => void;
  private create: () => HTMLImageElement;
  private defer: Defer;

  constructor(create: () => HTMLImageElement = () => new Image(), schedule: Defer = defer) {
    this.create = create;
    this.defer = schedule;
  }

  preload(urls: string[]) {
    this.warm = new Set(urls.slice(0, 6));
    for (const [url, image] of this.retained) if (!this.warm.has(url)) {
      image.removeAttribute('src'); this.retained.delete(url);
    }
    const loading = new Set(this.running.values());
    this.pending = [...new Set(urls)].filter(url => !loading.has(url) && (this.attempts.get(url) ?? 0) < 3 &&
      (!this.completed.has(url) || (this.warm.has(url) && !this.retained.has(url))));
    this.active = true;
    this.schedule();
  }

  private schedule() {
    if (!this.active || this.scheduled || this.running.size >= 2 || !this.pending.length) return;
    this.scheduled = this.defer(() => {
      this.scheduled = undefined;
      while (this.active && this.running.size < 2 && this.pending.length) this.load(this.pending.shift()!);
    });
  }

  private load(url: string) {
    const image = this.create();
    image.fetchPriority = this.warm.has(url) ? 'high' : 'low';
    image.decoding = 'async';
    this.running.set(image, url);
    this.attempts.set(url, (this.attempts.get(url) ?? 0) + 1);
    const finish = (success: boolean) => {
      if (!this.running.has(image)) return;
      if (success) { this.completed.add(url); this.attempts.delete(url); }
      this.running.delete(image);
      image.onload = image.onerror = null;
      // Keep a small lookahead decoded; release distant images instead of retaining the whole game.
      if (success && this.warm.has(url)) this.retained.set(url, image);
      else image.removeAttribute('src');
      if (!success && (this.attempts.get(url) ?? 0) < 3) this.pending.push(url);
      this.schedule();
    };
    image.onload = () => {
      if (this.warm.has(url) && image.decode) void image.decode().then(() => finish(true), () => finish(true));
      else finish(true);
    };
    image.onerror = () => finish(false);
    image.src = url;
  }

  pause() {
    this.active = false;
    this.scheduled?.();
    this.scheduled = undefined;
  }

  dispose() {
    this.pause();
    for (const image of this.running.keys()) {
      image.onload = image.onerror = null;
      image.removeAttribute('src');
    }
    this.running.clear();
    for (const image of this.retained.values()) image.removeAttribute('src');
    this.retained.clear(); this.warm.clear(); this.attempts.clear();
    this.pending = [];
    this.completed.clear();
  }
}
