'use client';
import { useEffect, useState } from 'react';
import { api } from '@/components/util';
import { TargetManager } from '@/components/TargetSales';

export default function TargetPage() {
  const [me, setMe] = useState(null);
  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); }, []);
  if (!me) return <div className="loading">Memuat…</div>;
  if (me.role !== 'manager') return <div className="card"><h2>Target Sales</h2><p className="hint">Menu ini khusus Manager.</p></div>;
  return (<>
    <div className="page-head"><div><h1>Target Sales</h1><div className="sub">Target bulanan berlaku sama untuk semua sales · bisa diubah Manager kapan saja</div></div></div>
    <TargetManager me={me} />
  </>);
}
