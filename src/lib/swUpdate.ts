import { registerSW } from 'virtual:pwa-register';
import { useStore } from '../store/useStore';
import { throttleOnFocus } from './focusThrottle';

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
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // The browser's own "check for a new service worker" logic is tied to
      // page navigation — which barely happens for a standalone home-screen
      // app, since reopening the icon doesn't always count as a fresh
      // navigation the way it reliably would in a normal browser tab. iOS in
      // particular is known to sit on a stale cached app shell for a long
      // time otherwise. Force a check whenever the app regains focus (i.e.
      // every time it's actually reopened), plus a periodic backstop for
      // sessions left open continuously.
      function checkForUpdate() {
        void registration!.update();
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') throttleOnFocus('sw-update-check', 30_000, checkForUpdate);
      });
      setInterval(checkForUpdate, 60 * 60 * 1000);
    },
  });
  useStore.subscribe(reloadIfSafe);
}
