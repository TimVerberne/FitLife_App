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
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'FitFlow', {
      body: payload.body ?? '',
      icon: iconUrl,
      badge: iconUrl,
      tag: 'workout-nudge',
    }),
  );
});

// Tapping the notification focuses the already-open app (which restores the
// active session from Dexie on load if it isn't already showing it) instead
// of always opening a fresh tab on top of an existing one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = allClients.find((c) => c.url.startsWith(scope));
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow(scope);
      }
    })(),
  );
});
