import { RelativeStrengthCard } from './RelativeStrengthCard';

export function StrengthDetailSheet() {
  return (
    <div className="sheet-in">
      <div className="sheet-h">Relative strength</div>
      <RelativeStrengthCard limit={null} />
    </div>
  );
}
