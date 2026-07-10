import { useEffect, useRef, useState } from 'react';

const DISMISS_KEY = 'fitflow-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const BANNER_HEIGHT_VAR = '--install-banner-h';

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

// Android/Chrome fires beforeinstallprompt and lets us trigger the native
// install dialog directly. iOS Safari never fires that event at all — the
// only install path there is the manual Share sheet — so it gets its own
// instructional banner instead of a button.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  // The banner is fixed-position (so it can overlay whichever screen the
  // AuthGate happens to be showing), so it doesn't reserve space in normal
  // flow. Push that height into a CSS var that .app-shell pads against,
  // instead of letting it clip the top of every screen's content.
  useEffect(() => {
    const el = bannerRef.current;
    if (!platform || !el) {
      document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, '0px');
      return;
    }
    const setHeight = () => {
      document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, `${el.offsetHeight}px`);
    };
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty(BANNER_HEIGHT_VAR, '0px');
    };
  }, [platform]);

  useEffect(() => {
    if (isStandalone()) return;
    const lastDismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (Date.now() - lastDismissed < DISMISS_COOLDOWN_MS) return;

    if (isIos()) {
      setPlatform('ios');
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setPlatform('android');
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setPlatform(null);
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Dismiss either way — if they said no, respect that for the cooldown
    // window rather than prompting again on the very next screen.
    dismiss();
  }

  if (!platform) return null;

  return (
    <div className="install-banner" ref={bannerRef}>
      <div className="install-banner-text">
        <b>Install FitFlow</b>
        {platform === 'ios' ? (
          <> — tap <span className="install-banner-icon">⬆</span> Share, then "Add to Home Screen"</>
        ) : (
          <> for quicker access and offline workouts</>
        )}
      </div>
      {platform === 'android' && (
        <button className="install-banner-btn" onClick={install}>
          Install
        </button>
      )}
      <button className="install-banner-close" aria-label="Dismiss" onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
