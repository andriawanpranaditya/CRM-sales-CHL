import { GET as tarik } from '../route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Alias untuk Vercel Cron: /api/mi-sync/web · /instagram · /instagram-lanjut · /meta · /meta-rinci
export async function GET(req, { params }) {
  const u = new URL(req.url);
  u.pathname = '/api/mi-sync';
  // instagram-lanjut = cron cadangan: melanjutkan postingan Instagram yang tertunda (bila ada) pada hari yang sama
  if (params.sumber === 'instagram-lanjut') { u.searchParams.set('sumber', 'instagram'); u.searchParams.set('lanjut', '1'); }
  else u.searchParams.set('sumber', params.sumber);
  return tarik(new Request(u, { headers: req.headers }));
}
