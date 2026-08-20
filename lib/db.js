import { neon } from '@neondatabase/serverless';

let _sql = null;
export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export const DEFAULT_SETTINGS = {
  status: ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Booking', 'Closing', 'Lost'],
  sumber: ['Walk In', 'Website', 'Instagram', 'Facebook Ads', 'Google Ads', 'WhatsApp', 'Referral', 'Pameran / Event', 'Kanvasing', 'Marketplace Properti', 'Lainnya'],
  project: ['BIO DISTRICT', 'PERMAI INDAH'],
  tipe: ['TIPE A', 'TIPE B', 'TIPE C', 'TIPE B CORNER', 'TIPE C CORNER', 'KAVLING', '22,5/60'],
  tujuan: ['Hunian', 'Investasi', 'Usaha'],
  bayar: ['Cash Keras', 'Cash Bertahap', 'KPR', 'In-House'],
};
