import { useState, type CSSProperties } from 'react';

export function Thumb({ src, alt, className, style }: { src: string; alt: string; className: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`${className} placeholder`} style={style}>
        GIF
      </div>
    );
  }
  return <img className={className} src={src} alt={alt} loading="lazy" style={style} onError={() => setFailed(true)} />;
}
