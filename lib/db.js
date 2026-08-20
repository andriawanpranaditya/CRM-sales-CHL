import { neon } from '@neondatabase/serverless';

let _sql = null;
export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

function seq(prefix, n) {
  return Array.from({ length: n }, (_, i) => `${prefix} no.${String(i + 1).padStart(2, '0')}`);
}
// Daftar unit awal (hasil pembacaan siteplan — bisa dirapikan Manager di Settings)
export const DEFAULT_UNITS = {
  'BIO DISTRICT': [
    ...seq('Bio Ave 1', 8), ...seq('Bio Ave 2', 8), ...seq('Bio Ave 3', 20),
    ...seq('Bio Ave 5', 16), ...seq('Bio Ave 6', 7), ...seq('Bio Ave 7', 3),
    ...seq('Bio Blv', 17),
  ],
  'PERMAI INDAH': [
    ...['A1','A2','A3','A4','A5','A6','A7','A8'].flatMap(b => seq('Blok ' + b, 18)),
    ...['B1','B2','B3','B4','B5','B7'].flatMap(b => seq('Blok ' + b, 10)),
    ...seq('Blok C1', 7), ...seq('Blok C2', 18), ...seq('Blok BLV', 17),
  ],
};

export const DEFAULT_SETTINGS = {
  status: ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Booking', 'Closing', 'Drop'],
  sumber: ['Walk In', 'Website', 'Instagram', 'Facebook Ads', 'Google Ads', 'WhatsApp', 'Referral', 'Pameran / Event', 'Kanvasing', 'Marketplace Properti', 'Lainnya'],
  project: ['BIO DISTRICT', 'PERMAI INDAH'],
  tipe: ['TIPE A', 'TIPE B', 'TIPE C', 'TIPE B CORNER', 'TIPE C CORNER', 'KAVLING', '22,5/60'],
  tujuan: ['Hunian', 'Investasi', 'Usaha'],
  bayar: ['Cash Keras', 'Cash Bertahap', 'KPR', 'In-House'],
};
