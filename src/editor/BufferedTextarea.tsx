import { startTransition, useEffect, useRef, useState } from 'react';

// Typing stays local; the expensive story/canvas update follows a short pause.
export function BufferedTextarea({ value, onChange, onBlur, rows }: {
  value: string; onChange: (value: string) => void; onBlur: () => void; rows: number;
}) {
  const [draft, setDraft] = useState(value);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbacks = useRef({ onChange, onBlur });
  callbacks.current = { onChange, onBlur };
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current === null) return;
    const text = pending.current;
    pending.current = null;
    callbacks.current.onChange(text);
  };
  useEffect(() => { if (pending.current === null) setDraft(value); }, [value]);
  useEffect(() => {
    const save = () => flush();
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') flush();
    };
    window.addEventListener('orsk-editor-flush', save);
    window.addEventListener('beforeunload', save);
    window.addEventListener('keydown', shortcut, true);
    return () => {
      flush();
      window.removeEventListener('orsk-editor-flush', save);
      window.removeEventListener('beforeunload', save);
      window.removeEventListener('keydown', shortcut, true);
    };
  }, []);
  return <textarea rows={rows} value={draft} onChange={event => {
    const text = event.target.value;
    setDraft(text);
    pending.current = text;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => startTransition(flush), 200);
  }} onBlur={() => { flush(); callbacks.current.onBlur(); }} />;
}
