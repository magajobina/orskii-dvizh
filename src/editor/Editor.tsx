import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, MarkerType, SelectionMode, useNodesState, useEdgesState } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { Connection, Edge, ReactFlowInstance } from '@xyflow/react';
import type { Node as StoryNode } from '../engine/engine';
import source from '../content/story.json';
import { imageAssets } from '../content/assets';
import { useLibraryRevision, watchLibrary } from './library';
import { FlowCard } from './FlowCard';
import type { StoryFlowNode } from './FlowCard';
import { Gallery } from './Gallery';
import { Inspector } from './Inspector';
import { autoLayout, ensureLayout } from './layout';
import { insertBefore } from './insert';
import { createCameraMemory } from './camera';
import { connect, contextImage, historyReducer, kindNames, makeClip, outgoing, parseDocument, pasteClip, removeNodes, renameNode, validateStory } from './model';
import type { Clip, Document, Point } from './model';
import '@xyflow/react/style.css';
import './editor.css';

const nodeTypes = { story: FlowCard };
const DRAFT_KEY = 'orsk.editor.draft.v1';
type Backup = { id: string; label: string; createdAt: string; nodes: number; broken?: boolean };
type Draft = { savedAt: string; document: Document };

async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/__editor/${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Orsk-Editor': '1' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Не удалось выполнить команду.');
  return result as T;
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const dateLabel = (iso: string) => iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tbilisi' }) : '—';
const token = () => crypto.randomUUID().slice(0, 8);

