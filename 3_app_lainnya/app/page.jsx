import { redirect } from 'next/navigation';
import { getUserSegar } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getUserSegar();
  if (!user) redirect('/login');
  redirect('/beranda');
}
