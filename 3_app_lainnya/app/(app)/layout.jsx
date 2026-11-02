import { redirect } from 'next/navigation';
import { getUserSegar } from '@/lib/auth';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  // Peran diambil dari database, bukan dari sesi, agar perubahan langsung berlaku
  const user = await getUserSegar();
  if (!user) redirect('/login');
  return <Shell user={{ id: user.id, name: user.name, role: user.role, username: user.username }}>{children}</Shell>;
}
