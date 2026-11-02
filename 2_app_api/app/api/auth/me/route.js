import { getUserSegar } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await getUserSegar();
  if (!u) return Response.json({ error: 'Belum login' }, { status: 401 });
  return Response.json({ id: u.id, username: u.username, name: u.name, role: u.role });
}
