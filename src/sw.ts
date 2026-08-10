/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

// Switched from vite-plugin-pwa's generateSW (fully auto-generated) to
// injectManifest so this file can add its own push/notificationclick
// handlers alongside the same precaching + runtime-caching rules the
// generated version used to configure via vite.config.ts's `workbox` option.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// registerType: 'autoUpdate' semantics — a new worker takes over immediately
// instead of waiting for every tab to close. swUpdate.ts's onNeedReload
// still owns *when* the page actually reloads (deferred until there's no
// active session), this only controls when the new worker itself installs.
self.skipWaiting();
clientsClaim();

registerRoute(
  /\/exercise-media\/.*\.(jpg|gif)$/,
  new CacheFirst({
    cacheName: 'exercise-media',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 })],
  }),
);

registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/, new CacheFirst({ cacheName: 'google-fonts-stylesheets' }));

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/,
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

// Auth/data calls must never be served stale from the service worker —
// failures here are expected (offline) and handled by the pendingSync queue.
registerRoute(/^https:\/\/[a-z0-9-]+\.supabase\.co\/.*/, new NetworkOnly());

interface NudgePayload {
  title?: string;
  body?: string;
  /** Set on reaction notifications — the workout to open when tapped. */
  sessionId?: string;
}

// lib.webworker.d.ts's NotificationOptions is missing `renotify` even though
// it's a standard, widely-supported option — extend it locally rather than
// casting to `any` at the call site.
interface NotificationOptionsWithRenotify extends NotificationOptions {
  renotify?: boolean;
}

self.addEventListener('push', (event) => {
  let payload: NudgePayload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  const iconUrl = new URL('icon-192.png', self.registration.scope).toString();
  const options: NotificationOptionsWithRenotify = {
    body: payload.body ?? '',
    icon: iconUrl,
    badge: iconUrl,
    // Reaction notifications carry the workout id through to the click
    // handler, and tag per-workout so two different workouts don't collapse
    // into one notification the way repeat nudges deliberately do.
    data: payload.sessionId ? { sessionId: payload.sessionId } : undefined,
    tag: payload.sessionId ? `reactions-${payload.sessionId}` : 'workout-nudge',
    // Without this, the 5-minute follow-up nudge silently replaces the
    // first one in-place (same tag) instead of actually re-alerting — it'd
    // sit there updated but the phone would never buzz or wake the lock
    // screen for it a second time.
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(payload.title ?? 'FitFlow', options));
});

// Tapping the notification focuses the already-open app (which restores the
// active session from Dexie on load if it isn't already showing it) instead
// of always opening a fresh tab on top of an existing one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const sessionId = (event.notification.data as { sessionId?: string } | undefined)?.sessionId;
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = allClients.find((c) => c.url.startsWith(scope));
      if (existing) {
        await existing.focus();
        // The app is already running, so routing to the workout is a message
        // rather than a navigation — reloading would throw away an active
        // session in progress.
        if (sessionId) existing.postMessage({ type: 'open-workout', sessionId });
      } else {
        // Cold start: the page doesn't exist yet to receive a message, so the
        // target rides in on the URL and main.tsx picks it up once the store
        // has loaded. The app has no router, hence a query param rather than
        // a path.
        await self.clients.openWindow(sessionId ? `${scope}?workout=${encodeURIComponent(sessionId)}` : scope);
      }
    })(),
  );
});
