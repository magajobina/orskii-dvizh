import { useEffect, useRef, useState } from 'react';
import { imageAssets, imageURL } from '../content/assets';
import { audioAssets, audioURL } from '../content/audio';
import { mediaAccept, refreshLibrary, uploadMedia, useLibraryRevision } from './library';

export function Gallery({ current = '', kind, onPick, onClose }: {
  current?: string; kind?: 'image' | 'audio'; onPick?: (id: string) => void; onClose: () => void;
}) {
  useLibraryRevision();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'image' | 'audio'>(kind ?? 'image');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const needle = query.toLowerCase();
  const images = Object.entries(imageAssets).reverse().filter(([id, asset]) => asset.file && `${id} ${asset.file}`.toLowerCase().includes(needle));
  const sounds = Object.entries(audioAssets).reverse().filter(([id, asset]) => `${id} ${asset.file} ${asset.title}`.toLowerCase().includes(needle));
  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true); setQuery('');
    const errors: string[] = []; let count = 0;
    for (let i = 0; i < files.length; i++) {
      setMessage(`Добавляю ${i + 1} из ${files.length}: ${files[i].name}`);
      try { await uploadMedia(tab, files[i]); count++; }
      catch (error) { errors.push(`${files[i].name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    setMessage(`Добавлено: ${count}.${errors.length ? '\n' + errors.join('\n') : ' Новые файлы вверху списка.'}`);
    setBusy(false);
  }
  return <dialog className="editor-gallery" ref={ref} onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose} aria-labelledby="gallery-title" onClick={event => { if (!busy && event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="editor-dialog-title"><h2 id="gallery-title">{kind ? tab === 'image' ? 'Иллюстрации' : 'Аудиотека' : 'Библиотека'}</h2><button disabled={busy} onClick={() => ref.current?.close()} aria-label="Закрыть библиотеку">×</button></div>
    {!kind && <div className="library-tabs" role="group" aria-label="Тип файлов"><button disabled={busy} aria-pressed={tab === 'image'} onClick={() => { setTab('image'); setQuery(''); setMessage(''); }}>Картинки</button><button disabled={busy} aria-pressed={tab === 'audio'} onClick={() => { setTab('audio'); setQuery(''); setMessage(''); }}>Аудио</button></div>}
    <div className="library-actions"><button disabled={busy} onClick={() => input.current?.click()}>{tab === 'image' ? '+ Добавить картинки' : '+ Добавить аудио'}</button><button disabled={busy} onClick={() => { void refreshLibrary().then(() => setMessage('Библиотека обновлена.')).catch(error => setMessage(error.message)); }}>Обновить</button></div>
    <input type="file" multiple hidden ref={input} accept={mediaAccept[tab]} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files); }} />
    <p className="editor-muted">Можно выбрать несколько файлов. Совпадения имён получают суффикс; существующие файлы сохраняются.</p>
    <input autoFocus type="search" placeholder="Найти по имени или ID" value={query} onChange={event => setQuery(event.target.value)} aria-label="Поиск в библиотеке" />
    {message && <p className="library-message" role="status">{message}</p>}
    {tab === 'image' ? <div className="gallery-grid">{images.map(([id, asset]) => <article key={id} className={id === current ? 'current' : ''}>
      <img src={imageURL(id)} alt={id} loading="lazy" /><strong>{id}</strong><small>{asset.width} × {asset.height}</small>
      {onPick && <button disabled={busy} onClick={() => onPick(id)}>Выбрать</button>}
    </article>)}</div> : <div className="audio-library">{sounds.map(([id, asset]) => <article key={id} className={id === current ? 'current' : ''}>
      <strong>{asset.title}</strong><small>{id} · {asset.file}</small><audio controls preload="none" src={audioURL(id)} aria-label={`Прослушать ${asset.title}`} />
      {onPick && <button disabled={busy} onClick={() => onPick(id)}>Выбрать звук</button>}
    </article>)}</div>}
    {!(tab === 'image' ? images.length : sounds.length) && <p>Ничего не найдено.</p>}
  </dialog>;
}
