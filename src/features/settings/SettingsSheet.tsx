import { useRef } from 'react';
import { useStore, type Tab } from '../../store/useStore';
import { ACCENT_PRESETS, type AccentPreset } from '../../lib/settings';
import { REST_PRESETS, formatRest } from '../../lib/rest';
import { useAuthState, signOut } from '../../lib/auth';

const TAB_OPTIONS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'train', label: 'Train' },
  { id: 'stats', label: 'Stats' },
  { id: 'you', label: 'You' },
];

const ACCENT_ORDER: AccentPreset[] = ['mint', 'blue', 'teal', 'violet', 'pink', 'red', 'orange', 'yellow'];

export function SettingsSheet() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const clearAllData = useStore((s) => s.clearAllData);
  const deleteAccount = useStore((s) => s.deleteAccount);
  const fileRef = useRef<HTMLInputElement>(null);
  const { email } = useAuthState();

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
      <button className="btn sec" onClick={() => void signOut()}>
        Sign out
      </button>

      <div className="section-h">
        Units &amp; format
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Weight unit</div>
        <div className="seg" style={{ width: 110 }}>
          <button className={settings.units === 'kg' ? 'on' : ''} onClick={() => updateSettings({ units: 'kg' })}>
            Kg
          </button>
          <button className={settings.units === 'lb' ? 'on' : ''} onClick={() => updateSettings({ units: 'lb' })}>
            Lb
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Week starts on</div>
        <div className="seg" style={{ width: 130 }}>
          <button className={settings.weekStart === 'mon' ? 'on' : ''} onClick={() => updateSettings({ weekStart: 'mon' })}>
            Mon
          </button>
          <button className={settings.weekStart === 'sun' ? 'on' : ''} onClick={() => updateSettings({ weekStart: 'sun' })}>
            Sun
          </button>
        </div>
      </div>

      <div className="section-h">Training defaults</div>
      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div className="settings-row-label">Default rest timer</div>
        <div className="rest-menu-grid" style={{ marginBottom: 0 }}>
          <button className={`rest-chip${settings.defaultRestSeconds === null ? ' on' : ''}`} onClick={() => updateSettings({ defaultRestSeconds: null })}>
            Off
          </button>
          {REST_PRESETS.map((s) => (
            <button
              key={s}
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
            <button key={t.id} className={settings.defaultTab === t.id ? 'on' : ''} onClick={() => updateSettings({ defaultTab: t.id })}>
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
      <SettingsSwitchRow
        label="Vibrate when a set is checked off"
        checked={settings.hapticsOnSetComplete}
        onChange={(v) => updateSettings({ hapticsOnSetComplete: v })}
      />
      <SettingsSwitchRow
        label="Sound when rest timer ends"
        checked={settings.restTimerSound}
        onChange={(v) => updateSettings({ restTimerSound: v })}
      />

      <div className="section-h">Appearance</div>
      <div className="settings-row">
        <div className="settings-row-label">Theme</div>
        <div className="seg" style={{ width: 110 }}>
          <button className={settings.theme === 'dark' ? 'on' : ''} onClick={() => updateSettings({ theme: 'dark' })}>
            Dark
          </button>
          <button className={settings.theme === 'light' ? 'on' : ''} onClick={() => updateSettings({ theme: 'light' })}>
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
      <button className="btn sec" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
        Import data
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
      <button className="btn danger" style={{ marginTop: 8 }} onClick={clearAllData}>
        Clear all data
      </button>

      <div className="section-h">Danger zone</div>
      <div className="settings-row-desc" style={{ padding: '0 2px 8px' }}>
        Permanently deletes your account, not just your data. This can't be undone.
      </div>
      <button className="btn danger" onClick={deleteAccount}>
        Delete account
      </button>

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
