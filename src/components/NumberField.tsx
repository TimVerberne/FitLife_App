import { useEffect, useState } from 'react';

export function NumberField({
  value,
  onCommit,
  inputMode,
}: {
  value: number;
  onCommit: (n: number) => void;
  inputMode: 'decimal' | 'numeric';
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <input
      type="number"
      inputMode={inputMode}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parseFloat(raw);
        if (!Number.isNaN(n)) onCommit(Math.max(0, n));
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseFloat(text);
        if (Number.isNaN(n)) {
          onCommit(0);
          setText('0');
        } else {
          const clamped = Math.max(0, n);
          onCommit(clamped);
          setText(String(clamped));
        }
      }}
    />
  );
}
