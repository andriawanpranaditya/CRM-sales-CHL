import { redirect } from 'next/navigation';
import { getUser, akunAktif } from '@/lib/auth';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await getUser();
  if (!user) redirect('/login');
  // Akun yang dinonaktifkan/dihapus manager langsung keluar walau sesi 30 harinya belum habis
  if (!(await akunAktif(user))) redirect('/login?nonaktif=1');
  return <Shell user={{ id: user.id, name: user.name, role: user.role, username: user.username }}>{children}</Shell>;
}
