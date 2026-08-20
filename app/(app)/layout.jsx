import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await getUser();
  if (!user) redirect('/login');
  return <Shell user={{ id: user.id, name: user.name, role: user.role, username: user.username }}>{children}</Shell>;
}
