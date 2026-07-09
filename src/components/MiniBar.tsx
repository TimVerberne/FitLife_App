import { useStore } from '../store/useStore';
import { setsCountOf } from '../lib/records';
import { useElapsedMinutes } from '../lib/useElapsedMinutes';

export function MiniBar() {
  const active = useStore((s) => s.active);
  const mode = useStore((s) => s.mode);
  const restoreSession = useStore((s) => s.restoreSession);
  const cancelSession = useStore((s) => s.cancelSession);

  if (!active || mode !== 'tabs') return null;

  return <MiniBarInner name={active.name} startedAt={active.startedAt} done={setsCountOf(active.entries)} total={active.entries.reduce((a, e) => a + e.sets.length, 0)} onRestore={restoreSession} onCancel={cancelSession} />;
}

function MiniBarInner({
  name,
  startedAt,
  done,
  total,
  onRestore,
  onCancel,
}: {
  name: string;
  startedAt: number;
  done: number;
  total: number;
  onRestore: () => void;
  onCancel: () => void;
}) {
  const mins = useElapsedMinutes(startedAt);
  return (
    <div id="mini">
      <div className="mini">
        <span className="mini-dot" />
        <button
          className="mini-b"
          style={{ cursor: 'pointer', border: 'none', background: 'none', textAlign: 'left', padding: 0, color: 'inherit', font: 'inherit' }}
          aria-label={`Resume ${name} workout`}
          onClick={onRestore}
        >
          <span className="mini-name">{name}</span>
          <span className="mini-sub">In progress · {done}/{total} sets</span>
        </button>
        <button
          className="mini-clock"
          style={{ cursor: 'pointer', border: 'none', background: 'none', padding: 0, font: 'inherit' }}
          aria-label={`Resume workout, ${mins} minutes elapsed`}
          onClick={onRestore}
        >
          {mins}m
        </button>
        <button className="mini-x" aria-label="Discard workout" onClick={onCancel}>
          ✕
        </button>
      </div>
    </div>
  );
}
