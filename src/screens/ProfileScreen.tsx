import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById } from '../lib/exercises';
import {
  barBucketsForPeriod,
  formatDuration,
  MUSCLE_AXES,
  muscleSplit,
  periodCutoff,
  periodTotal,
  personalRecords,
  relativeDate,
  setsCountOf,
  STAT_PERIOD_LABEL,
  volumeOf,
  type StatPeriod,
  type WeeklyMetric,
} from '../lib/records';
import { formatTrainingVolume, formatWeight, toDisplayWeight } from '../lib/units';
import { useAuthState } from '../lib/auth';
import { useCollapsedList } from '../lib/useCollapsedList';
import { BarChart } from '../components/BarChart';
import { RadarChart } from '../components/RadarChart';
import { TrainingCalendar } from '../components/TrainingCalendar';
import { PeriodPicker } from '../components/PeriodPicker';
import { ShowMoreButton } from '../components/ShowMoreButton';
import { Thumb } from '../components/Thumb';
import { InstallCard } from '../components/InstallCard';

export function ProfileScreen() {
  const sessions = useStore((s) => s.sessions);
  const openWorkoutSheet = useStore((s) => s.openWorkoutSheet);
  const openSettings = useStore((s) => s.openSettings);
  const openFriends = useStore((s) => s.openFriends);
  const openDetail = useStore((s) => s.openDetail);
  const units = useStore((s) => s.settings.units);
  const METRICS: { id: WeeklyMetric; label: string; unit: string }[] = [
    { id: 'volume', label: 'Volume', unit: units },
    { id: 'duration', label: 'Duration', unit: 'min' },
    { id: 'reps', label: 'Reps', unit: '' },
  ];
  const [metric, setMetric] = useState<WeeklyMetric>('volume');
  const [chartPeriod, setChartPeriod] = useState<StatPeriod>('week');

  const mySessions = useMemo(() => sessions.filter((s) => s.person === 'You').sort((a, b) => b.startedAt - a.startedAt), [sessions]);
  const totalVolume = useMemo(() => mySessions.reduce((a, h) => a + volumeOf(h.entries), 0), [mySessions]);
  const records = useMemo(() => personalRecords(sessions), [sessions]);
  const recordsList = useCollapsedList(records);
  const historyList = useCollapsedList(mySessions);
  const weeks = useMemo(() => barBucketsForPeriod(sessions, chartPeriod, metric), [sessions, chartPeriod, metric]);
  const chartSince = useMemo(() => periodCutoff(chartPeriod), [chartPeriod]);
  const radarValues = useMemo(() => muscleSplit(sessions, 'You', chartSince), [sessions, chartSince]);

  const activeMetric = METRICS.find((m) => m.id === metric)!;
  const { current: periodValue, previous: periodPrev } = useMemo(
    () => periodTotal(sessions, chartPeriod, metric),
    [sessions, chartPeriod, metric],
  );
  const delta = periodPrev ? Math.round(((periodValue - periodPrev) / periodPrev) * 100) : 0;
  const up = delta >= 0;

  // Real account signup date, not the oldest logged workout — the latter is
  // wrong for anyone who's imported historical data via the Hevy CSV import.
  const { createdAt } = useAuthState();
  const memberSinceYear = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();

  return (
    <div className="screen">
      <div className="top top-row">
        <div>
          <div className="eyebrow">Profile</div>
          <div className="h1" style={{ fontSize: 30 }}>You</div>
        </div>
        <InstallCard />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="info-btn" aria-label="Friends" onClick={openFriends} style={{ width: 38, height: 38 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </button>
          <button className="info-btn" aria-label="Settings" onClick={openSettings} style={{ width: 38, height: 38, fontSize: 17 }}>
            ⚙
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 6 }}>
        <div
          className="av round"
          style={{ width: 58, height: 58, fontSize: 23, background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Y
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, lineHeight: 1 }}>Your account</div>
          <div style={{ fontSize: 12, color: '#8b8e94', marginTop: 2 }}>
            Member since {memberSinceYear} · {mySessions.length} workouts
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat-tile">
          <div className="n">{mySessions.length}</div>
          <div className="l">Workouts</div>
        </div>
        <div className="stat-tile">
          <div className="n">
            {formatTrainingVolume(toDisplayWeight(totalVolume, units)).main}
            {formatTrainingVolume(toDisplayWeight(totalVolume, units)).suffix}
          </div>
          <div className="l">{units} lifted</div>
        </div>
        <div className="stat-tile">
          <div className="n" style={{ color: 'var(--accent)' }}>{records.length}</div>
          <div className="l">Records</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="chart-head">
          <div>
            <div className="eyebrow">{STAT_PERIOD_LABEL[chartPeriod]} · {activeMetric.label.toLowerCase()}</div>
            <div className="chart-big">
              {Math.round(metric === 'volume' ? toDisplayWeight(periodValue, units) : periodValue).toLocaleString('en-US')}{' '}
              {activeMetric.unit && <span>{activeMetric.unit}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {periodPrev !== null && periodPrev > 0 && (
              <div className={`delta ${up ? 'up' : 'down'}`}>
                {up ? '▲' : '▼'} {Math.abs(delta)}%
              </div>
            )}
            <PeriodPicker value={chartPeriod} onChange={setChartPeriod} />
          </div>
        </div>
        <BarChart weeks={weeks} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 12 }}>
          <span>{weeks[0]?.label}</span>
          <span>{weeks[Math.floor(weeks.length / 2)]?.label}</span>
          <span>Now</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {METRICS.map((m) => (
            <button
              key={m.id}
              aria-pressed={metric === m.id}
              onClick={() => setMetric(m.id)}
              style={{
                flex: 1,
                fontFamily: 'var(--font-display)',
                fontWeight: metric === m.id ? 800 : 700,
                fontSize: 12,
                background: metric === m.id ? 'var(--accent)' : 'var(--surface-2)',
                color: metric === m.id ? 'var(--accent-ink)' : 'var(--faint)',
                border: 'none',
                borderRadius: 8,
                padding: '7px 0',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-h">Training days</div>
      <div className="card">
        <TrainingCalendar sessions={sessions} onOpen={openWorkoutSheet} />
      </div>

      <div className="section-h">Muscle split</div>
      <div className="card" style={{ textAlign: 'center' }}>
        <RadarChart values={radarValues} labels={MUSCLE_AXES} />
        <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>
          Based on logged sets · {STAT_PERIOD_LABEL[chartPeriod].toLowerCase()}
        </div>
      </div>

      <div className="section-h">Personal records</div>
      {records.length === 0 && <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>Finish a workout to set your first record.</p>}
      {recordsList.visible.map((r) => {
        const ex = exerciseById(r.exerciseId);
        if (!ex) return null;
        return (
          <div
            className="rec"
            key={r.exerciseId}
            role="button"
            tabIndex={0}
            onClick={() => openDetail(r.exerciseId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openDetail(r.exerciseId);
            }}
          >
            <Thumb className="ph" src={ex.image} alt={ex.name} />
            <div className="rec-b">
              <div className="rec-name">{ex.name}</div>
              <div className="rec-sub">Best set: {formatWeight(r.maxWeight, units)} {units} × {r.maxWeightReps}</div>
            </div>
            <div className="rec-val">
              {r.maxWeight > 0 ? (
                <>
                  <div className="n">{Math.round(toDisplayWeight(r.estOneRepMax, units))}</div>
                  <div className="u">est. 1RM</div>
                </>
              ) : (
                <>
                  <div className="n">{r.maxWeightReps}</div>
                  <div className="u">best reps</div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <ShowMoreButton hiddenCount={recordsList.hiddenCount} expanded={recordsList.expanded} onToggle={recordsList.toggle} />

      <div className="section-h">History</div>
      {mySessions.length === 0 && (
        <div className="empty-state">
          <p>Your finished workouts will show up here.</p>
        </div>
      )}
      {historyList.visible.map((h) => (
        <div
          className="hist-row"
          key={h.id}
          role="button"
          tabIndex={0}
          onClick={() => openWorkoutSheet(h.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') openWorkoutSheet(h.id);
          }}
        >
          <div className="hist-b">
            <div className="hist-name">{h.name}</div>
            <div className="hist-date">
              {relativeDate(h.startedAt)} · {formatDuration(h.durationMin)} · {setsCountOf(h.entries)} sets
            </div>
          </div>
          <div className="hist-vol">{Math.round(toDisplayWeight(volumeOf(h.entries), units))} {units}</div>
          <span className="go-arrow">›</span>
        </div>
      ))}
      <ShowMoreButton hiddenCount={historyList.hiddenCount} expanded={historyList.expanded} onToggle={historyList.toggle} />
    </div>
  );
}
