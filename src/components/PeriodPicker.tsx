import { useState } from 'react';
import { STAT_PERIOD_LABEL, type StatPeriod } from '../lib/records';

const OPTIONS: StatPeriod[] = ['week', 'month', '3months', 'all'];

export function PeriodPicker({ value, onChange }: { value: StatPeriod; onChange: (p: StatPeriod) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="period-picker" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button className="period-picker-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {STAT_PERIOD_LABEL[value]} <span className="caret">▾</span>
      </button>
      {open && (
        <>
          <div className="set-menu-scrim" onClick={() => setOpen(false)} />
          <div className="period-picker-menu" role="menu">
            {OPTIONS.map((p) => (
              <button
                key={p}
                role="menuitemradio"
                aria-checked={p === value}
                className={`period-picker-item${p === value ? ' on' : ''}`}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
              >
                {STAT_PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
