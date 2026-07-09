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
        <span className="mini-b" style={{ cursor: 'pointer' }} onClick={onRestore}>
          <span className="mini-name">{name}</span>
          <span className="mini-sub">In progress · {done}/{total} sets</span>
        </span>
        <span className="mini-clock" style={{ cursor: 'pointer' }} onClick={onRestore}>
          {mins}m
        </span>
        <button className="mini-x" onClick={onCancel}>
          ✕
        </button>
      </div>
    </div>
  );
}
