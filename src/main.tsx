import { lazy, StrictMode, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { advance, availableOptions, back, choose, start } from './engine/engine';
import type { Chapter, Story } from './engine/engine';
import data from './content/story.json';
import { useMedia } from './engine/useMedia';
import { useTypewriter } from './engine/useTypewriter';
import { imageURL } from './content/assets';
import { useInterfacePause } from './engine/useInterfacePause';
import aircraftDrawing from './assets/decorations/da40.png';
import propellerDrawing from './assets/decorations/propeller.png';
import PhotoGallery from './gallery/PhotoGallery';
import '@fontsource-variable/golos-text';
import '@fontsource-variable/oswald';
import './styles.css';

let story = data as Story;
const developmentParams = new URLSearchParams(location.search);
if (import.meta.env.DEV && developmentParams.has('playtest')) {
  try {
    const saved = JSON.parse(localStorage.getItem('orsk.editor.playtest') ?? 'null');
    if (saved?.version === 1 && saved.nodes && saved.chapters) story = saved as Story;
  } catch { /* Leave the regular game available. */ }
}
if (import.meta.hot && !developmentParams.has('editor')) import.meta.hot.on('orsk-story-saved', () => location.reload());
const themes = [
  { id: 'cinema', name: 'Кино' },
  { id: 'cold', name: 'Прохлада' },
  { id: 'amber', name: 'Закат' },
  { id: 'film', name: 'Плёнка' },
] as const;
type Theme = typeof themes[number]['id'];
const params = new URLSearchParams(location.search);
const requestedTheme = params.get('theme') ?? params.get('layout');

function ChapterDialog({ onSelect, onClose }: { onSelect: (chapter: Chapter) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return <dialog ref={ref} className="chapter-dialog" aria-labelledby="chapters-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="dialog-heading"><h2 id="chapters-title">Выбор главы</h2><button autoFocus aria-label="Закрыть выбор главы" onClick={() => ref.current?.close()}>×</button></div>
    <div className="chapter-list">{story.chapters.map(chapter => <button key={chapter.id} onClick={() => onSelect(chapter)}><img src={imageURL(chapter.image)} alt="" /><span>{chapter.title}</span></button>)}</div>
  </dialog>;
}

function App() {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(themes.some(item => item.id === requestedTheme) ? requestedTheme as Theme : 'cinema');
  const [playing, setPlaying] = useState(Boolean(params.get('scene')) || (import.meta.env.DEV && params.has('playtest')));
  const [state, setState] = useState(() => {
    const test = import.meta.env.DEV ? params.get('playtest') : null;
    if (test && story.nodes[test]) return start(story, test, params.get('asset') ?? story.cover);
    if (params.get('scene') === 'balcony') return start(story, 'line-50', 'bg-polina-anya');
    const chapter = story.chapters.find(chapter => chapter.id === params.get('scene'));
    return start(story, chapter?.entry, chapter?.image);
  });
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const [hiddenDialogueFor, setHiddenDialogueFor] = useState<unknown>(null);
  const screen = useRef<HTMLElement>(null);
  const artStage = useRef<HTMLDivElement>(null);
  useMedia(story, state, playing && !galleryOpen, artStage);
  const node = story.nodes[state.current];
  const options = availableOptions(story, state);
  const textId = node.type === 'text' ? state.current : node.type === 'choice'
    ? node.prompt ?? [...state.history].reverse().find(frame => story.nodes[frame.current].type === 'text')?.current
    : undefined;
  const textNode = textId ? story.nodes[textId] : undefined;
  const text = textNode?.type === 'text' ? textNode.text : node.type === 'end' ? 'Конец' : '';
  const pause = useInterfacePause(state, node.type === 'text' ? node.hideInterfaceMs ?? 0 : 0, playing && node.type === 'text' && !returning);
  const dialogueHidden = hiddenDialogueFor === state;
  const typed = useTypewriter(text, state, playing && node.type === 'text' && !returning && !pause.hidden, textNode?.type === 'text' ? textNode.delayMs ?? 0 : 0);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('theme', theme);
    url.searchParams.delete('layout');
    url.searchParams.delete('compare');
    history.replaceState(null, '', url);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', { cinema: '#181b1b', cold: '#151e25', amber: '#201d1a', film: '#1c201d' }[theme]);
  }, [theme]);
  useEffect(() => { if (playing && !chaptersOpen && !galleryOpen) screen.current?.focus({ preventScroll: true }); }, [state.current, playing, chaptersOpen, galleryOpen]);
  useEffect(() => {
    if (!playing || node.type !== 'end') return;
    setGalleryOpen(true);
  }, [playing, state.current, node.type]);

  function openChapter(chapter?: Chapter) {
    setReturning(false);
    setState(start(story, chapter?.entry, chapter?.image));
    setChaptersOpen(false);
    setPlaying(true);
  }
  function next() {
    if (pause.hidden) { pause.reveal(); return; }
    if (dialogueHidden) { setHiddenDialogueFor(null); return; }
    if (node.type === 'end') { setGalleryOpen(true); return; }
    if (typed.pending) { typed.complete(); return; }
    setReturning(false);
    setState(state => advance(story, state));
  }
  function goBack() {
    if (!state.history.length) return;
    setReturning(true);
    setState(back);
  }
  return <div className={`novel theme-${theme}${pause.hidden ? ' interface-paused' : ''}`}>
    <div className="theme-switcher" role="group" aria-label="Оформление">{themes.map(item => <button key={item.id} aria-pressed={theme === item.id} onClick={() => setTheme(item.id)}>{item.name}</button>)}</div>
    {playing ? <main ref={screen} className="game-screen" tabIndex={0} aria-label="Игра"
      onClick={event => { if (!(event.target as Element).closest('button,dialog')) next(); }}
      onKeyDown={event => {
        if ((event.target as Element).closest('button,dialog')) return;
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); next(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); goBack(); }
      }}>
      <div ref={artStage} className="art-stage"><img src={imageURL(state.scene)} alt="Иллюстрация текущей сцены" draggable={false} /></div>
      <div className="technical-decorations" aria-hidden="true">
        <div className="technical-drawing aircraft-drawing" style={{ maskImage: `url(${aircraftDrawing})` }} />
        <div className="technical-drawing propeller-drawing" style={{ maskImage: `url(${propellerDrawing})` }} />
      </div>
      <button className="menu-button" onClick={() => setPlaying(false)}>Главное меню</button>
      <section className={`dialogue${dialogueHidden ? ' dialogue-collapsed' : ''}`} aria-label="Реплика">
        <button className="dialogue-toggle" aria-label={dialogueHidden ? 'Показать текст' : 'Скрыть текст'} aria-expanded={!dialogueHidden} title={dialogueHidden ? 'Показать текст' : 'Скрыть текст'} onClick={() => setHiddenDialogueFor(dialogueHidden ? null : state)}>{dialogueHidden ? '⌃' : '⌄'}</button>
        <div className="dialogue-content" hidden={dialogueHidden}><p aria-label={text}>{typed.text}</p>{node.type === 'end' && <button className="end-gallery-button" onClick={() => setGalleryOpen(true)}>Открыть галерею</button>}<button className="back-button" disabled={state.history.length === 0} onClick={goBack}>Назад</button></div>
      </section>
      {node.type === 'choice' && <div className="choice-scrim"><div className="choices" role="group" aria-label="Варианты ответа">{options.map(option => <button key={option.id} onClick={() => { setReturning(false); setState(state => choose(story, state, option.id)); }}>{option.text}</button>)}</div></div>}
      <span className="chapter-label">{story.chapters.find(chapter => chapter.id === state.chapterId)?.title ?? ''}</span>
    </main> : <main className="home-screen">
      <div className="cover-stage"><img src={imageURL(story.cover)} alt="Авиационная карта Орска и навигационные линейки" fetchPriority="high" /></div>
      <section className="home-menu"><h1>ОРСКИЙ<span>ДВИЖ<span className="title-period">.</span></span></h1>
        <p>Основано на событиях,<br />которые лучше не объяснять.</p>
        <div className="home-buttons"><button onClick={() => openChapter()}>Начать игру</button><button onClick={() => setChaptersOpen(true)}>Выбрать главу</button><button onClick={() => setGalleryOpen(true)}>Галерея</button></div>
        <div className="practice-stamp"><span>ЛЁТНАЯ ПРАКТИКА</span><strong>ДОПУЩЕН</strong><span>К ПЛОХИМ РЕШЕНИЯМ</span></div>
      </section>
    </main>}
    {chaptersOpen && <ChapterDialog onSelect={openChapter} onClose={() => setChaptersOpen(false)} />}
    {galleryOpen && <PhotoGallery onClose={() => setGalleryOpen(false)} />}
  </div>;
}
const LocalEditor = import.meta.env.DEV ? lazy(() => import('./editor/Editor')) : null;
createRoot(document.getElementById('root')!).render(<StrictMode>{import.meta.env.DEV && params.has('editor') && LocalEditor ? <Suspense fallback={<p style={{ color: '#eee', padding: 30 }}>Загружаю редактор…</p>}><LocalEditor /></Suspense> : <App />}</StrictMode>);
