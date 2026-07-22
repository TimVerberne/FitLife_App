import type { KeyboardEvent } from 'react';

// Keyboard handler for a `role="button"` element: activate on Enter/Space,
// and preventDefault so Space fires the action *instead of* also scrolling
// the page (the default for Space on a focused non-form element).
export function activateOnKey(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };
}
