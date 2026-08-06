import { useState, type CSSProperties } from 'react';

// Up to two initials from an exercise name, for the placeholder tile shown
// when there's no image — user-authored exercises never have one. Falls back
// to the "GIF" label the bundled dataset's own broken-image case has always
// used, for call sites that pass an empty alt (the picker's Recent strip).
function initialsOf(alt: string): string {
  const words = alt.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'GIF';
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function Thumb({ src, alt, className, style }: { src: string; alt: string; className: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  // An empty src is checked up front rather than left to onError: browsers
  // resolve `src=""` against the page URL and fetch the document itself,
  // which doesn't reliably fire an error event.
  if (failed || !src) {
    const label = initialsOf(alt);
    return (
      <div className={`${className} placeholder${label === 'GIF' ? '' : ' initials'}`} style={style}>
        {label}
      </div>
    );
  }
  return <img className={className} src={src} alt={alt} loading="lazy" style={style} onError={() => setFailed(true)} />;
}
