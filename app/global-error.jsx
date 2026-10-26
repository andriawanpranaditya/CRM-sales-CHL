'use client';
import PulihError from '@/components/PulihError';

// Penangkap error tingkat paling atas (bila layout utama pun gagal)
export default function GlobalError({ error, reset }) {
  return (
    <html lang="id"><body style={{ margin: 0 }}>
      <PulihError error={error} reset={reset} />
    </body></html>
  );
}
