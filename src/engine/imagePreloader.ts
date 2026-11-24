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
    const loading = new Set(this.running.values());
    this.pending = [...new Set(urls)].filter(url => !this.completed.has(url) && !loading.has(url));
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
    image.fetchPriority = 'low';
    image.decoding = 'async';
    this.running.set(image, url);
    const finish = () => {
      this.completed.add(url);
      this.running.delete(image);
      image.onload = image.onerror = null;
      // Warm the browser cache without retaining every decoded image/GIF in RAM.
      image.removeAttribute('src');
      this.schedule();
    };
    image.onload = image.onerror = finish;
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
    this.pending = [];
    this.completed.clear();
  }
}
