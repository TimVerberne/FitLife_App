import { registerSW } from 'virtual:pwa-register';
import { useStore } from '../store/useStore';

// With registerType: 'autoUpdate', a new service worker activates itself as
// soon as it's installed. Without an onNeedReload handler, vite-plugin-pwa's
// default behavior is an unconditional window.location.reload() the moment
// that happens — which, mid-workout, would silently wipe the in-progress
// session (it's pure in-memory Zustand state until finishSession() writes it
// to Dexie). Providing onNeedReload takes over that responsibility entirely:
// defer the reload until there's no active session, then apply it
// automatically the instant one ends (finished or discarded).
let pendingReload = false;

function reloadIfSafe() {
  if (pendingReload && !useStore.getState().active) {
    window.location.reload();
  }
}

export function initServiceWorkerUpdate(): void {
  registerSW({
    immediate: true,
    onNeedReload() {
      pendingReload = true;
      if (useStore.getState().active) {
        useStore.getState().showToast('Update ready — applying after this workout');
      } else {
        reloadIfSafe();
      }
    },
  });
  useStore.subscribe(reloadIfSafe);
}
