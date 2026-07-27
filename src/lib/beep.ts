let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx ??= new AudioCtx();
    return ctx;
  } catch {
    return null;
  }
}

// Must be called from inside a real user-gesture handler (a tap), which is
// the only moment iOS Safari lets an AudioContext leave the "suspended"
// state it's born in. Without this, the rest-timer beep — created and
// started from a setTimeout callback, which is *not* a gesture — plays into
// a suspended context and is silently inaudible on iOS. Cheap and
// idempotent, so it's safe to call on every set toggle.
export function unlockAudio(): void {
  const c = audioContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
}

// A short rising three-tone pattern rather than a single blip: it has to cut
// through a gym and be recognisable from a pocket, and on iOS it's the only
// alert channel available at all (no Vibration API — see canVibrate).
const TONES: { freq: number; at: number; len: number }[] = [
  { freq: 660, at: 0, len: 0.12 },
  { freq: 880, at: 0.16, len: 0.12 },
  { freq: 1175, at: 0.32, len: 0.22 },
];

// Peak gain at full volume. The user's setting scales this; the phone's own
// media volume then scales the result, so this can only ever make the chime
// quieter than the device is already playing.
const PEAK_GAIN = 0.25;
// exponentialRampToValueAtTime can't target zero, and ramping to something
// below the 0.001 floor we start from is pointless — anything this quiet is
// treated as silent instead.
const MIN_AUDIBLE_GAIN = 0.002;

export function playBeep(volume = 1): void {
  try {
    const peak = PEAK_GAIN * Math.min(1, Math.max(0, volume));
    if (peak < MIN_AUDIBLE_GAIN) return;
    const c = audioContext();
    if (!c) return;
    // The context can be suspended again by the OS (backgrounding the PWA,
    // an interrupting call), so re-check every time rather than only once.
    if (c.state === 'suspended') void c.resume().catch(() => {});
    const start = c.currentTime;
    for (const t of TONES) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = t.freq;
      const t0 = start + t.at;
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + t.len);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + t.len + 0.02);
    }
  } catch {
    // Audio unavailable — silently skip.
  }
}
