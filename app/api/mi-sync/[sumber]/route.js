import { GET as tarik } from '../route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Alias untuk Vercel Cron: /api/mi-sync/web · /instagram · /meta · /meta-rinci
export async function GET(req, { params }) {
  const u = new URL(req.url);
  u.pathname = '/api/mi-sync';
  u.searchParams.set('sumber', params.sumber);
  return tarik(new Request(u, { headers: req.headers }));
}
