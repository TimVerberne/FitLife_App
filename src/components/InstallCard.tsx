import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

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
// the You tab (where this pill lives) is mounted yet. So this has to be
// captured at module scope, not inside the component's effect, or we'd miss
// the event entirely on every visit that doesn't start on that tab.
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

// Android/Chrome can trigger the native install dialog directly. iOS Safari
// never fires beforeinstallprompt at all — the only install path there is
// the manual Share sheet — so tapping the pill just reveals those
// instructions instead of doing anything itself.
export function InstallCard() {
  const currentPlatform = useSyncExternalStore(subscribe, getSnapshot);
  const [showTip, setShowTip] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showTip) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowTip(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [showTip]);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    platform = null;
    notify();
  }

  function onClick() {
    if (currentPlatform === 'android') void install();
    else setShowTip((v) => !v);
  }

  if (!currentPlatform) return null;

  return (
    <div className="install-pill-wrap" ref={wrapRef}>
      <button className="install-pill" onClick={onClick}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        Install
      </button>
      {showTip && currentPlatform === 'ios' && (
        <div className="install-tip">
          Tap <b>⬆ Share</b>, then "Add to Home Screen" for quicker access and offline workouts.
        </div>
      )}
    </div>
  );
}
