import registry from './audio.json';
export type AudioAsset = { file: string; title: string; source: string; license: string; author?: string };
export const audioAssets: Record<string, AudioAsset> = registry;
const files = import.meta.glob<string>('../assets/audio/*', { query: '?url', import: 'default', eager: true });
export function audioURL(id: string): string | undefined {
  const file = audioAssets[id]?.file;
  return file ? files[`../assets/audio/${file}`] : undefined;
}
