import type { Story } from '../engine/engine.ts';

export function mediaUsage(story: Story, kind: 'image' | 'audio', id: string): string[] {
  const uses: string[] = [];
  if (kind === 'image') {
    if (story.cover === id) uses.push('Обложка главного меню');
    for (const chapter of story.chapters) if (chapter.image === id) uses.push(`Обложка главы «${chapter.title}»`);
  }
  for (const [key, node] of Object.entries(story.nodes)) {
    if ((kind === 'image' && node.type === 'scene' && node.asset === id) ||
      (kind === 'audio' && node.type === 'text' && node.audio === id)) uses.push(`Блок ${key}`);
  }
  return uses;
}
