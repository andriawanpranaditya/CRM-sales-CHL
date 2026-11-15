'use client';
// Isian identitas Other Sales: Internal employee (divisi + HP wajib) atau External (HP + foto KTP & NPWP wajib)
import FotoKunjungan from '@/components/FotoKunjungan';

export default function IsianOther({ nilai, onUbah, tanpaPilihan = false }) {
  const o = nilai || {};
  const set = (k, v) => onUbah({ ...o, [k]: v });
  return (<>
    {!tanpaPilihan && <div className="field full"><label>Other Sales <span className="req">*</span></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{['Internal employee', 'External'].map(j =>
        <button type="button" key={j} className={'sort-btn' + (o.jenis === j ? ' active' : '')} onClick={() => set('jenis', j)}>{j}</button>)}</div></div>}
    {o.jenis && <>
      <div className="field"><label>Nama {o.jenis === 'External' ? 'lengkap (sesuai KTP)' : 'karyawan'} <span className="req">*</span></label><input value={o.nama || ''} onChange={e => set('nama', e.target.value)} /></div>
      <div className="field"><label>No. HP <span className="req">*</span></label><input value={o.hp || ''} inputMode="tel" onChange={e => set('hp', e.target.value)} placeholder="08xxxxxxxxxx" /></div>
      {o.jenis === 'Internal employee' && <div className="field"><label>Divisi <span className="req">*</span></label><input value={o.divisi || ''} onChange={e => set('divisi', e.target.value)} placeholder="mis. Finance, Estate, Legal" /></div>}
      {o.jenis === 'External' && <>
        <FotoKunjungan maks={1600} mutu={0.8} label={tanpaPilihan ? "Foto KTP Anda" : "Foto KTP"} wajib nilai={o.ktp} onUbah={v => set('ktp', v)} ket="Foto KTP jelas & terbaca. Otomatis dikecilkan sebelum dikirim." />
        <FotoKunjungan maks={1600} mutu={0.8} label={tanpaPilihan ? "Foto NPWP Anda" : "Foto NPWP"} wajib nilai={o.npwp} onUbah={v => set('npwp', v)} ket="Foto NPWP jelas & terbaca." />
      </>}
    </>}
  </>);
}
export function cekOtherKlien(o) {
  if (!o?.jenis) return 'Pilih Internal employee atau External';
  if (!String(o.nama || '').trim()) return 'Nama Other Sales wajib diisi';
  if (String(o.hp || '').replace(/\D/g, '').length < 8) return 'No. HP Other Sales wajib diisi';
  if (o.jenis === 'Internal employee' && !String(o.divisi || '').trim()) return 'Divisi wajib diisi';
  if (o.jenis === 'External' && (!o.ktp || !o.npwp)) return 'Lampirkan foto KTP dan NPWP';
  return null;
}
export const kirimOther = o => o ? { jenis: o.jenis, nama: o.nama, hp: o.hp, divisi: o.divisi, ktp: o.ktp ? { data: o.ktp.data } : undefined, npwp: o.npwp ? { data: o.npwp.data } : undefined } : undefined;
