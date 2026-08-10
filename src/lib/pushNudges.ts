import { supabase, getCurrentUserId } from './supabase';

const FIRST_DELAY_MS = 60 * 1000;

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Chrome/Firefox/Edge support Web Push in a regular tab, but iOS only
// delivers push to an installed (standalone) home-screen app — a Safari or
// Chrome-for-iOS *tab* exposes the same PushManager/Notification APIs but
// can't actually receive anything, so it needs its own explicit check.
export function isPushCapable(): boolean {
  if (!('serviceWorker' in navigator) || typeof PushManager === 'undefined' || typeof Notification === 'undefined') return false;
  if (isIos() && !isStandalone()) return false;
  return true;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export type EnablePushResult = 'ok' | 'denied' | 'unavailable' | 'error';

// Subscribes this device to Web Push and registers the subscription. ONE
// subscription serves every notification type — the browser permission is a
// single per-origin grant, so there is nothing per-type to subscribe to.
// Which types actually send is decided by the app's own settings, checked
// server-side by the dispatcher.
export async function enablePush(): Promise<EnablePushResult> {
  if (!isPushCapable()) return 'unavailable';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error('Missing VITE_VAPID_PUBLIC_KEY — cannot subscribe to push.');
        return 'error';
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    const userId = getCurrentUserId();
    if (!userId) return 'error';
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return 'error';
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: 'endpoint' });
    if (error) throw error;
    return 'ok';
  } catch (err) {
    console.error('Failed to enable push notifications', err);
    return 'error';
  }
}

// Tears the subscription down entirely, so it must only be called once
// EVERY push type is off (see SettingsSheet's togglePushType). Calling it
// while another type is still enabled would silently kill that one too —
// which is exactly what turning workout nudges off used to do.
export async function teardownPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  } catch (err) {
    console.error('Failed to disable push notifications', err);
  }
}

// Arm/disarm write directly to the user's own active_nudges row (RLS-scoped,
// no server round trip beyond the write itself) — the dispatcher Edge
// Function, running separately on a cron tick, is what actually notices a
// due row and sends the push. See supabase/functions/nudge-dispatcher.
export async function armNudge(sessionName: string, setsLogged: number, maxNudges: number): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('active_nudges').upsert({
      user_id: userId,
      session_name: sessionName,
      sets_logged: setsLogged,
      next_fire_at: new Date(Date.now() + FIRST_DELAY_MS).toISOString(),
      nudges_sent: 0,
      max_nudges: maxNudges,
    });
    if (error) throw error;
  } catch (err) {
    console.error('Failed to arm workout nudge', err);
  }
}

export async function disarmNudge(): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('active_nudges').delete().eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('Failed to disarm workout nudge', err);
  }
}
