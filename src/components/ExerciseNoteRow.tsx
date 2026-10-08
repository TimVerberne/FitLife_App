import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { NOTE_MAX_LENGTH } from '../lib/exerciseNotes';

// A sticky cue attached to the exercise, shown every time it comes round
// again. Deliberately inline rather than behind a sheet: it's written and
// read mid-set, and anything that covers the screen in the middle of a
// workout is something you stop using.
export function ExerciseNoteRow({ exerciseId }: { exerciseId: string }) {
  const note = useStore((s) => s.exerciseNotes.get(exerciseId));
  const setExerciseNote = useStore((s) => s.setExerciseNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Reopening on a different exercise, or picking up an edit made on
  // another device, must not leave a stale draft in the box.
  useEffect(() => {
    if (!editing) setDraft(note ?? '');
  }, [note, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft.trim() !== (note ?? '')) setExerciseNote(exerciseId, draft);
  }

  if (editing) {
    return (
      <div className="ex-note editing">
        <textarea
          ref={ref}
          className="ex-note-input"
          value={draft}
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="e.g. keep elbows tucked, seat height 4"
          onChange={(e) => setDraft(e.target.value)}
          // Saved on blur rather than behind a Save button — one less tap
          // while you're mid-workout, and tapping away is what people do.
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(note ?? '');
              setEditing(false);
            }
          }}
        />
        <button type="button" className="ex-note-done" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
          Done
        </button>
      </div>
    );
  }

  if (!note) {
    return (
      <button type="button" className="ex-note-add" onClick={() => setEditing(true)}>
        ✎ Add note
      </button>
    );
  }

  return (
    <button
      type="button"
      className="ex-note"
      aria-label={`Edit note: ${note}`}
      onClick={() => setEditing(true)}
    >
      <span className="ex-note-mark" aria-hidden="true">✎</span>
      <span className="ex-note-text">{note}</span>
    </button>
  );
}
