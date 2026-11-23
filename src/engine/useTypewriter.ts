import { useLayoutEffect, useRef, useState } from 'react';
import { visibleCharacters } from './typewriter';

export function useTypewriter(text: string, run: unknown, animate: boolean, delayMs: number) {
  const characters = Array.from(text);
  const [progress, setProgress] = useState<{ run: unknown; count: number }>({ run: null, count: 0 });
  const finish = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    let frame = 0;
    const length = Array.from(text).length;
    let finished = !animate || length === 0;
    const started = performance.now();
    setProgress({ run, count: finished ? length : 0 });
    finish.current = () => {
      finished = true;
      cancelAnimationFrame(frame);
      setProgress({ run, count: length });
    };
    const tick = (now: number) => {
      if (finished) return;
      const count = visibleCharacters(length, now - started, delayMs);
      setProgress(previous => previous.run === run && previous.count === count ? previous : { run, count });
      if (count < length) frame = requestAnimationFrame(tick);
    };
    if (!finished) frame = requestAnimationFrame(tick);
    return () => { finished = true; cancelAnimationFrame(frame); };
  }, [text, run, animate, delayMs]);
  const count = !animate ? characters.length : progress.run === run ? progress.count : 0;
  return { text: characters.slice(0, count).join(''), pending: count < characters.length, complete: () => finish.current() };
}
