import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById } from '../lib/exercises';
import {
  MUSCLE_AXES,
  muscleSplit,
  personalRecords,
  relativeDate,
  setsCountOf,
  trainingHeatmap,
  volumeOf,
  weeklyMetric,
  type WeeklyMetric,
} from '../lib/records';
import { BarChart } from '../components/BarChart';
import { RadarChart } from '../components/RadarChart';
import { TrainingHeatmap } from '../components/TrainingHeatmap';
import { Thumb } from '../components/Thumb';

const METRICS: { id: WeeklyMetric; label: string; unit: string }[] = [
  { id: 'volume', label: 'Volume', unit: 'kg' },
  { id: 'duration', label: 'Duration', unit: 'min' },
  { id: 'reps', label: 'Reps', unit: '' },
];

export function ProfileScreen() {
  const sessions = useStore((s) => s.sessions);
  const openWorkoutSheet = useStore((s) => s.openWorkoutSheet);
  const [metric, setMetric] = useState<WeeklyMetric>('volume');
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const mySessions = useMemo(() => sessions.filter((s) => s.person === 'You').sort((a, b) => b.startedAt - a.startedAt), [sessions]);
  const totalVolume = useMemo(() => mySessions.reduce((a, h) => a + volumeOf(h.entries), 0), [mySessions]);
  const records = useMemo(() => personalRecords(sessions), [sessions]);
  const weeks = useMemo(() => weeklyMetric(sessions, 12, metric), [sessions, metric]);
  const radarValues = useMemo(() => muscleSplit(sessions), [sessions]);
  const heatmapWeeks = useMemo(() => trainingHeatmap(sessions, 16), [sessions]);

  const activeMetric = METRICS.find((m) => m.id === metric)!;
  const thisWeek = weeks[weeks.length - 1]?.value ?? 0;
  const lastWeek = weeks[weeks.length - 2]?.value ?? 0;
  const delta = lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;
  const up = delta >= 0;

  const oldestSessionYear = mySessions.length > 0 ? new Date(mySessions[mySessions.length - 1].startedAt).getFullYear() : new Date().getFullYear();

  return (
    <div className="screen">
      <div className="top">
        <div className="eyebrow">Profile</div>
        <div className="h1" style={{ fontSize: 30 }}>You</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 6 }}>
        <div
          className="av round"
          style={{ width: 58, height: 58, fontSize: 23, background: 'linear-gradient(135deg,#74e0ae,#4fae82)', color: '#0a0b0a' }}
        >
          Y
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, lineHeight: 1 }}>Your account</div>
          <div style={{ fontSize: 12, color: '#8b8e94', marginTop: 2 }}>
            Member since {oldestSessionYear} · {mySessions.length} workouts
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat-tile">
          <div className="n">{mySessions.length}</div>
          <div className="l">Workouts</div>
        </div>
        <div className="stat-tile">
          <div className="n">{Math.round(totalVolume / 1000)}k</div>
          <div className="l">kg lifted</div>
        </div>
        <div className="stat-tile">
          <div className="n" style={{ color: 'var(--accent)' }}>{records.length}</div>
          <div className="l">Records</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="chart-head">
          <div>
            <div className="eyebrow">This week · {activeMetric.label.toLowerCase()}</div>
            <div className="chart-big">
              {Math.round(thisWeek).toLocaleString('en-US')} {activeMetric.unit && <span>{activeMetric.unit}</span>}
            </div>
          </div>
          {lastWeek > 0 && (
            <div className={`delta ${up ? 'up' : 'down'}`}>
              {up ? '▲' : '▼'} {Math.abs(delta)}%
            </div>
          )}
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
        <TrainingHeatmap weeks={heatmapWeeks} />
      </div>

      <div className="section-h">Muscle split</div>
      <div className="card" style={{ textAlign: 'center' }}>
        <RadarChart values={radarValues} labels={MUSCLE_AXES} />
        <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>Based on logged sets · last {mySessions.length} workouts</div>
      </div>

      <div className="section-h">Personal records</div>
      {records.length === 0 && <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>Finish a workout to set your first record.</p>}
      {(showAllRecords ? records : records.slice(0, 5)).map((r) => {
        const ex = exerciseById(r.exerciseId);
        if (!ex) return null;
        return (
          <div className="rec" key={r.exerciseId}>
            <Thumb className="ph" src={ex.image} alt={ex.name} />
            <div className="rec-b">
              <div className="rec-name">{ex.name}</div>
              <div className="rec-sub">Best set: {r.maxWeight} kg × {r.maxWeightReps}</div>
            </div>
            <div className="rec-val">
              <div className="n">{Math.round(r.estOneRepMax)}</div>
              <div className="u">est. 1RM</div>
            </div>
          </div>
        );
      })}
      {records.length > 5 && (
        <button className="feed-more" onClick={() => setShowAllRecords((v) => !v)}>
          {showAllRecords ? 'Show less' : `Show ${records.length - 5} more`}
        </button>
      )}

      <div className="section-h">History</div>
      {mySessions.length === 0 && (
        <div className="empty-state">
          <p>Your finished workouts will show up here.</p>
        </div>
      )}
      {(showAllHistory ? mySessions : mySessions.slice(0, 5)).map((h) => (
        <div className="hist-row" key={h.id} onClick={() => openWorkoutSheet(h.id)}>
          <div className="hist-b">
            <div className="hist-name">{h.name}</div>
            <div className="hist-date">
              {relativeDate(h.startedAt)} · {h.durationMin} min · {setsCountOf(h.entries)} sets
            </div>
          </div>
          <div className="hist-vol">{Math.round(volumeOf(h.entries))} kg</div>
          <span className="go-arrow">›</span>
        </div>
      ))}
      {mySessions.length > 5 && (
        <button className="feed-more" onClick={() => setShowAllHistory((v) => !v)}>
          {showAllHistory ? 'Show less' : `Show ${mySessions.length - 5} more`}
        </button>
      )}
    </div>
  );
}
