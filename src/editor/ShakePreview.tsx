import { useEffect, useRef, useState } from 'react';
import type { Shake } from '../engine/engine';
import { shakeAnimation, shakeNames } from '../engine/shake';
import { imageURL } from '../content/assets';

export function ShakePreview({ asset, shake, onChange }: { asset: string; shake?: Shake; onChange: (shake?: Shake) => void }) {
  const ref = useRef<HTMLImageElement>(null);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const animation = shakeAnimation(ref.current, shake);
    return () => animation?.cancel();
  }, [shake?.variant, shake?.durationMs, asset, replay]);
  return <section className="shake-settings"><h3>Тряска картинки</h3>
    <div className="shake-options" role="group" aria-label="Вариант тряски">
      <button aria-pressed={!shake} onClick={() => onChange()}>Нет</button>
      {Object.entries(shakeNames).map(([variant, name]) => <button key={variant} aria-pressed={Boolean(shake)} onClick={() => onChange({ variant: variant as Shake['variant'], durationMs: shake?.durationMs ?? 1000 })}>{name}</button>)}
    </div>
    {shake && <><label className="editor-field">Длительность, мс<input type="number" min="1" step="1" value={shake.durationMs} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 1) onChange({ ...shake, durationMs: Math.round(value) }); }} /></label>
    <div className="shake-preview"><img ref={ref} src={imageURL(asset)} alt="Предпросмотр тряски" /></div>
    <button className="wide-button" onClick={() => setReplay(value => value + 1)}>Повторить тряску</button></>}
  </section>;
}
