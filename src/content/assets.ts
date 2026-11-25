import registry from './assets.json';

export type Asset = { file?: string; fallback?: string; width?: number; height?: number };
export const imageAssets: Record<string, Asset> = { ...registry };
const assets = imageAssets;
const files = import.meta.glob<string>('../assets/illustrations/*', { query: '?game-image', import: 'default', eager: true });

export function imageFilename(id: string): string {
  const asset = assets[id];
  if (asset?.fallback) return `${imageFilename(asset.fallback)} (замена для ${id})`;
  return asset?.file ?? assets['main-menu'].file!;
}

export function imageURL(id: string): string {
  const asset = assets[id];
  if (asset?.fallback) return imageURL(asset.fallback);
  const file = asset?.file ?? assets['main-menu'].file;
  const url = files[`../assets/illustrations/${file}`];
  return !url && file && import.meta.env.DEV ? `/src/assets/illustrations/${encodeURIComponent(file)}` : url;
}
