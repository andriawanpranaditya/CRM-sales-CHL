import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { judulOther } from '@/lib/judul-link';
import OtherForm from '@/components/publik/OtherForm';

export const dynamic = 'force-dynamic';

// Judul & pratinjau link (WhatsApp / browser): "Sales Channel Bio District"
export async function generateMetadata({ params }) {
  let project = '';
  try { const r = await db()`SELECT project FROM other_link WHERE token = ${params.token} AND aktif = true LIMIT 1`; project = r[0]?.project || ''; } catch {}
  const judul = project ? judulOther(project) : 'Sales Channel';
  const h = headers(); const asal = `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`;
  const ket = 'Input Reserved / Booking dari internal employee & external — PT Cipta Harmoni Lestari';
  return { title: judul, description: ket, openGraph: { title: judul, description: ket, siteName: 'PT Cipta Harmoni Lestari', images: [{ url: asal + '/apple-touch-icon.png' }] }, robots: { index: false } };
}
export default function Page({ params }) { return <OtherForm token={params.token} />; }
