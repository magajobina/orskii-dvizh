export const CHARACTER_MS = 22;

export function visibleCharacters(length: number, elapsedMs: number, delayMs = 0): number {
  return Math.min(length, Math.max(0, Math.floor((elapsedMs - delayMs) / CHARACTER_MS)));
}