export default function Editor() {
  const libraryRevision = useLibraryRevision();
  useEffect(watchLibrary, []);
  const initial = useMemo(() => ensureLayout(parseDocument(source)), []);
  const [history, dispatch] = useReducer(historyReducer, { past: [], present: initial, future: [] });
  const doc = history.present;
  const docRef = useRef(doc); docRef.current = doc;
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flow = useRef<ReactFlowInstance<StoryFlowNode, Edge> | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const clip = useRef<Clip | null>(null);
  const revision = useRef('');
  const saved = useRef(JSON.stringify(initial));
  const loadedView = useRef(false);
  const [cameraMemory] = useState(() => {
    try { return createCameraMemory(localStorage); } catch { return createCameraMemory(); }
  });
  const [flowReady, setFlowReady] = useState(false);
  const cameraReady = useRef(false);
  const cameraRequest = useRef(0);
  const startupCamera = useRef(true);
  const pendingFocus = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string>();
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);
  const [query, setQuery] = useState('');
  const [openStoryRequest, setOpenStoryRequest] = useState(0);
  const [outlineWidth, setOutlineWidth] = useState(() => {
    try { return Math.max(170, Math.min(600, Number(localStorage.getItem('orsk.editor.outline-width')) || 210)); } catch { return 210; }
  });
  const resizeOrigin = useRef<{ x: number; width: number } | null>(null);
  const [resizingOutline, setResizingOutline] = useState(false);
  useEffect(() => { try { localStorage.setItem('orsk.editor.outline-width', String(outlineWidth)); } catch { /* Width is optional. */ } }, [outlineWidth]);
  const clampOutline = (width: number) => Math.max(170, Math.min(600, window.innerWidth - 650, width));
  const [activeChapter, setActiveChapter] = useState(() => {
    const remembered = cameraMemory.activeChapter();
    return remembered === '' || initial.story.chapters.some(chapter => chapter.id === remembered) ? remembered! : initial.story.chapters[0]?.id ?? '';
  });
  const activeChapterRef = useRef(activeChapter);
  const [message, setMessage] = useState('Загружаю проект…');
  const [draftStatus, setDraftStatus] = useState('');
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [gallery, setGallery] = useState<{ current?: string; pick?: (id: string) => void; kind?: 'image' | 'audio' } | null>(null);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [backupLabel, setBackupLabel] = useState('');
  const issues = useMemo(() => validateStory(doc.story, Object.keys(imageAssets)), [doc.story, libraryRevision]);
  const errors = issues.filter(i => i.severity === 'error');
  const dirty = JSON.stringify(doc) !== saved.current;

  const notify = (error: unknown) => setMessage(error instanceof Error ? error.message : String(error));
  function commit(next: Document, group?: string) { docRef.current = next; dispatch({ type: 'edit', document: next, group }); }
  function edit(fn: (document: Document) => void, group?: string) {
    try { const next = structuredClone(docRef.current); fn(next); commit(next, group); } catch (error) { notify(error); }
  }
  function rememberCamera() {
    if (cameraReady.current && flow.current) cameraMemory.remember(activeChapterRef.current, flow.current.getViewport());
  }
  async function restoreCamera(chapter: string, focusId?: string) {
    const instance = flow.current;
    if (!instance) return;
    const request = ++cameraRequest.current;
    cameraReady.current = false;
    const document = docRef.current;
    const remembered = cameraMemory.view(chapter);
    const entry = focusId ?? document.story.chapters.find(item => item.id === chapter)?.entry;
    const point = entry ? document.layout.positions[entry] : undefined;
    let changed: boolean;
    if (!focusId && remembered) changed = await instance.setViewport(remembered);
    else if (!focusId && startupCamera.current && loadedView.current) changed = await instance.setViewport(document.layout.viewport);
    else if (point) changed = await instance.setCenter(point.x + 125, point.y + 85, { zoom: .9 });
    else changed = await instance.setViewport({ x: 60, y: 60, zoom: .8 });
    if (request !== cameraRequest.current || chapter !== activeChapterRef.current) return;
    startupCamera.current = false;
    cameraReady.current = true;
    if (changed) cameraMemory.remember(chapter, instance.getViewport());
  }
  function openChapter(chapter: string, focusId?: string) {
    if (chapter === activeChapterRef.current) {
      if (focusId) void restoreCamera(chapter, focusId);
      return;
    }
    rememberCamera();
    ++cameraRequest.current;
    cameraReady.current = false;
    pendingFocus.current = focusId;
    activeChapterRef.current = chapter;
    cameraMemory.activate(chapter);
    setSelected([]); setPrimary(undefined); setSelectedEdges([]);
    setActiveChapter(chapter);
  }
  function focus(id: string) {
    const document = docRef.current;
    if (!document.story.nodes[id]) return;
    openChapter(document.story.nodes[id].chapterId ?? '', id);
    setPrimary(id); setSelected([id]);
    setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id })));
  }

  useEffect(() => {
    if (loading) return;
    if (activeChapter && !doc.story.chapters.some(chapter => chapter.id === activeChapter)) openChapter(doc.story.chapters[0]?.id ?? '');
  }, [activeChapter, doc.story.chapters, loading]);

  // Restore only on entering a chapter, never on text edits, undo or layout changes.
  useEffect(() => {
    if (loading || !flowReady) return;
    const frame = requestAnimationFrame(() => {
      const id = pendingFocus.current; pendingFocus.current = undefined;
      void restoreCamera(activeChapter, id);
    });
    return () => { cancelAnimationFrame(frame); ++cameraRequest.current; };
  }, [activeChapter, loading, flowReady]);

  useEffect(() => {
    const flush = () => rememberCamera();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); };
  }, []);

  useEffect(() => {
    const invalid = new Set(issues.filter(i => i.severity === 'error').map(i => i.nodeId));
    const visible = Object.entries(doc.story.nodes).filter(([, node]) => (node.chapterId ?? '') === activeChapter);
    const visibleIds = new Set(visible.map(([id]) => id));
    const external = [...new Set(visible.flatMap(([, node]) => outgoing(node).map(e => e.target)).filter(id => doc.story.nodes[id] && !visibleIds.has(id)))];
    const maxX = Math.max(0, ...visible.map(([id]) => doc.layout.positions[id]?.x ?? 0)) + 390;
    const minY = Math.min(0, ...visible.map(([id]) => doc.layout.positions[id]?.y ?? 0));
    setNodes(previous => {
      const selection = new Set(previous.filter(node => node.selected).map(node => node.id));
      const existing = new Map(previous.map(node => [node.id, node]));
      const local: StoryFlowNode[] = visible.map(([id, node]) => {
        const old = existing.get(id);
        const position = doc.layout.positions[id] ?? { x: 0, y: 0 };
        const entry = id === doc.story.entry;
        const hasError = invalid.has(id);
        if (old && old.position.x === position.x && old.position.y === position.y && old.data.entry === entry && old.data.invalid === hasError && JSON.stringify(old.data.node) === JSON.stringify(node)) return old;
        return { id, type: 'story', position, selected: selection.has(id), data: { node, entry, invalid: hasError } };
      });
      return [...local, ...external.map((id, index): StoryFlowNode => ({ id: `@external:${id}`, type: 'story', position: { x: maxX, y: minY + index * 160 }, draggable: false, data: { node: doc.story.nodes[id], entry: false, invalid: false, external: id, chapterTitle: doc.story.chapters.find(chapter => chapter.id === doc.story.nodes[id].chapterId)?.title } }))];
    });
    setEdges(previous => {
      const selection = new Set(previous.filter(edge => edge.selected).map(edge => edge.id));
      return visible.flatMap(([source, node]) => outgoing(node).filter(e => doc.story.nodes[e.target]).map(e => {
        const id = `${source}::${e.handle}`;
        return { id, source, sourceHandle: e.handle, target: visibleIds.has(e.target) ? e.target : `@external:${e.target}`, targetHandle: 'in', selected: selection.has(id), type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: node.type === 'choice' ? '#b5a36e' : '#687f82', strokeWidth: 1.5 } };
      }));
    });
  }, [doc.story, doc.layout.positions, activeChapter, issues, setNodes, setEdges]);

  useEffect(() => {
    let cancelled = false;
    api<{ document: Document; revision: string }>('project').then(project => {
      if (cancelled) return;
      const document = ensureLayout(parseDocument(project.document));
      loadedView.current = Object.keys(project.document.layout.positions).length > 0;
      revision.current = project.revision; saved.current = JSON.stringify(document); docRef.current = document;
      dispatch({ type: 'reset', document });
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw);
          const recovered = ensureLayout(parseDocument(draft.document));
          if (JSON.stringify(recovered) !== JSON.stringify(document)) setPendingDraft({ savedAt: draft.savedAt, document: recovered });
        }
      } catch { setDraftStatus('Не удалось прочитать прежний черновик.'); }
      setLoading(false); setMessage('Проект открыт.');

    }).catch(error => { if (!cancelled) { setLoading(false); notify(error); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading || pendingDraft) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), document: doc })); setDraftStatus('Черновик сохранён в браузере'); }
      catch { setDraftStatus('Хранилище браузера недоступно — сохраняйте файл или экспортируйте JSON'); }
    }, 400);
    return () => clearTimeout(timer);
  }, [doc, loading, pendingDraft]);

  async function save() {
    if (busy || loading) return;
    const document = docRef.current;
    const errors = validateStory(document.story, Object.keys(imageAssets)).filter(i => i.severity === 'error');
    if (errors.length) { setMessage(`Сначала исправьте ошибки: ${errors.length}. Они перечислены в панели «Проверка».`); return; }
    setBusy(true);
    try {
      const result = await api<{ revision: string }>('project', 'PUT', { document, revision: revision.current });
      revision.current = result.revision; saved.current = JSON.stringify(document);
      setMessage('Сюжет и схема сохранены в файлы проекта. Предыдущая версия — в бэкапах.');
    } catch (error) { notify(error); } finally { setBusy(false); }
  }
  async function refreshBackups() { try { setBackups(await api<Backup[]>('backups')); } catch (error) { notify(error); } }
  async function createBackup() {
    setBusy(true);
    try { await api('backups', 'POST', { document: docRef.current, label: backupLabel || 'Ручная копия' }); setBackupLabel(''); await refreshBackups(); setMessage('Бэкап всего сюжета и схемы создан.'); }
    catch (error) { notify(error); } finally { setBusy(false); }
  }
  async function replaceDocument(document: Document, label: string) {
    setBusy(true);
    try {
      await api('backups', 'POST', { document: docRef.current, label: `Перед ${label}` });
      const restored = ensureLayout(parseDocument(document));
      commit(restored); setSelected([]); setPrimary(undefined); setPendingDraft(null);
      // Keep the current camera when opening a backup or import.
      setMessage('Копия открыта в редакторе. Проверьте её и нажмите «Сохранить в проект». Отмена доступна.');
    } catch (error) { notify(error); } finally { setBusy(false); }
  }
  async function restore(id: string) {
    try { const backup = await api<{ document: Document }>(`backups/${id}`); await replaceDocument(backup.document, 'восстановлением'); await refreshBackups(); }
    catch (error) { notify(error); }
  }
  function copySelection(cut = false) {
    if (!selected.length) return;
    clip.current = makeClip(docRef.current, selected);
    void navigator.clipboard?.writeText(JSON.stringify(clip.current)).catch(() => {});
    if (cut) removeSelection();
    else setMessage(`Скопировано блоков: ${selected.length}.`);
  }
  function paste(value: Clip) {
    try {
      const pasted = pasteClip(docRef.current, value, token());
      for (const id of pasted.ids) pasted.document.story.nodes[id].chapterId = activeChapter || undefined;
      commit(pasted.document); setSelected(pasted.ids); setPrimary(pasted.ids[0]);
      requestAnimationFrame(() => { setNodes(nodes => nodes.map(node => ({ ...node, selected: pasted.ids.includes(node.id) }))); });
      setMessage(`Вставлено блоков: ${pasted.ids.length}. Внутренние связи сохранены.`);
    } catch (error) { notify(error); }
  }
  async function pasteFromClipboard() {
    try { const text = await navigator.clipboard.readText(); paste(JSON.parse(text)); }
    catch { if (clip.current) paste(clip.current); else setMessage('Сначала скопируйте блоки. Можно вставить JSON сочетанием Ctrl+V.'); }
  }
  function removeSelection() {
    try {
      let next = selected.length ? removeNodes(docRef.current, selected) : structuredClone(docRef.current);
      for (const edge of selectedEdges) if (next.story.nodes[edge.source]) next = connect(next, edge.source, edge.sourceHandle ?? 'next', '');
      commit(next); setSelected([]); setSelectedEdges([]); setPrimary(undefined);
      setMessage('Удалено. Входящие связи разорваны; их можно подключить заново или отменить удаление.');
    } catch (error) { notify(error); }
  }

  useEffect(() => {
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable=true]'));
    const key = (event: KeyboardEvent) => {
      if (loading || busy || gallery || backupsOpen) return;
      const modifier = event.ctrlKey || event.metaKey;
      const code = ({ z: 'KeyZ', y: 'KeyY', c: 'KeyC', x: 'KeyX', v: 'KeyV', a: 'KeyA', s: 'KeyS' }[event.key.toLowerCase()] ?? event.code) || event.key;
      if (modifier && code === 'KeyS') { event.preventDefault(); void save(); return; }
      if (typing(event.target)) return;
      if (modifier && code === 'KeyZ') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); }
      else if (modifier && code === 'KeyY') { event.preventDefault(); dispatch({ type: 'redo' }); }
      else if (modifier && code === 'KeyC') { event.preventDefault(); copySelection(); }
      else if (modifier && code === 'KeyX') { event.preventDefault(); copySelection(true); }
      else if (modifier && code === 'KeyV') { event.preventDefault(); void pasteFromClipboard(); }
      else if (modifier && code === 'KeyA') { event.preventDefault(); const ids = Object.keys(docRef.current.story.nodes).filter(id => (docRef.current.story.nodes[id].chapterId ?? '') === activeChapter); setSelected(ids); setNodes(nodes => nodes.map(node => ({ ...node, selected: ids.includes(node.id) }))); }
      else if (code === 'Delete' || code === 'Backspace') { event.preventDefault(); removeSelection(); }
    };
    const pasteEvent = (event: ClipboardEvent) => {
      if (typing(event.target) || !root.current?.contains(document.activeElement)) return;
      const text = event.clipboardData?.getData('text/plain');
      if (!text || text.length > 2 * 1024 * 1024) return;
      try { const value = JSON.parse(text); if (value.kind === 'orsk-nodes') { event.preventDefault(); paste(value); } } catch { /* Ordinary text belongs in input fields. */ }
    };
    window.addEventListener('keydown', key, true); window.addEventListener('paste', pasteEvent);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('paste', pasteEvent); };
  });

  function add(type: StoryNode['type'], point?: Point) {
    let document = structuredClone(docRef.current);
    const id = `${type}-${token()}`;
    const end = Object.keys(document.story.nodes).find(key => document.story.nodes[key].type === 'end') ?? '';
    const node: StoryNode = type === 'text' ? { type, text: 'Новая реплика', next: end }
      : type === 'scene' ? { type, asset: document.story.cover, next: end }
      : type === 'jump' ? { type, next: end }
      : type === 'choice' ? { type, options: [{ id: `${id}-answer-1`, text: 'Первый ответ', next: end }, { id: `${id}-answer-2`, text: 'Второй ответ', next: end }] }
      : { type: 'end' };
    const rect = canvas.current?.getBoundingClientRect();
    const anchor = !point && selected.length === 1 ? selected[0] : undefined;
    if (anchor && document.story.nodes[anchor] && (node.type === 'text' || node.type === 'scene')) {
      document = insertBefore(document, anchor, id, node);
    } else {
      document.story.nodes[id] = node;
      node.chapterId = activeChapter || undefined;
      document.layout.positions[id] = point ?? flow.current?.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) * .4, y: (rect?.top ?? 0) + 160 }) ?? { x: 100, y: 100 };
    }
    commit(document); setPrimary(id); setSelected([id]);
    requestAnimationFrame(() => setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id }))));
  }
  const initializeFlow = useCallback((instance: ReactFlowInstance<StoryFlowNode, Edge>) => { flow.current = instance; setFlowReady(true); }, []);
  function onConnect(connection: Connection) {
    try { commit(connect(docRef.current, connection.source, connection.sourceHandle ?? 'next', connection.target.replace(/^@external:/, ''))); }
    catch (error) { notify(error); }
  }
  const onSelectionChange = useCallback(({ nodes, edges }: { nodes: StoryFlowNode[]; edges: Edge[] }) => {
    const ids = nodes.filter(node => !node.data.external).map(node => node.id);
    setSelected(previous => previous.join('|') === ids.join('|') ? previous : ids);
    setSelectedEdges(edges);
  }, []);
  function play(id: string) {
    try {
      localStorage.setItem('orsk.editor.playtest', JSON.stringify(docRef.current.story));
      const url = new URL(location.href); url.search = '';
      url.searchParams.set('playtest', id); url.searchParams.set('asset', contextImage(docRef.current.story, id));
      window.open(url, '_blank', 'noopener');
    } catch (error) { notify(error); }
  }
  const filtered = Object.entries(doc.story.nodes).filter(([, node]) => Boolean(query) || (node.chapterId ?? '') === activeChapter).filter(([id, node]) => `${id} ${node.type === 'text' ? node.text : node.type === 'scene' ? node.asset : node.type === 'choice' ? node.options.map(o => o.text).join(' ') : ''}`.toLowerCase().includes(query.toLowerCase()));
  const primaryId = primary && doc.story.nodes[primary] ? primary : selected.find(id => doc.story.nodes[id]);

  return <div className={`story-editor${resizingOutline ? ' resizing-outline' : ''}`} style={{ '--outline-width': `${outlineWidth}px` } as CSSProperties} ref={root} tabIndex={-1}
    onPointerDownCapture={() => window.dispatchEvent(new Event('orsk-editor-flush'))}>
    <header className="editor-header"><div><h1>Редактор сюжета</h1><span>{Object.keys(doc.story.nodes).length} блоков · {dirty ? 'Есть изменения' : 'Файл проекта открыт'}</span></div>
      <div className="editor-file-actions"><a href="/" target="_blank" rel="noreferrer">Игра</a><button onClick={() => setGallery({})}>Библиотека</button><button disabled={loading || busy} onClick={() => { setBackupsOpen(!backupsOpen); void refreshBackups(); }}>Бэкапы</button><button disabled={loading} onClick={() => download('orsk-story.json', docRef.current.story)}>Экспорт JSON</button><button disabled={loading || busy} onClick={() => file.current?.click()}>Импорт</button><button className="save-project" disabled={loading || busy || errors.length > 0} onClick={() => void save()}>{busy ? 'Сохраняю…' : 'Сохранить в проект'}</button></div>
    </header>
    <div className="editor-toolbar"><select className="compact-chapter-select" aria-label="Текущая глава" value={activeChapter} onChange={event => openChapter(event.target.value)}><option value="">Нераспределённые</option>{doc.story.chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select>
      <button title="Создать главу, изменить названия, картинки и порядок глав в стартовом меню" onClick={() => setOpenStoryRequest(request => request + 1)}>Главы и меню</button>
      <div className="editor-add-buttons">{(Object.keys(kindNames) as StoryNode['type'][]).filter(type => type !== 'jump').map(type => <button key={type} draggable onDragStart={event => event.dataTransfer.setData('application/orsk-node', type)} onClick={() => add(type)}>+ {kindNames[type]}</button>)}</div>
      <div className="editor-tools"><button title="Отменить (Ctrl+Z)" aria-label="Отменить" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}>↶</button><button title="Повторить (Ctrl+Y)" aria-label="Повторить" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}>↷</button><button disabled={!selected.length} onClick={() => copySelection()}>Копировать</button><button disabled={!selected.length} onClick={() => copySelection(true)}>Вырезать</button><button onClick={() => void pasteFromClipboard()}>Вставить</button><button disabled={!selected.length && !selectedEdges.length} onClick={removeSelection}>Удалить</button><button title="Автоматически расположить блоки текущей главы; сюжет не изменится" onClick={() => { commit(autoLayout(docRef.current, activeChapter)); setMessage('Глава разложена автоматически. Изменение можно отменить.'); }}>Разложить</button><button onClick={() => { void flow.current?.fitView({ padding: 60, duration: 200 }); }}>Вся схема</button><button title="Найти начальный блок игры на схеме; это не запуск прохождения" onClick={() => focus(doc.story.entry)}>Старт</button></div>
    </div>
    {pendingDraft && <div className="draft-banner">Найден черновик от {dateLabel(pendingDraft.savedAt)}.<button onClick={() => { commit(pendingDraft.document); setPendingDraft(null);  }}>Восстановить черновик</button><button onClick={() => { setPendingDraft(null); localStorage.removeItem(DRAFT_KEY); }}>Оставить файл проекта</button></div>}
    <div className="editor-workspace">
      <aside className="editor-outline"><label className="chapter-scope-label">Глава<select aria-label="Глава на схеме" value={activeChapter} onChange={e => openChapter(e.target.value)}><option value="">Нераспределённые</option>{doc.story.chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><input type="search" placeholder="ID или текст блока" aria-label="Найти блок" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && filtered[0]) focus(filtered[0][0]); }} />
        {!query && <><h2>Главы</h2>{doc.story.chapters.map(chapter => <button className="outline-chapter" key={chapter.id} onClick={() => openChapter(chapter.id)}>{chapter.title}</button>)}</>}
        <h2>{query ? `Найдено: ${filtered.length}` : 'Блоки'}</h2><div className="outline-results">{filtered.slice(0, 100).map(([id, node]) => <button key={id} title={node.type === 'text' ? node.text : node.type === 'scene' ? node.asset : node.type === 'choice' ? node.options.map(option => option.text).join(' / ') : kindNames[node.type]} className={id === primaryId ? 'active' : ''} onClick={() => focus(id)}><code>{id}</code><span>{node.type === 'text' ? node.text : kindNames[node.type]}</span></button>)}{filtered.length > 100 && <p className="editor-muted">Показаны первые 100. Уточните поиск.</p>}</div>
      </aside>
      <div className="outline-resizer" role="separator" aria-label="Ширина проводника" aria-orientation="vertical" aria-valuemin={170} aria-valuemax={600} aria-valuenow={outlineWidth} tabIndex={0}
        title="Потяните, чтобы изменить ширину проводника; стрелки влево и вправо — точная настройка"
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); resizeOrigin.current = { x: event.clientX, width: event.currentTarget.previousElementSibling?.getBoundingClientRect().width ?? outlineWidth }; setResizingOutline(true); }}
        onPointerMove={event => { if (resizeOrigin.current) setOutlineWidth(clampOutline(resizeOrigin.current.width + event.clientX - resizeOrigin.current.x)); }}
        onPointerUp={event => { resizeOrigin.current = null; setResizingOutline(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onLostPointerCapture={() => { resizeOrigin.current = null; setResizingOutline(false); }}
        onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setOutlineWidth(width => clampOutline(width + (event.key === 'ArrowRight' ? 20 : -20))); } }} />
      <div className="editor-canvas" ref={canvas} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={e => { e.preventDefault(); const type = e.dataTransfer.getData('application/orsk-node') as StoryNode['type']; if (type in kindNames) add(type, flow.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
        <ReactFlow<StoryFlowNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onReconnect={(edge, connection) => { try { const cleared = connect(docRef.current, edge.source, edge.sourceHandle ?? 'next', ''); commit(connect(cleared, connection.source, connection.sourceHandle ?? 'next', connection.target.replace(/^@external:/, ''))); } catch (error) { notify(error); } }}
          onInit={initializeFlow} onSelectionChange={onSelectionChange} onNodeClick={(_, node) => { if (node.data.external) focus(node.data.external); else setPrimary(node.id); }}
          onNodeDragStop={() => { const positions = Object.fromEntries((flow.current?.getNodes() ?? []).map(node => [node.id, node.position])); edit(doc => { doc.layout.positions = { ...doc.layout.positions, ...Object.fromEntries(Object.entries(positions).filter(([id]) => doc.story.nodes[id])) }; }); }}
          onSelectionDragStop={() => { const positions = Object.fromEntries((flow.current?.getNodes() ?? []).map(node => [node.id, node.position])); edit(doc => { doc.layout.positions = { ...doc.layout.positions, ...Object.fromEntries(Object.entries(positions).filter(([id]) => doc.story.nodes[id])) }; }); }}
          onMoveEnd={(_, viewport) => { if (cameraReady.current) cameraMemory.remember(activeChapterRef.current, viewport); }}
          panOnScroll selectionOnDrag panOnDrag={[1, 2]} zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} zoomActivationKeyCode={['Control', 'Meta']} panActivationKeyCode="Space" selectionMode={SelectionMode.Partial} multiSelectionKeyCode={['Control', 'Meta', 'Shift']} deleteKeyCode={null}
          minZoom={0.025} maxZoom={2.5} defaultViewport={cameraMemory.view(activeChapter) ?? doc.layout.viewport} onlyRenderVisibleElements>
          <Background color="#354045" gap={24} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={node => (node.data.node as StoryNode).type === 'choice' ? '#b5a36e' : '#648b89'} />
        </ReactFlow>
        {loading && <div className="editor-loading">Загружаю сюжет…</div>}
      </div>
      <Inspector openStoryRequest={openStoryRequest} document={doc} selected={primaryId} selectedCount={selected.length} issues={issues} edit={edit} endGroup={() => dispatch({ type: 'end-group' })} focus={focus} browse={(current, pick, kind = 'image') => setGallery({ current, pick, kind })} play={play}
        rename={(id, next) => { try { commit(renameNode(docRef.current, id, next)); setSelected([next]); setPrimary(next); } catch (error) { notify(error); } }} />
    </div>
    <footer className="editor-status"><span role="status">{message}</span><span>{errors.length ? `${errors.length} ошибок · ` : ''}{draftStatus}</span><small>Пробел + drag: холст · Ctrl + колесо: масштаб · Shift: несколько блоков</small></footer>
    <input type="file" accept="application/json,.json" hidden ref={file} onChange={async event => { const selected = event.target.files?.[0]; event.target.value = ''; if (!selected) return; try { if (selected.size > 8 * 1024 * 1024) throw Error('Файл больше 8 МиБ.'); await replaceDocument(parseDocument(JSON.parse(await selected.text())), 'импортом'); } catch (error) { notify(error); } }} />
    {gallery && <Gallery story={doc.story} current={gallery.current} kind={gallery.kind} onPick={gallery.pick ? id => { gallery.pick!(id); setGallery(null); } : undefined} onClose={() => setGallery(null)} />}
    {backupsOpen && <aside className="backup-drawer" aria-label="Резервные копии"><div className="editor-dialog-title"><h2>Бэкапы сюжета</h2><button aria-label="Закрыть бэкапы" onClick={() => setBackupsOpen(false)}>×</button></div><p>Весь сюжет, главы, связи и расположение блоков. Перед сохранением и восстановлением создаётся автоматическая копия.</p><input placeholder="Название копии" aria-label="Название бэкапа" value={backupLabel} onChange={e => setBackupLabel(e.target.value)} /><button disabled={busy} className="wide-button" onClick={() => void createBackup()}>Создать бэкап</button><button className="wide-button" onClick={() => download(`orsk-backup-${Date.now()}.json`, { format: 'orsk-story-backup', version: 1, createdAt: new Date().toISOString(), label: backupLabel || 'Экспорт', document: docRef.current })}>Скачать полную копию</button><div className="backup-list">{backups.map(backup => <article key={backup.id}><h3>{backup.label}</h3><p>{dateLabel(backup.createdAt)} · {backup.nodes} блоков</p><div><button disabled={busy || backup.broken} onClick={() => void restore(backup.id)}>Восстановить</button><button disabled={backup.broken} onClick={async () => { try { download(backup.id, await api(`backups/${backup.id}`)); } catch (error) { notify(error); } }}>Скачать</button></div></article>)}{!backups.length && <p>Пока нет копий.</p>}</div></aside>}
  </div>;
}
