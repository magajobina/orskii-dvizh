import { useSyncExternalStore } from 'react';
import { imageAssets } from '../content/assets';
import type { Asset } from '../content/assets';
import { audioAssets } from '../content/audio';
import type { AudioAsset } from '../content/audio';

let revision = 0;
let requestNumber = 0;
const listeners = new Set<() => void>();
export const useLibraryRevision = () => useSyncExternalStore(
  listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => revision,
);

export async function refreshLibrary() {
  const request = ++requestNumber;
  const response = await fetch('/__editor/media');
  const data = await response.json() as { images: Record<string, Asset>; audio: Record<string, AudioAsset>; error?: string };
  if (!response.ok) throw Error(data.error ?? 'Не удалось обновить библиотеку.');
  if (request !== requestNumber) return;
  for (const id of Object.keys(imageAssets)) delete imageAssets[id];
  Object.assign(imageAssets, data.images);
  for (const id of Object.keys(audioAssets)) delete audioAssets[id];
  Object.assign(audioAssets, data.audio);
  revision++;
  listeners.forEach(listener => listener());
}

export function watchLibrary() {
  const refresh = () => { void refreshLibrary().catch(() => {}); };
  refresh();
  import.meta.hot?.on('orsk-media-changed', refresh);
  return () => { import.meta.hot?.off('orsk-media-changed', refresh); };
}

export const mediaAccept = {
  image: '.png,.jpg,.jpeg,.gif,.webp',
  audio: '.mp3,.wav,.ogg,.m4a,.aac,.flac',
};

export async function removeMedia(kind: 'image' | 'audio', id: string): Promise<string> {
  const response = await fetch('/__editor/media', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Orsk-Editor': '1' }, body: JSON.stringify({ kind, id }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'Не удалось удалить файл.');
  await refreshLibrary();
  return result.ticket;
}

export async function restoreMedia(ticket: string) {
  const response = await fetch('/__editor/media/restore', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Orsk-Editor': '1' }, body: JSON.stringify({ ticket }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'Не удалось восстановить файл.');
  await refreshLibrary();
}

export type MediaTrash = { count: number; bytes: number };
export async function mediaTrash(): Promise<MediaTrash> {
  const response = await fetch('/__editor/media/trash');
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'Не удалось прочитать корзину.');
  return result;
}
export async function emptyMediaTrash(): Promise<MediaTrash> {
  const response = await fetch('/__editor/media/trash', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Orsk-Editor': '1' }, body: JSON.stringify({ confirm: true }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'Не удалось очистить корзину.');
  return result;
}

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(Error('Не удалось прочитать картинку.')); };
    image.src = url;
  });
}

export async function uploadMedia(kind: 'image' | 'audio', file: File): Promise<string> {
  if (!file.size || file.size > 64 * 1024 * 1024) throw Error('Нужен непустой файл размером до 64 МиБ.');
  const query = new URLSearchParams({ kind, name: file.name });
  if (kind === 'image') {
    const size = await imageSize(file);
    query.set('width', String(size.width)); query.set('height', String(size.height));
  }
  const response = await fetch(`/__editor/media?${query}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Orsk-Editor': '1' }, body: file,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'Не удалось добавить файл.');
  await refreshLibrary();
  return result.id as string;
}
