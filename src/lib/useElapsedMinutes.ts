import { useEffect, useState } from 'react';

export function useElapsedMinutes(startedAt: number): number {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.round((Date.now() - startedAt) / 60000));
}
