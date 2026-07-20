import { useStore, type Tab } from '../store/useStore';

const ITEMS: { id: Tab; label: string; d: string }[] = [
  { id: 'home', label: 'Home', d: 'M3 11l9-8 9 8M5 10v10h14V10' },
  { id: 'train', label: 'Train', d: 'M6 4v16M18 4v16M6 8h12M6 16h12' },
  { id: 'stats', label: 'Stats', d: 'M4 20V10M12 20V4M20 20v-7' },
  { id: 'life', label: 'Life', d: 'M12 21s-7-4.35-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.65-9.5 9-9.5 9z' },
  { id: 'you', label: 'You', d: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6' },
];

export function BottomNav() {
  const tab = useStore((s) => s.tab);
  const mode = useStore((s) => s.mode);
  const go = useStore((s) => s.go);

  if (mode === 'session' || mode === 'finish') return null;

  return (
    <nav className="nav">
      {ITEMS.map((item) => (
        <button key={item.id} className={tab === item.id ? 'on' : ''} onClick={() => go(item.id)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={item.d} />
          </svg>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
