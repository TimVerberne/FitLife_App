import { useEffect, useState } from 'react';

// Keeps only what can form a number: digits, plus a single leading decimal
// point for decimal fields. Needed because these are type="text" inputs (see
// below), so the browser no longer rejects stray characters for us.
function sanitize(raw: string, allowDecimal: boolean): string {
  const cleaned = raw.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
  if (!allowDecimal) return cleaned;
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  // Drop every dot after the first.
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

export function NumberField({
  value,
  onCommit,
  inputMode,
  ariaLabel,
  step,
}: {
  value: number;
  onCommit: (n: number) => void;
  inputMode: 'decimal' | 'numeric';
  ariaLabel?: string;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const input = (
    <input
      // Deliberately type="text" (with inputMode still driving the numeric
      // keypad on mobile): setSelectionRange throws on a number input, so
      // the caret can't be placed at the end there — which is the whole
      // point of the focus handler below. It also drops the desktop spinners
      // and the locale-dependent parsing quirks of type="number".
      type="text"
      inputMode={inputMode}
      aria-label={ariaLabel}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        // Tapping into the middle of "10" used to leave the caret between
        // the digits, so backspace ate the wrong one. Always land at the
        // end. Deferred a frame because the browser (and iOS especially)
        // places the caret from the tap *after* focus fires — doing it
        // synchronously here would just get overwritten.
        const el = e.currentTarget;
        requestAnimationFrame(() => {
          const end = el.value.length;
          try {
            el.setSelectionRange(end, end);
          } catch {
            // Some browsers refuse on a detached/!focused input — harmless.
          }
        });
      }}
      onChange={(e) => {
        const raw = sanitize(e.target.value, inputMode === 'decimal');
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

  if (step === undefined) return input;

  const current = focused ? parseFloat(text) : value;
  const base = Number.isNaN(current) ? 0 : current;
  function commitDelta(delta: number) {
    const next = Math.max(0, Math.round((base + delta) * 100) / 100);
    onCommit(next);
    setText(String(next));
  }

  return (
    <div className="number-stepper">
      <button
        type="button"
        className="number-step-btn"
        aria-label={`Decrease${ariaLabel ? ` ${ariaLabel}` : ''}`}
        onClick={() => commitDelta(-step)}
      >
        −
      </button>
      {input}
      <button
        type="button"
        className="number-step-btn"
        aria-label={`Increase${ariaLabel ? ` ${ariaLabel}` : ''}`}
        onClick={() => commitDelta(step)}
      >
        +
      </button>
    </div>
  );
}
