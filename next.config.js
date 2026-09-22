/** @type {import('next').NextConfig} */
// Versi aplikasi = commit Vercel (atau waktu build) — dipakai service worker untuk membuang cache lama otomatis
const APP_VER = (process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 10);
module.exports = { reactStrictMode: true, env: { NEXT_PUBLIC_APP_VER: APP_VER } };
