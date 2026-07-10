import { useStore } from '../store/useStore';

export function ConfirmDialog() {
  const dialog = useStore((s) => s.dialog);
  const resolveDialog = useStore((s) => s.resolveDialog);
  const show = !!dialog;

  return (
    <>
      <div className={`scrim dialog-scrim${show ? ' show' : ''}`} onClick={() => resolveDialog(false)} />
      <div className={`dialog${show ? ' show' : ''}`}>
        {dialog && (
          <>
            <div className="dlg-msg">{dialog.message}</div>
            <button className={`btn${dialog.danger ? ' danger' : ''}`} onClick={() => resolveDialog(true)}>
              {dialog.yesLabel}
            </button>
            <button className="btn sec" style={{ marginTop: 8 }} onClick={() => resolveDialog(false)}>
              {dialog.cancelLabel}
            </button>
          </>
        )}
      </div>
    </>
  );
}
