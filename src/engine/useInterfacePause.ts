import { useEffect, useState } from 'react';

/** A fresh visit gets its own pause; rollback is deliberately immediate. */
export function useInterfacePause(run: unknown, durationMs: number, enabled: boolean) {
  const [revealed, setRevealed] = useState<{ run: unknown }>({ run: null });
  const hidden = enabled && durationMs > 0 && revealed.run !== run;
  useEffect(() => {
    if (!hidden) return;
    const timer = window.setTimeout(() => setRevealed({ run }), Math.min(durationMs, 2147483647));
    return () => window.clearTimeout(timer);
  }, [run, durationMs, hidden]);
  return { hidden, reveal: () => setRevealed({ run }) };
}
