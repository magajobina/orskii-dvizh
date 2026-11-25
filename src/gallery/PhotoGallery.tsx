import { useEffect, useRef, useState } from 'react';
import { imageAssets, imageURL } from '../content/assets';
import { galleryPhotos, nextPhoto } from './catalog';
import './gallery.css';

const photos = galleryPhotos(imageAssets);

export default function PhotoGallery({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closePhoto = useRef<HTMLButtonElement>(null);
  const thumbnail = useRef<HTMLButtonElement | null>(null);
  const touchStart = useRef<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const photo = selected === null ? undefined : photos[selected];

  useEffect(() => {
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, []);

  useEffect(() => {
    if (selected !== null) closePhoto.current?.focus({ preventScroll: true });
    else thumbnail.current?.focus({ preventScroll: true });
  }, [selected]);

  // Only preload the adjacent full-size images, not the entire photo library.
  useEffect(() => {
    if (selected === null || photos.length < 2) return;
    const neighbors = [-1, 1].map(direction => {
      const image = new Image();
      image.src = imageURL(photos[nextPhoto(selected, direction, photos.length)].id);
      return image;
    });
    return () => { neighbors.forEach(image => image.removeAttribute('src')); };
  }, [selected]);

  function move(direction: number) {
    setSelected(index => index === null ? null : nextPhoto(index, direction, photos.length));
  }

  return <dialog ref={dialog} className="photo-gallery" aria-label={photo ? 'Просмотр фотографии' : 'Галерея фотографий'}
    onClose={onClose}
    onCancel={event => { if (selected !== null) { event.preventDefault(); setSelected(null); } }}
    onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    onKeyDown={event => {
      if (selected === null) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }}>
    <div className="photo-gallery-heading" hidden={selected !== null}>
      <div><h2>Галерея</h2><span>{photos.length} фото</span></div>
      <button autoFocus aria-label="Закрыть галерею" onClick={() => dialog.current?.close()}>×</button>
    </div>
    <div className="photo-gallery-grid" hidden={selected !== null}>
      {photos.map((item, index) => <button key={item.id} title={item.file} aria-label={`Открыть фото ${index + 1}: ${item.id}`}
        onClick={event => { thumbnail.current = event.currentTarget; setSelected(index); }}>
        <img src={imageURL(item.id)} alt="" loading="lazy" decoding="async" />
      </button>)}
      {!photos.length && <p>В библиотеке пока нет фотографий.</p>}
    </div>
    {photo && <div className="photo-lightbox"
      onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={event => {
        const from = touchStart.current;
        touchStart.current = null;
        const to = event.changedTouches[0]?.clientX;
        if (from !== null && to !== undefined && Math.abs(to - from) > 60) move(to < from ? 1 : -1);
      }}>
      <button ref={closePhoto} className="photo-lightbox-close" aria-label="Вернуться к галерее" onClick={() => setSelected(null)}>×</button>
      <button className="photo-lightbox-prev" aria-label="Предыдущее фото" disabled={photos.length < 2} onClick={() => move(-1)}>‹</button>
      <figure><img key={photo.id} src={imageURL(photo.id)} alt={`Фото ${selected! + 1}: ${photo.id}`} draggable={false} />
        <figcaption aria-live="polite">{selected! + 1} / {photos.length}</figcaption>
      </figure>
      <button className="photo-lightbox-next" aria-label="Следующее фото" disabled={photos.length < 2} onClick={() => move(1)}>›</button>
    </div>}
  </dialog>;
}
