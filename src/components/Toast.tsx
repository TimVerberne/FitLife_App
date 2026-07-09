import { useStore } from '../store/useStore';

export function Toast() {
  const msg = useStore((s) => s.toastMsg);
  return <div className={`toast${msg ? ' show' : ''}`}>{msg}</div>;
}
