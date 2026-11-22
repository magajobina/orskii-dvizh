import type { View } from './model';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
type CameraState = { version: 1; activeChapter?: string; views: Record<string, View> };
export const CAMERA_KEY = 'orsk.editor.camera.v1';
const isView = (v: unknown): v is View => Boolean(v && typeof v === 'object'
  && Number.isFinite((v as View).x) && Number.isFinite((v as View).y)
  && Number.isFinite((v as View).zoom) && (v as View).zoom >= .025 && (v as View).zoom <= 2.5);

// Camera is workspace UI state, independent of story edits, undo and browser drafts.
export function createCameraMemory(storage?: Storage) {
  const state: CameraState = { version: 1, views: {} };
  try {
    const saved = JSON.parse(storage?.getItem(CAMERA_KEY) ?? 'null');
    if (saved?.version === 1) {
      if (typeof saved.activeChapter === 'string') state.activeChapter = saved.activeChapter;
      if (saved.views && typeof saved.views === 'object') for (const [key, view] of Object.entries(saved.views)) {
        if (key.startsWith('chapter:') && isView(view)) state.views[key] = { x: view.x, y: view.y, zoom: view.zoom };
      }
    }
  } catch { /* An unavailable store or damaged UI preference must not block editing. */ }
  const persist = () => { try { storage?.setItem(CAMERA_KEY, JSON.stringify(state)); } catch { /* Still remember for this session. */ } };
  return {
    activeChapter: () => state.activeChapter,
    view: (chapter: string): View | undefined => {
      const view = state.views[`chapter:${chapter}`];
      return view ? { ...view } : undefined;
    },
    activate(chapter: string) { state.activeChapter = chapter; persist(); },
    remember(chapter: string, view: View) {
      if (!isView(view)) return;
      state.activeChapter = chapter;
      state.views[`chapter:${chapter}`] = { ...view };
      persist();
    },
  };
}
