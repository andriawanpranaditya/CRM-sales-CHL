import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { judulAgent } from '@/lib/judul-link';
import LaporAgentForm from '@/components/publik/LaporAgentForm';

export const dynamic = 'force-dynamic';

// Judul & pratinjau link (WhatsApp / browser): "Agent Visitor Bio District"
export async function generateMetadata({ params }) {
  let project = '';
  try { const r = await db()`SELECT project FROM agent_link WHERE token = ${params.token} AND aktif = true LIMIT 1`; project = r[0]?.project || ''; } catch {}
  const judul = project ? judulAgent(project) : 'Agent Visitor';
  const h = headers(); const asal = `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`;
  const ket = 'Laporan kunjungan konsumen dari agent — PT Cipta Harmoni Lestari';
  const gambar = asal + (project === 'PERMAI INDAH' ? '/og-permai.jpg' : project === 'BIO DISTRICT' ? '/og-bio.jpg' : '/apple-touch-icon.png');
  return { title: judul, description: ket,
    openGraph: { type: 'website', url: `${asal}/lapor/${params.token}`, title: judul, description: ket, siteName: 'PT Cipta Harmoni Lestari',
      images: [{ url: gambar, width: 1200, height: 630, type: 'image/jpeg', alt: judul }] },
    twitter: { card: 'summary_large_image', title: judul, description: ket, images: [gambar] }, robots: { index: false } };
}
export default function Page({ params }) { return <LaporAgentForm token={params.token} />; }
