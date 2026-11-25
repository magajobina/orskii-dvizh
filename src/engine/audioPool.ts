import type { Story } from './engine';

export function storyAudioURLs(story: Story, resolve: (id: string) => string | undefined, current?: string): string[] {
  const urls = new Set<string>(), visited = new Set<string>();
  const roots = [current ?? story.entry, ...(story.chapters ?? []).map(chapter => chapter.entry), ...Object.keys(story.nodes)];
  for (const root of roots) {
    const queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]; if (visited.has(id)) continue; visited.add(id);
      const node = story.nodes[id]; if (!node) continue;
      if (node.type === 'text' && node.audio) { const url = resolve(node.audio); if (url) urls.add(url); }
      if (node.type === 'choice') queue.push(...node.options.map(option => option.next));
      else if ('next' in node) queue.push(node.next);
    }
  }
  return [...urls];
}

type FetchBlob = (url: string, signal: AbortSignal) => Promise<Blob>;
type BlobURLs = { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };

// Explicitly download complete files. preload="auto" alone is only a browser hint.
export class AudioPool {
  private sounds = new Map<string, HTMLAudioElement>();
  private blobs = new Map<string, string>();
  private running = new Map<string, Promise<void>>();
  private controllers = new Set<AbortController>();
  private pending: string[] = [];
  private attempts = new Map<string, number>();
  private generation = 0;
  private create: (url: string) => HTMLAudioElement;
  private fetchBlob: FetchBlob;
  private blobURLs: BlobURLs;

  constructor(create = (url: string) => new Audio(url), fetchBlob: FetchBlob = async (url, signal) => {
    const response = await fetch(url, { signal, cache: 'force-cache' });
    if (!response.ok) throw Error(`Audio HTTP ${response.status}`);
    return response.blob();
  }, blobURLs: BlobURLs = URL) {
    this.create = create; this.fetchBlob = fetchBlob; this.blobURLs = blobURLs;
  }

  get(url: string): HTMLAudioElement {
    let sound = this.sounds.get(url);
    if (!sound) {
      sound = this.create(this.blobs.get(url) ?? url);
      sound.preload = 'auto'; this.sounds.set(url, sound); sound.load();
    }
    return sound;
  }

  async prepare(url: string): Promise<HTMLAudioElement> {
    const generation = this.generation;
    await this.download(url);
    if (generation !== this.generation) throw new DOMException('Audio pool disposed', 'AbortError');
    return this.get(url);
  }

  preload(urls: string[]) {
    this.pending = [...new Set(urls)].filter(url => !this.blobs.has(url) && !this.running.has(url) && (this.attempts.get(url) ?? 0) < 3);
    this.pump();
  }

  private pump() {
    while (this.running.size < 2 && this.pending.length) void this.download(this.pending.shift()!);
  }

  private download(url: string): Promise<void> {
    if (this.blobs.has(url)) return Promise.resolve();
    const existing = this.running.get(url); if (existing) return existing;
    const generation = this.generation, controller = new AbortController();
    this.controllers.add(controller);
    this.attempts.set(url, (this.attempts.get(url) ?? 0) + 1);
    const task = Promise.resolve().then(() => this.fetchBlob(url, controller.signal)).then(blob => {
      if (generation !== this.generation) return;
      const blobURL = this.blobURLs.createObjectURL(blob);
      this.blobs.set(url, blobURL);
      // A sound already requested for playback must not be restarted by background loading.
      if (!this.sounds.has(url)) this.get(url);
    }).catch(() => {
      if (generation === this.generation && !controller.signal.aborted && (this.attempts.get(url) ?? 0) < 3) this.pending.push(url);
    }).finally(() => {
      this.controllers.delete(controller);
      if (generation === this.generation) { this.running.delete(url); this.pump(); }
    });
    this.running.set(url, task);
    return task;
  }

  dispose() {
    this.generation++;
    this.controllers.forEach(controller => controller.abort()); this.controllers.clear();
    this.running.clear(); this.pending = []; this.attempts.clear();
    for (const sound of this.sounds.values()) { sound.pause(); sound.removeAttribute('src'); sound.load(); }
    this.sounds.clear();
    this.blobs.forEach(url => this.blobURLs.revokeObjectURL(url)); this.blobs.clear();
  }
}
