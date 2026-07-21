import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { formatDuration, relativeDate, setsCountOf, volumeOf } from '../../lib/records';
import { toDisplayWeight } from '../../lib/units';
import { useCollapsedList } from '../../lib/useCollapsedList';
import { ShowMoreButton } from '../../components/ShowMoreButton';

export function ImportPreviewSheet() {
  const preview = useStore((s) => s.importPreview);
  const units = useStore((s) => s.settings.units);
  const confirmImport = useStore((s) => s.confirmImport);
  const cancelImportPreview = useStore((s) => s.cancelImportPreview);

  // Most recent workout first, matching how history reads everywhere else in the app.
  const sessionsNewestFirst = useMemo(
    () => (preview ? [...preview.sessions].sort((a, b) => b.startedAt - a.startedAt) : []),
    [preview],
  );

  const routinesList = useCollapsedList(preview?.routines ?? []);
  const sessionsList = useCollapsedList(sessionsNewestFirst);

  if (!preview) return null;
  const { routines, sessions, unmatchedNames, isCsv } = preview;

  const totalSets = sessions.reduce((a, s) => a + setsCountOf(s.entries), 0);
  const totalVolume = sessions.reduce((a, s) => a + volumeOf(s.entries), 0);

  return (
    <div className="sheet-in">
      <div className="sheet-h">Import preview</div>
      <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        {isCsv ? 'From your Hevy export.' : 'From this backup file.'} Review what's coming in below — importing replaces all current routines and workout history.
      </p>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="n">{sessions.length}</div>
          <div className="l">Workouts</div>
        </div>
        <div className="stat-tile">
          <div className="n">{totalSets}</div>
          <div className="l">Sets</div>
        </div>
        <div className="stat-tile">
          <div className="n">{Math.round(toDisplayWeight(totalVolume, units) / 1000)}k</div>
          <div className="l">{units} lifted</div>
        </div>
      </div>

      {unmatchedNames.length > 0 && (
        <div className="import-note" style={{ marginTop: 14 }}>
          {unmatchedNames.length} exercise{unmatchedNames.length === 1 ? '' : 's'} couldn't be matched to FitFlow's library and will be
          skipped: {unmatchedNames.slice(0, 6).join(', ')}
          {unmatchedNames.length > 6 ? `, +${unmatchedNames.length - 6} more` : ''}.
        </div>
      )}

      <div className="section-h" style={{ marginTop: 18 }}>
        Routines ({routines.length})
      </div>
      {routinesList.visible.map((r) => (
        <div className="hist-row" key={r.id}>
          <div className="hist-b">
            <div className="hist-name">{r.name}</div>
            <div className="hist-date">{r.exerciseIds.length} exercises</div>
          </div>
        </div>
      ))}
      <ShowMoreButton hiddenCount={routinesList.hiddenCount} expanded={routinesList.expanded} onToggle={routinesList.toggle} />

      <div className="section-h" style={{ marginTop: 14 }}>
        Workout history ({sessions.length})
      </div>
      {sessionsList.visible.map((s) => (
        <div className="hist-row" key={s.id}>
          <div className="hist-b">
            <div className="hist-name">{s.name}</div>
            <div className="hist-date">
              {relativeDate(s.startedAt)} · {formatDuration(s.durationMin)} · {setsCountOf(s.entries)} sets
            </div>
          </div>
          <div className="hist-vol">
            {Math.round(toDisplayWeight(volumeOf(s.entries), units))} {units}
          </div>
        </div>
      ))}
      <ShowMoreButton hiddenCount={sessionsList.hiddenCount} expanded={sessionsList.expanded} onToggle={sessionsList.toggle} />

      <div className="sheet-footer">
        <button className="btn danger" onClick={confirmImport}>
          Import {sessions.length} workout{sessions.length === 1 ? '' : 's'}
        </button>
        <button className="btn sec" style={{ marginTop: 8 }} onClick={cancelImportPreview}>
          Cancel
        </button>
      </div>
    </div>
  );
}
