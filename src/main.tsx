import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { advance, availableOptions, back, choose, start } from './engine/engine';
import type { Chapter, Story } from './engine/engine';
import data from './content/story.json';
import { imageFilename, imageURL } from './content/assets';
import aircraftDrawing from './assets/decorations/da40.png';
import propellerDrawing from './assets/decorations/propeller.png';
import '@fontsource-variable/golos-text';
import '@fontsource-variable/oswald';
import './styles.css';

const story = data as Story;
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
  const [theme, setTheme] = useState<Theme>(themes.some(item => item.id === requestedTheme) ? requestedTheme as Theme : 'cinema');
  const [playing, setPlaying] = useState(Boolean(params.get('scene')));
  const [state, setState] = useState(() => {
    if (params.get('scene') === 'balcony') return start(story, 'line-50', 'bg-polina-anya');
    const chapter = story.chapters.find(chapter => chapter.id === params.get('scene'));
    return start(story, chapter?.entry, chapter?.image);
  });
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const screen = useRef<HTMLElement>(null);
  const node = story.nodes[state.current];
  const options = availableOptions(story, state);
  const textId = node.type === 'text' ? state.current : node.type === 'choice'
    ? node.prompt ?? [...state.history].reverse().find(frame => story.nodes[frame.current].type === 'text')?.current
    : undefined;
  const textNode = textId ? story.nodes[textId] : undefined;
  const text = textNode?.type === 'text' ? textNode.text : node.type === 'end' ? 'Конец' : '';
  const visibleImage = playing ? state.scene : story.cover;

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('theme', theme);
    url.searchParams.delete('layout');
    url.searchParams.delete('compare');
    history.replaceState(null, '', url);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', { cinema: '#181b1b', cold: '#151e25', amber: '#201d1a', film: '#1c201d' }[theme]);
  }, [theme]);
  useEffect(() => { if (playing && !chaptersOpen) screen.current?.focus({ preventScroll: true }); }, [state.current, playing, chaptersOpen]);

  function openChapter(chapter?: Chapter) {
    setState(start(story, chapter?.entry, chapter?.image));
    setChaptersOpen(false);
    setPlaying(true);
  }
  return <div className={`novel theme-${theme}`}>
    <div className="theme-switcher" role="group" aria-label="Оформление">{themes.map(item => <button key={item.id} aria-pressed={theme === item.id} onClick={() => setTheme(item.id)}>{item.name}</button>)}</div>
    {playing ? <main ref={screen} className="game-screen" tabIndex={0} aria-label="Игра"
      onClick={event => { if (!(event.target as Element).closest('button,dialog')) setState(state => advance(story, state)); }}
      onKeyDown={event => {
        if ((event.target as Element).closest('button,dialog')) return;
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setState(state => advance(story, state)); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); setState(back); }
      }}>
      <div className="art-stage"><img src={imageURL(state.scene)} alt="Иллюстрация текущей сцены" draggable={false} /></div>
      <div className="technical-decorations" aria-hidden="true">
        <div className="technical-drawing aircraft-drawing" style={{ maskImage: `url(${aircraftDrawing})` }} />
        <div className="technical-drawing propeller-drawing" style={{ maskImage: `url(${propellerDrawing})` }} />
      </div>
      <button className="menu-button" onClick={() => setPlaying(false)}>Главное меню</button>
      <section className="dialogue" aria-label="Реплика"><p aria-live="polite">{text}</p><span className="continue-mark" aria-hidden="true">{node.type === 'text' ? '▾' : ''}</span></section>
      {node.type === 'choice' && <div className="choice-scrim"><div className="choices" role="group" aria-label="Варианты ответа">{options.map(option => <button key={option.id} onClick={() => setState(state => choose(story, state, option.id))}>{option.text}</button>)}</div></div>}
      <button className="back-button" disabled={state.history.length === 0} onClick={() => setState(back)}>Назад</button>
    </main> : <main className="home-screen">
      <div className="cover-stage"><img src={imageURL(story.cover)} alt="Авиационная карта Орска и навигационные линейки" fetchPriority="high" /></div>
      <section className="home-menu"><h1>ОРСКИЙ<span>ДВИЖ<span className="title-period">.</span></span></h1>
        <p>Основано на событиях,<br />которые лучше не объяснять.</p>
        <div className="home-buttons"><button onClick={() => openChapter()}>Начать игру</button><button onClick={() => setChaptersOpen(true)}>Выбрать главу</button></div>
        <div className="practice-stamp"><span>ЛЁТНАЯ ПРАКТИКА</span><strong>ДОПУЩЕН</strong><span>К ПЛОХИМ РЕШЕНИЯМ</span></div>
      </section>
    </main>}
    <aside className="scene-debug" aria-label="Отладочные ID сцены">
      <div><span>{playing ? node.type : 'screen'}</span> <code>{playing ? state.current : 'main-menu'}</code></div>
      {playing && node.type === 'choice' && textId && <div><span>text</span> <code>{textId}</code></div>}
      <div><span>image</span> <code>{visibleImage}</code></div>
      <div className="debug-filename">{imageFilename(visibleImage)}</div>
      {playing && node.type === 'choice' && <div><span>answers</span> <code>{options.map(option => option.id).join(' / ')}</code></div>}
    </aside>
    {chaptersOpen && <ChapterDialog onSelect={openChapter} onClose={() => setChaptersOpen(false)} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
