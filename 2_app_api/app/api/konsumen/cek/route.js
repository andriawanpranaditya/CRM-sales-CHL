import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { cariKembar, pesanKembar } from '@/lib/konsumen';

export const dynamic = 'force-dynamic';

// GET ?nik=&npwp=&email=&hp=&lead_code= -> daftar lead lain dengan identitas sama
export async function GET(req) {
  const { err } = await requireUser(); if (err) return err;
  const q = new URL(req.url).searchParams;
  const kembar = await cariKembar(db(), {
    nik: q.get('nik'), npwp: q.get('npwp'), email: q.get('email'), hp: q.get('hp'), kecuali: q.get('lead_code'),
  });
  return Response.json({ kembar: kembar.map(k => ({ ...k, pesan: pesanKembar(k) })) });
}
