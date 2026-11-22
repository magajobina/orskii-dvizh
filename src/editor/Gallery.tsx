import { useEffect, useRef, useState } from 'react';
import registry from '../content/assets.json';
import { imageURL } from '../content/assets';

export function Gallery({ current, onPick, onClose }: { current: string; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  // New illustrations are appended to the registry; show the latest additions first.
  const images = Object.entries(registry).reverse().filter(([id, asset]) => 'file' in asset && `${id} ${asset.file}`.toLowerCase().includes(query.toLowerCase()));
  return <dialog className="editor-gallery" ref={ref} onClose={onClose} aria-labelledby="gallery-title" onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
    <div className="editor-dialog-title"><h2 id="gallery-title">Иллюстрации</h2><button onClick={() => ref.current?.close()} aria-label="Закрыть галерею">×</button></div>
    <input autoFocus type="search" placeholder="Найти по имени или ID" value={query} onChange={e => setQuery(e.target.value)} aria-label="Поиск иллюстраций" />
    <div className="gallery-grid">{images.map(([id, asset]) => <button key={id} className={id === current ? 'current' : ''} onClick={() => onPick(id)}>
      <img src={imageURL(id)} alt={id} loading="lazy" /><strong>{id}</strong><small>{'width' in asset ? `${asset.width} × ${asset.height}` : ''}</small>
    </button>)}</div>
    {!images.length && <p>Ничего не найдено.</p>}
  </dialog>;
}
