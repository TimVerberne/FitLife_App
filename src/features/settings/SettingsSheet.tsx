import { useEffect, useRef, useState } from 'react';
import { useStore, type Tab } from '../../store/useStore';
import { ACCENT_PRESETS, type AccentPreset } from '../../lib/settings';
import { REST_PRESETS, formatRest } from '../../lib/rest';
import { useAuthState, signOut } from '../../lib/auth';
import { enableNudges, disableNudges, isPushCapable } from '../../lib/pushNudges';
import { fetchOwnProfile, updateOwnDisplayName } from '../../lib/friends';
import { playBeep, unlockAudio } from '../../lib/beep';
import { canVibrate, vibrate, REST_END_PATTERN } from '../../lib/haptics';

const TAB_OPTIONS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'train', label: 'Train' },
  { id: 'stats', label: 'Stats' },
  { id: 'life', label: 'Life' },
  { id: 'you', label: 'You' },
];

const ACCENT_ORDER: AccentPreset[] = ['mint', 'blue', 'teal', 'violet', 'pink', 'red', 'orange', 'yellow'];

export function SettingsSheet() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const importing = useStore((s) => s.importing);
  const clearAllData = useStore((s) => s.clearAllData);
  const deleteAccount = useStore((s) => s.deleteAccount);
  const showToast = useStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const { email } = useAuthState();
  const [pushError, setPushError] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [savedDisplayName, setSavedDisplayName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOwnProfile()
      .then((profile) => {
        if (cancelled || !profile) return;
        setDisplayName(profile.displayName ?? '');
        setSavedDisplayName(profile.displayName ?? '');
      })
      .catch((err: unknown) => console.error('Failed to load display name', err));
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveDisplayName() {
    setSavingName(true);
    try {
      await updateOwnDisplayName(displayName);
      setSavedDisplayName(displayName.trim());
    } catch (err) {
      console.error('Failed to save display name', err);
      showToast("Couldn't save — try again");
    } finally {
      setSavingName(false);
    }
  }

  const pushCapable = isPushCapable();
  const pushBlocked = pushCapable && typeof Notification !== 'undefined' && Notification.permission === 'denied';
  // iPhone has no Vibration API at all, so both vibration toggles below are
  // dead switches there — say so rather than letting them look functional.
  const vibrateCapable = canVibrate();
  const noVibrateNote = "Vibration isn't available on iPhone — iOS doesn't offer it to web apps, so the rest timer uses sound instead.";

  // `settings.notifyActiveWorkout` is only ever written by this sheet's own
  // toggle, so it can drift from reality — the actual push subscription can
  // be silently dropped by the browser (or permission revoked and later
  // re-granted, which un-blocks `pushBlocked` again without restoring the
  // subscription) with nothing else to notice and flip the flag back off.
  // Reconcile once whenever Settings is opened rather than trusting the
  // stored flag forever.
  useEffect(() => {
    if (!pushCapable || !settings.notifyActiveWorkout || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled && !subscription) updateSettings({ notifyActiveWorkout: false });
      } catch {
        // Best-effort reconciliation only — leave the flag as-is on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleNudges(next: boolean) {
    if (!next) {
      updateSettings({ notifyActiveWorkout: false });
      void disableNudges();
      return;
    }
    setPushError(false);
    const result = await enableNudges();
    if (result === 'ok') updateSettings({ notifyActiveWorkout: true });
    else if (result === 'error') setPushError(true);
    // 'denied' and 'unavailable' leave the toggle off — the row below already
    // explains why (blocked permission or not an installed app).
  }

  return (
    <div className="sheet-in">
      <div className="sheet-h">
        Settings
        <span className="sheet-version">v{__APP_VERSION__}</span>
      </div>

      <div className="section-h" style={{ margin: '4px 2px 4px' }}>
        Account
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">Signed in as</div>
          <div className="settings-row-desc">{email}</div>
        </div>
      </div>
      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <div className="settings-row-label">Display name</div>
        <div className="settings-row-desc">Shown to friends instead of your email username.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={displayName}
            placeholder="Not set"
            style={{ flex: 1 }}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <button
            className="btn sec"
            style={{ width: 'auto', padding: '0 14px' }}
            disabled={savingName || displayName.trim() === (savedDisplayName ?? '')}
            onClick={saveDisplayName}
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <button className="btn sec" style={{ marginTop: 8 }} onClick={() => void signOut()}>
        Sign out
      </button>

      <div className="section-h">
        Units &amp; format
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Weight unit</div>
        <div className="seg" style={{ width: 110 }}>
          <button aria-pressed={settings.units === 'kg'} className={settings.units === 'kg' ? 'on' : ''} onClick={() => updateSettings({ units: 'kg' })}>
            Kg
          </button>
          <button aria-pressed={settings.units === 'lb'} className={settings.units === 'lb' ? 'on' : ''} onClick={() => updateSettings({ units: 'lb' })}>
            Lb
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Week starts on</div>
        <div className="seg" style={{ width: 130 }}>
          <button
            aria-pressed={settings.weekStart === 'mon'}
            className={settings.weekStart === 'mon' ? 'on' : ''}
            onClick={() => updateSettings({ weekStart: 'mon' })}
          >
            Mon
          </button>
          <button
            aria-pressed={settings.weekStart === 'sun'}
            className={settings.weekStart === 'sun' ? 'on' : ''}
            onClick={() => updateSettings({ weekStart: 'sun' })}
          >
            Sun
          </button>
        </div>
      </div>

      <div className="section-h">Training defaults</div>
      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div className="settings-row-label">Default rest timer</div>
        <div className="rest-menu-grid" style={{ marginBottom: 0 }}>
          <button
            aria-pressed={settings.defaultRestSeconds === null}
            className={`rest-chip${settings.defaultRestSeconds === null ? ' on' : ''}`}
            onClick={() => updateSettings({ defaultRestSeconds: null })}
          >
            Off
          </button>
          {REST_PRESETS.map((s) => (
            <button
              key={s}
              aria-pressed={settings.defaultRestSeconds === s}
              className={`rest-chip${settings.defaultRestSeconds === s ? ' on' : ''}`}
              onClick={() => updateSettings({ defaultRestSeconds: s })}
            >
              {formatRest(s)}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Open to tab</div>
        <div className="seg">
          {TAB_OPTIONS.map((t) => (
            <button
              key={t.id}
              aria-pressed={settings.defaultTab === t.id}
              className={settings.defaultTab === t.id ? 'on' : ''}
              onClick={() => updateSettings({ defaultTab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <SettingsSwitchRow
        label="Smart routine rotation"
        desc="Avoid suggesting the same muscle group two days in a row"
        checked={settings.smartRoutineRotation}
        onChange={(v) => updateSettings({ smartRoutineRotation: v })}
      />

      <div className="section-h">Session experience</div>
      <SettingsSwitchRow
        label="Confirm before removing an exercise"
        checked={settings.confirmRemoveExercise}
        onChange={(v) => updateSettings({ confirmRemoveExercise: v })}
      />
      <SettingsSwitchRow
        label="Keep screen awake during a workout"
        checked={settings.keepScreenAwake}
        onChange={(v) => updateSettings({ keepScreenAwake: v })}
      />
      {vibrateCapable && (
        <SettingsSwitchRow
          label="Vibrate when a set is checked off"
          checked={settings.hapticsOnSetComplete}
          onChange={(v) => updateSettings({ hapticsOnSetComplete: v })}
        />
      )}
      <SettingsSwitchRow
        label="Sound when rest timer ends"
        desc="Plays a three-tone chime — test it below"
        checked={settings.restTimerSound}
        onChange={(v) => updateSettings({ restTimerSound: v })}
      />
      {settings.restTimerSound && (
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Chime volume</div>
            <div className="settings-row-desc">
              {settings.restTimerVolume === 0 ? 'Muted' : `${Math.round(settings.restTimerVolume * 100)}% of your phone's volume`}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            aria-label="Rest timer chime volume"
            value={settings.restTimerVolume}
            onChange={(e) => updateSettings({ restTimerVolume: Number(e.target.value) })}
            // Previewed on release rather than on every change: dragging the
            // slider would otherwise fire a chime per step. Both events are
            // wired because a pointer drag ends with pointerup while a
            // keyboard adjustment only ever produces keyup.
            onPointerUp={() => {
              unlockAudio();
              playBeep(settings.restTimerVolume);
            }}
            onKeyUp={() => {
              unlockAudio();
              playBeep(settings.restTimerVolume);
            }}
            style={{ width: 110 }}
          />
        </div>
      )}
      {vibrateCapable && (
        <SettingsSwitchRow
          label="Vibrate when rest timer ends"
          checked={settings.hapticsOnRestEnd}
          onChange={(v) => updateSettings({ hapticsOnRestEnd: v })}
        />
      )}
      {!vibrateCapable && <div className="settings-row-desc" style={{ padding: '0 2px 8px' }}>{noVibrateNote}</div>}
      {/* Testing the alert shouldn't require starting a workout and waiting
          out a rest timer — and tapping this is also a user gesture, so it
          doubles as the iOS audio unlock. */}
      <button
        className="btn sec"
        style={{ marginTop: 8 }}
        onClick={() => {
          unlockAudio();
          if (settings.restTimerSound) playBeep(settings.restTimerVolume);
          if (settings.hapticsOnRestEnd) vibrate(REST_END_PATTERN);
          if (!settings.restTimerSound && !(settings.hapticsOnRestEnd && vibrateCapable)) {
            showToast('Turn on the sound or vibration above first');
          }
        }}
      >
        Test rest timer alert
      </button>

      <div className="section-h">Notifications</div>
      {!pushCapable ? (
        <div className="settings-row-desc" style={{ padding: '0 2px 8px' }}>
          Install FitFlow to your home screen to enable workout reminders — this only works for the installed app, not a browser tab.
        </div>
      ) : (
        <>
          <SettingsSwitchRow
            label="Remind me if I leave an active workout"
            desc={
              pushBlocked
                ? 'Notifications blocked — enable in system settings'
                : pushError
                  ? 'Something went wrong — try again'
                  : undefined
            }
            checked={settings.notifyActiveWorkout && !pushBlocked}
            onChange={(v) => void toggleNudges(v)}
          />
          {settings.notifyActiveWorkout && !pushBlocked && (
            <SettingsSwitchRow
              label="Remind again after 5 minutes"
              checked={settings.notifyActiveWorkoutRepeat}
              onChange={(v) => updateSettings({ notifyActiveWorkoutRepeat: v })}
            />
          )}
        </>
      )}

      <div className="section-h">Appearance</div>
      <div className="settings-row">
        <div className="settings-row-label">Theme</div>
        <div className="seg" style={{ width: 110 }}>
          <button aria-pressed={settings.theme === 'dark'} className={settings.theme === 'dark' ? 'on' : ''} onClick={() => updateSettings({ theme: 'dark' })}>
            Dark
          </button>
          <button aria-pressed={settings.theme === 'light'} className={settings.theme === 'light' ? 'on' : ''} onClick={() => updateSettings({ theme: 'light' })}>
            Light
          </button>
        </div>
      </div>
      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <div className="settings-row-label">Accent color</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {ACCENT_ORDER.map((a) => (
            <button
              key={a}
              aria-label={`${a} accent`}
              aria-pressed={settings.accent === a}
              onClick={() => updateSettings({ accent: a })}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: ACCENT_PRESETS[a].accent,
                border: settings.accent === a ? '2px solid var(--ink)' : '2px solid transparent',
                boxShadow: settings.accent === a ? '0 0 0 2px var(--surface-2)' : 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      <div className="section-h">Data</div>
      <button className="btn sec" onClick={exportData}>
        Export data
      </button>
      <button className="btn sec" style={{ marginTop: 8 }} disabled={importing} onClick={() => fileRef.current?.click()}>
        {importing ? 'Reading file…' : 'Import data'}
      </button>
      <input
        ref={fileRef}
        type="file"
        // Extensions only, no MIME types — several OS/browser file pickers
        // only honor the first recognized MIME type in the list (or don't
        // recognize "text/csv" at all) and silently hide files that don't
        // match it, even though the file itself is a plain-text .csv.
        // Extensions are matched far more consistently across platforms.
        accept=".json,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importData(file);
          e.target.value = '';
        }}
      />
      <div className="section-h">Danger zone</div>
      <div className="settings-row-desc" style={{ padding: '0 2px 8px' }}>
        Both actions below are permanent and can't be undone.
      </div>
      <button className="btn danger" onClick={clearAllData}>
        Clear all data
      </button>
      <button className="btn danger" style={{ marginTop: 8 }} onClick={deleteAccount}>
        Delete account
      </button>
      <div className="settings-row-desc" style={{ padding: '8px 2px 0' }}>
        "Delete account" permanently removes your account itself, not just its data.
      </div>

      <div className="section-h">About</div>
      <div style={{ fontSize: 12, color: 'var(--faint)', lineHeight: 1.6, padding: '0 2px 6px' }}>
        FitFlow · synced to your account, with an offline-friendly local cache
        <br />
        Exercise photos and instructions are © Gym Visual, used under the dataset's educational/non-commercial license.
      </div>
    </div>
  );
}

function SettingsSwitchRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">{label}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      <button className={`switch${checked ? ' on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <span className="switch-knob" />
      </button>
    </div>
  );
}
