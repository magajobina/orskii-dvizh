import { useEffect, useRef, useState } from 'react';
import { imageAssets, imageURL } from '../content/assets';
import { audioAssets, audioURL } from '../content/audio';
import { emptyMediaTrash, mediaAccept, mediaTrash, refreshLibrary, removeMedia, restoreMedia, uploadMedia, useLibraryRevision } from './library';
import type { Story } from '../engine/engine';
import { mediaUsage } from '../content/mediaUsage';

export function Gallery({ current = '', kind, onPick, onClose, story }: {
  current?: string; kind?: 'image' | 'audio'; onPick?: (id: string) => void; onClose: () => void; story: Story;
}) {
  const revision = useLibraryRevision();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'image' | 'audio'>(kind ?? 'image');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [removed, setRemoved] = useState<string[]>([]);
  const [trash, setTrash] = useState({ count: 0, bytes: 0 });
  const sizeLabel = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МиБ`;
  useEffect(() => {
    let active = true;
    void mediaTrash().then(value => { if (active) setTrash(value); }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [revision]);
  async function clearTrash() {
    if (!window.confirm(`Удалить содержимое корзины навсегда? Записей: ${trash.count}, размер: ${sizeLabel(trash.bytes)}.\nЭто освободит место на диске. Отменить очистку будет невозможно.`)) return;
    setBusy(true);
    try {
      const result = await emptyMediaTrash();
      setRemoved([]);
      setMessage(`Корзина очищена. Освобождено ${sizeLabel(result.bytes)}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally {
      await mediaTrash().then(setTrash).catch(() => {});
      setBusy(false);
    }
  }
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const needle = query.toLowerCase();
  const images = Object.entries(imageAssets).reverse().filter(([id, asset]) => asset.file && `${id} ${asset.file}`.toLowerCase().includes(needle));
  const sounds = Object.entries(audioAssets).reverse().filter(([id, asset]) => `${id} ${asset.file} ${asset.title}`.toLowerCase().includes(needle));
  async function remove(id: string) {
    const uses = mediaUsage(story, tab, id);
    if (uses.length) { setMessage(`Файл используется:\n${uses.join('\n')}\nСначала уберите привязки и сохраните сюжет.`); return; }
    setBusy(true);
    try {
      const ticket = await removeMedia(tab, id);
      setRemoved(items => [...items, ticket]);
      setMessage(`${id} перемещён в корзину проекта.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function undoRemove() {
    const ticket = removed.at(-1); if (!ticket) return;
    setBusy(true);
    try { await restoreMedia(ticket); setRemoved(items => items.slice(0, -1)); setMessage('Файл восстановлен.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
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
    {removed.length > 0 && <button disabled={busy} onClick={() => { void undoRemove(); }}>Отменить последнее удаление</button>}
    <div className="library-trash"><span>Корзина: {trash.count} · {sizeLabel(trash.bytes)}</span><button className="library-delete" disabled={busy || trash.count === 0} onClick={() => { void clearTrash(); }}>Очистить корзину навсегда</button></div>
    <input autoFocus type="search" placeholder="Найти по имени или ID" value={query} onChange={event => setQuery(event.target.value)} aria-label="Поиск в библиотеке" />
    {message && <p className="library-message" role="status">{message}</p>}
    {tab === 'image' ? <div className="gallery-grid">{images.map(([id, asset]) => <article key={id} className={id === current ? 'current' : ''}>
      <img src={imageURL(id)} alt={id} loading="lazy" /><strong>{id}</strong><small>{asset.width} × {asset.height}</small>
      {onPick && <button disabled={busy} onClick={() => onPick(id)}>Выбрать</button>}
      <button className="library-delete" disabled={busy} onClick={() => { void remove(id); }} aria-label={`Удалить картинку ${id}`}>Удалить</button>
    </article>)}</div> : <div className="audio-library">{sounds.map(([id, asset]) => <article key={id} className={id === current ? 'current' : ''}>
      <strong>{asset.title}</strong><small>{id} · {asset.file}</small><audio controls preload="none" src={audioURL(id)} aria-label={`Прослушать ${asset.title}`} />
      {onPick && <button disabled={busy} onClick={() => onPick(id)}>Выбрать звук</button>}
      <button className="library-delete" disabled={busy} onClick={() => { void remove(id); }} aria-label={`Удалить звук ${id}`}>Удалить</button>
    </article>)}</div>}
    {!(tab === 'image' ? images.length : sounds.length) && <p>Ничего не найдено.</p>}
  </dialog>;
}
