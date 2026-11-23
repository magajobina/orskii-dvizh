import type { Story } from './engine';

export function storyAudioURLs(story: Story, resolve: (id: string) => string | undefined): string[] {
  return [...new Set(Object.values(story.nodes).flatMap(node => {
    const url = node.type === 'text' && node.audio ? resolve(node.audio) : undefined;
    return url ? [url] : [];
  }))];
}

// Keep the preloaded elements themselves: playback must not create a cold element.
export class AudioPool {
  private sounds = new Map<string, HTMLAudioElement>();
  private create: (url: string) => HTMLAudioElement;

  constructor(create: (url: string) => HTMLAudioElement = url => new Audio(url)) {
    this.create = create;
  }

  get(url: string): HTMLAudioElement {
    let sound = this.sounds.get(url);
    if (!sound) {
      sound = this.create(url);
      sound.preload = 'auto';
      this.sounds.set(url, sound);
      sound.load();
    }
    return sound;
  }

  preload(urls: string[]) {
    urls.forEach(url => this.get(url));
  }

  dispose() {
    for (const sound of this.sounds.values()) {
      sound.pause();
      sound.removeAttribute('src');
      sound.load();
    }
    this.sounds.clear();
  }
}
