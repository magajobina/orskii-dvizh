import registry from './assets.json';

type Asset = { file?: string; fallback?: string; width?: number; height?: number };
const assets: Record<string, Asset> = registry;
const files = import.meta.glob<string>('../assets/illustrations/*', { query: '?url', import: 'default', eager: true });

export function imageFilename(id: string): string {
  const asset = assets[id];
  if (asset?.fallback) return `${imageFilename(asset.fallback)} (замена для ${id})`;
  return asset?.file ?? assets['main-menu'].file!;
}

export function imageURL(id: string): string {
  const asset = assets[id];
  if (asset?.fallback) return imageURL(asset.fallback);
  const file = asset?.file ?? assets['main-menu'].file;
  return files[`../assets/illustrations/${file}`];
}
