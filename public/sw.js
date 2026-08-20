// Service worker minimal agar aplikasi memenuhi syarat "Install" di Android.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { /* network langsung — data CRM selalu terbaru */ });
