// ============================================================================
// MODUL IOM — Internal Office Memo untuk pengajuan pengeluaran dana perusahaan.
// Berbeda dari alur penjualan: IOM berjalan pada jalur jabatan (kepala divisi,
// budget control, Project CEO, CFO, CEO, Finance, Treasury), bukan divisi
// operasional. Karena itu wewenangnya disimpan pada kolom jabatan tersendiri,
// sehingga satu orang bisa memegang peran divisi sekaligus jabatan approval.
// ============================================================================

export const JABATAN = {
  kadiv: 'Kepala Divisi',
  budget: 'Budget Control',
  pceo: 'Project CEO',
  cfo: 'CFO',
  ceo: 'CEO',
  finance: 'Finance',
  treasury: 'Treasury',
};

export const TAHAP_IOM = [
  { no: 1, key: 'diajukan', nama: 'Pembuatan IOM', pendek: 'Ajukan', pic: null,
    aksi: 'Ajukan ke kepala divisi',
    ringkas: 'Pengaju mengisi perihal, uraian, nominal, dan nomor referensi anggaran' },
  { no: 2, key: 'verif_divisi', nama: 'Verifikasi Divisi', pendek: 'Verif Div', pic: 'kadiv',
    aksi: 'Verifikasi & teruskan ke Budget Control',
    ringkas: 'Kepala divisi memastikan kebutuhan memang diperlukan dan wajar' },
  { no: 3, key: 'verif_budget', nama: 'Verifikasi Budget', pendek: 'Verif Bgt', pic: 'budget',
    aksi: 'Konfirmasi anggaran & teruskan ke Project CEO',
    ringkas: 'Budget Control mencocokkan dengan pos anggaran dan mengunci alokasinya' },
  { no: 4, key: 'appr_pceo', nama: 'Approval Project CEO', pendek: 'P. CEO', pic: 'pceo',
    aksi: 'Setujui & teruskan ke CFO',
    ringkas: 'Project CEO menilai kesesuaian dengan sasaran proyek' },
  { no: 5, key: 'appr_cfo', nama: 'Approval CFO', pendek: 'CFO', pic: 'cfo',
    aksi: 'Setujui & teruskan ke CEO',
    ringkas: 'CFO menilai kesiapan arus kas perusahaan' },
  { no: 6, key: 'appr_ceo', nama: 'Approval CEO', pendek: 'CEO', pic: 'ceo',
    aksi: 'Setujui — IOM komplit',
    ringkas: 'Persetujuan akhir manajemen' },
  { no: 7, key: 'komplit', nama: 'IOM Pencairan Dana', pendek: 'Pencairan', pic: 'finance',
    aksi: 'Terbitkan IOM pencairan ke Treasury',
    ringkas: 'Finance menyiapkan dokumen pencairan dana' },
  { no: 8, key: 'pencairan', nama: 'Eksekusi Pembayaran', pendek: 'Bayar', pic: 'treasury',
    aksi: 'Konfirmasi dana telah cair',
    ringkas: 'Treasury mengeksekusi pembayaran' },
  { no: 9, key: 'cair', nama: 'Cair — Selesai', pendek: 'Cair', pic: null,
    aksi: null, ringkas: 'Dana telah dicairkan, IOM ditutup dan terarsip' },
];

export const JENIS_IOM = {
  dana_program: 'Dana program',
  komisi: 'Program komisi',
  hadiah: 'Hadiah',
  operasional: 'Operasional',
  lainnya: 'Lainnya',
};

export const infoIom = n => TAHAP_IOM.find(t => t.no === Number(n)) || TAHAP_IOM[0];

// Batas waktu wajar tiap pos (hari kerja) — dipakai untuk penanda keterlambatan
export const SLA_HARI = 1;

// Boleh memproses bila jabatannya cocok dengan pos saat ini (manager = pengawas)
export function bolehProses(user, tahap) {
  const pos = infoIom(tahap).pic;
  if (!pos) return false;
  if (user.role === 'manager') return true;
  return user.jabatan === pos;
}

// Nomor IOM: IOM/<KODE>/<BULAN>/<TAHUN>/<URUT>
export function nomorIom(kodeDivisi, urut) {
  const d = new Date();
  const bl = String(d.getMonth() + 1).padStart(2, '0');
  return 'IOM/' + (kodeDivisi || 'UM') + '/' + bl + '/' + d.getFullYear() + '/' + String(urut).padStart(3, '0');
}

export const KODE_DIVISI = {
  'Sales & Marketing': 'SM', 'Marketing': 'SM', 'HRGA': 'HR', 'Finance': 'FN',
  'Legal': 'LG', 'Project': 'PR', 'Estate': 'ES', 'IT': 'IT', 'Umum': 'UM',
};
