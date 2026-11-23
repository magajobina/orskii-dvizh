import type { Shake } from './engine';

export const shakeNames = { tremble: 'Дрожь' } as const;
export function shakeAnimation(element: HTMLElement, shake?: Shake): Animation | undefined {
  if (!shake || shake.durationMs <= 0) return;
  // Legacy variants in old stories/backups also use the retained tremble effect.
  const offsets = [[0, 0, 0], [-3, 2, 0], [3, -2, 0], [-2, -1, 0], [2, 2, 0], [0, 0, 0]];
  const cycle = 100;
  return element.animate(offsets.map(([x, y, r]) => ({ transform: `translate(${x}px, ${y}px) rotate(${r}deg)` })), {
    duration: cycle, iterations: shake.durationMs / cycle, easing: 'linear',
  });
}
