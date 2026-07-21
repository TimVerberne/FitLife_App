import { useEffect, useState } from 'react';

export function NumberField({
  value,
  onCommit,
  inputMode,
  ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  inputMode: 'decimal' | 'numeric';
  ariaLabel?: string;
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
      aria-label={ariaLabel}
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
          if (value !== 0) onCommit(0);
          setText('0');
        } else {
          const clamped = Math.max(0, n);
          // Skip the commit if nothing actually changed — a plain
          // focus-then-blur with no edit (e.g. tapping the field then
          // immediately tapping the "done" checkmark) would otherwise still
          // round-trip the displayed value through onCommit, which in lb
          // mode can drift the underlying stored kg value by a fraction of
          // a kg due to the display rounding not being perfectly reversible.
          if (clamped !== value) onCommit(clamped);
          setText(String(clamped));
        }
      }}
    />
  );
}
