import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

type Platform = 'android' | 'ios' | null;

// Chrome fires beforeinstallprompt once, shortly after load — whether or not
// the You tab (where the install card lives) is mounted yet. So this has to
// be captured at module scope, not inside the component's effect, or we'd
// miss the event entirely on every visit that doesn't start on that tab.
let deferred: BeforeInstallPromptEvent | null = null;
let platform: Platform = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

if (!isStandalone()) {
  if (isIos()) {
    platform = 'ios';
  } else {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
      platform = 'android';
      notify();
    });
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return platform;
}

export function InstallCard() {
  const currentPlatform = useSyncExternalStore(subscribe, getSnapshot);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    platform = null;
    notify();
  }

  if (!currentPlatform) return null;

  return (
    <div className="card install-card">
      <div className="install-card-icon">⬇</div>
      <div className="install-card-body">
        <div className="install-card-title">Install FitFlow</div>
        <div className="install-card-sub">
          {currentPlatform === 'ios' ? (
            <>
              Tap <b>⬆ Share</b>, then "Add to Home Screen" for quicker access and offline workouts.
            </>
          ) : (
            'Add it to your home screen for quicker access and offline workouts.'
          )}
        </div>
      </div>
      {currentPlatform === 'android' && (
        <button className="install-card-btn" onClick={() => void install()}>
          Install
        </button>
      )}
    </div>
  );
}
