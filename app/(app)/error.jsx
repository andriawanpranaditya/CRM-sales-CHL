'use client';
import PulihError from '@/components/PulihError';

// Penangkap error untuk semua halaman aplikasi (pengganti layar "Application error")
export default function ErrorHalaman({ error, reset }) {
  return <PulihError error={error} reset={reset} />;
}
