import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import preview from './content/preview.json';
import '@fontsource-variable/golos-text';
import '@fontsource-variable/oswald';
import './styles.css';

type Theme = 'book' | 'night' | 'poster';
type Chapter = typeof preview.chapters[number];
const themes: { id: Theme; name: string; description: string }[] = [
  { id: 'book', name: 'Лётная книжка', description: 'Бумага, типографика и личные воспоминания' },
  { id: 'night', name: 'Ночной перрон', description: 'Тёмный экран, янтарный свет и приборная сетка' },
  { id: 'poster', name: 'Плакат практики', description: 'Красный акцент и графика авиационных плакатов' },
];
const assetURL = (path: string) => `${import.meta.env.BASE_URL}${path}`;

function Plane({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M32 7 37 27 57 38 56 43 36 37 35 51 43 55 43 58 32 55 21 58 21 55 29 51 28 37 8 43 7 38 27 27Z" fill="currentColor" />
  </svg>;
}

function initialTheme(): Theme {
  const query = new URLSearchParams(location.search).get('style');
  if (themes.some(theme => theme.id === query)) return query as Theme;
  try {
    const saved = localStorage.getItem('orsk.interface');
    if (themes.some(theme => theme.id === saved)) return saved as Theme;
  } catch { /* The prototype remains usable without browser storage. */ }
  return 'book';
}

function ChapterDialog({ onSelect, onClose }: { onSelect: (chapter: Chapter) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return <dialog ref={ref} className="chapter-dialog" aria-labelledby="chapters-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="dialog-body">
      <div className="dialog-top"><span className="eyebrow">Вне очереди на вылет</span><button autoFocus className="close-button" aria-label="Закрыть выбор главы" onClick={() => ref.current?.close()}>×</button></div>
      <h2 id="chapters-title">Куда отправимся?</h2>
      <p className="dialog-intro">Любой момент практики. Без объяснительной.</p>
      <div className="chapter-list">{preview.chapters.map(chapter => <button key={chapter.id} className="chapter-card" onClick={() => onSelect(chapter)}>
        <img src={assetURL(chapter.image)} alt="" />
        <span><strong>{chapter.short}</strong><span>{chapter.note}</span></span>
        <span className="chapter-mark" aria-hidden="true">+</span>
      </button>)}</div>
    </div>
  </dialog>;
}

function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const sceneHeading = useRef<HTMLHeadingElement>(null);
  const screenHeading = useRef<HTMLHeadingElement>(null);
  const previousChapter = useRef(chapter);

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', { book: '#ece8da', night: '#101f26', poster: '#eee9db' }[theme]);
    try { localStorage.setItem('orsk.interface', theme); } catch { /* Storage is optional. */ }
    const url = new URL(location.href);
    url.searchParams.set('style', theme);
    history.replaceState(null, '', url);
  }, [theme]);

  useEffect(() => {
    if (previousChapter.current !== chapter) {
      (chapter ? sceneHeading : screenHeading).current?.focus();
      previousChapter.current = chapter;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [chapter]);

  function openChapter(next: Chapter) {
    setChaptersOpen(false);
    setOutcome(null);
    setChapter(next);
  }

  return <div className={`app theme-${theme}`}>
    <a className="skip-link" href="#main">К содержимому</a>
    <div className="page-shell">
      <header className="masthead">
        <button className="brand" onClick={() => { setChapter(null); setOutcome(null); }} aria-label="Орский движ — главное меню">
          <span className="brand-emblem"><Plane /></span>
          <span>ОРСКИЙ ДВИЖ<small>Истории лётной практики</small></span>
        </button>
        <span className="header-route"><span>САНКТ-ПЕТЕРБУРГ</span><span className="route-rule" /><Plane /><span className="route-rule" /><span>ОРСК</span></span>
        <span className="institution">СПб ГУГА<span>Летали. Выжили. Рассказываем.</span></span>
      </header>

      <main id="main" className={chapter ? 'game-main' : 'home-main'}>
        {chapter ? <>
          <div className="game-toolbar">
            <button className="text-button" onClick={() => { setChapter(null); setOutcome(null); }}>Главное меню</button>
            <span className="eyebrow">{chapter.location}</span>
            <button className="text-button" onClick={() => setChaptersOpen(true)}>Выбрать главу</button>
          </div>
          <div className="game-layout">
            <figure className="scene-figure">
              <img className="scene-image" src={assetURL(chapter.image)} alt={`Иллюстрация эпизода «${chapter.short}»: ${chapter.location}`} />
              <figcaption><span>{chapter.location}</span><span>Из жизни курсантов</span></figcaption>
            </figure>
            <section className="reader" aria-labelledby="scene-title">
              <span className="eyebrow chapter-kicker">Лётная практика · {chapter.short}</span>
              <h1 id="scene-title" ref={sceneHeading} tabIndex={-1}>{chapter.title}</h1>
              <div className="reader-rule"><Plane /><span /></div>
              <p className="story-text">{chapter.text}</p>
              {outcome === null ? <div className="choices" aria-label="Ваше решение">
                <span className="eyebrow decision-label">Ваше решение</span>
                {chapter.choices.map(choice => <button key={choice.id} className="choice" onClick={() => setOutcome(choice.response)}><span>{choice.text}</span><span className="choice-symbol" aria-hidden="true">+</span></button>)}
              </div> : <div className="outcome" role="status">
                <span className="eyebrow">Практика вносит коррективы</span>
                <p>{outcome}</p>
                <div className="outcome-actions"><button className="primary-button" onClick={() => setOutcome(null)}>Другой вариант</button><button className="text-button" onClick={() => setChaptersOpen(true)}>К главам</button></div>
              </div>}
              <span className="reader-note">Первый выбор главы. Дальше — после взлёта.</span>
            </section>
          </div>
        </> : <div className="home-layout">
          <section className="home-copy" aria-labelledby="game-title">
            <span className="eyebrow home-kicker"><span className="little-star" aria-hidden="true">✦</span> Не вполне обычная лётная практика</span>
            <h1 id="game-title" ref={screenHeading} tabIndex={-1}>ОРСКИЙ<span>ДВИЖ<span className="title-period">.</span></span></h1>
            <div className="home-subtitle">Курс на Орск.<br /><em>Дальше — по обстоятельствам.</em></div>
            <p className="home-description">Бескрайняя степь, первая лётная практика<br className="desktop-break" /> и компания, с которой скучно не будет.<br className="desktop-break" /> Основано на событиях, которые лучше не объяснять.</p>
            <div className="home-actions">
              <button className="primary-button start-button" onClick={() => openChapter(preview.chapters[0])}><Plane />Начать игру</button>
              <button className="secondary-button" onClick={() => setChaptersOpen(true)}><span className="chapter-icon" aria-hidden="true"><i /><i /><i /></span>Выбрать главу</button>
            </div>
            <div className="home-bottom">
              <div className="practice-stamp"><span>ЛЁТНАЯ ПРАКТИКА</span><strong>ДОПУЩЕН</strong><span>К ПЛОХИМ РЕШЕНИЯМ</span></div>
              <p>Посвящается своим.<br /><span>Остальным — удачи разобраться.</span></p>
            </div>
          </section>
          <figure className="cover-figure">
            <div className="cover-label"><span>ЛИЧНОЕ ДЕЛО КУРСАНТА</span><span>ОРСК / ПРАКТИКА</span></div>
            <div className="cover-photo"><img src={assetURL(preview.menuImage)} alt="Авиационная карта Орска, масштабная линейка и навигационный расчётчик — оригинальная обложка игры" fetchPriority="high" /></div>
            <figcaption><span>Место действия — Орск</span><span className="cover-caption-end">Масштаб событий — неизвестен</span></figcaption>
            <span className="cover-seal" aria-hidden="true">ПРАКТИКА<br />ПОКАЖЕТ</span>
          </figure>
        </div>}
      </main>

      <footer className="design-dock">
        <div className="dock-label"><span className="eyebrow">Три взгляда на одну практику</span><span>Выберите оформление</span></div>
        <div className="theme-options" role="group" aria-label="Варианты оформления">{themes.map(item => <button key={item.id} className={`theme-option ${theme === item.id ? 'is-active' : ''}`} aria-pressed={theme === item.id} title={item.description} onClick={() => setTheme(item.id)}>
          <span className={`theme-swatch swatch-${item.id}`} aria-hidden="true"><i /><i /></span><span>{item.name}</span><span className="theme-check" aria-hidden="true">{theme === item.id ? '✓' : ''}</span>
        </button>)}</div>
      </footer>
    </div>
    {chaptersOpen && <ChapterDialog onSelect={openChapter} onClose={() => setChaptersOpen(false)} />}
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
