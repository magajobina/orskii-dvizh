export type GalleryAsset = { file?: string; fallback?: string };
export type GalleryPhoto = { id: string; file: string };

/** Include the whole library, including unused photos, without fallback aliases. */
export function galleryPhotos(assets: Record<string, GalleryAsset>): GalleryPhoto[] {
  const files = new Set<string>();
  return Object.entries(assets).flatMap(([id, asset]) => {
    if (!asset.file || asset.fallback || files.has(asset.file)) return [];
    files.add(asset.file);
    return [{ id, file: asset.file }];
  });
}

export function nextPhoto(index: number, direction: number, total: number): number {
  return total ? ((index + direction) % total + total) % total : -1;
}
