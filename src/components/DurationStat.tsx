import { NumberField } from './NumberField';

// The "minutes" tile from a workout's stat grid, optionally editable in
// place. Same markup as the static tiles beside it so the row stays visually
// even — only the number swaps for an input.
export function DurationStat({
  minutes,
  editable,
  onCommit,
}: {
  minutes: number;
  editable: boolean;
  onCommit: (minutes: number) => void;
}) {
  if (!editable) {
    return (
      <div className="stat-tile">
        <div className="n">{minutes}</div>
        <div className="l">minutes</div>
      </div>
    );
  }
  return (
    <div className="stat-tile editable">
      <div className="n">
        <NumberField
          value={minutes}
          inputMode="numeric"
          ariaLabel="Workout duration in minutes"
          onCommit={onCommit}
        />
      </div>
      <div className="l">minutes</div>
    </div>
  );
}
