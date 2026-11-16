// ===== Formulir WA otomatis untuk lead baru: nama, domisili, budget =====
// Jalur utama: WhatsApp Flows (formulir di dalam WA, 1 pesan). Cadangan: pesan format isian teks yang dibaca CRM.
// Jawaban mengisi kolom lead → label kualitas (🔥) → antrian Marcom / distribusi lead.

const API = () => `${process.env.WA_API_BASE || 'https://graph.facebook.com'}/${process.env.META_API_VERSION || 'v23.0'}`;
const TOKEN = () => process.env.WA_TOKEN || process.env.META_TOKEN;
const rapiProject = p => String(p || '').toLowerCase().replace(/\b\w/g, h => h.toUpperCase()) || 'kami';

export const FORM_DEFAULT = {
  aktif: true,
  pembuka: 'Halo Kak 👋 Terima kasih sudah menghubungi {project}. Supaya konsultan kami bisa langsung kirim info yang pas, mohon isi data singkat ini ya (±20 detik) 🙏',
  terima_kasih: 'Terima kasih Kak {nama} 🙏 Data sudah kami terima. Konsultan properti {project} akan segera menghubungi Kakak.',
  opsi: {
    'BIO DISTRICT': { domisili: ['BSD / Serpong', 'Tangerang', 'Jakarta', 'Bogor / Depok', 'Lainnya'],
      budget: [['< Rp1,5 M', 1400000000], ['Rp1,5 – 2 M', 1500000000], ['Rp2 – 2,5 M', 2000000000], ['> Rp2,5 M', 2500000000]] },
    'PERMAI INDAH': { domisili: ['Cilejit/Tenjo/Parung Panjang', 'Tangerang', 'Bogor', 'Jakarta', 'Lainnya'],
      budget: [['Cicilan ≤ Rp1,2 jt/bulan', 185000000], ['Cicilan Rp1,2 – 1,5 jt/bulan', 185000000], ['Cicilan > Rp1,5 jt/bulan', 185000000]] },
  },
  flow: {},          // project → flow_id WhatsApp Flows
  mode: 'published', // 'draft' = uji coba sebelum formulir dipublikasikan
};

const pendek = (t, n = 30) => String(t || '').trim().slice(0, n);
function rapikan(x) {
  const c = { ...FORM_DEFAULT, ...(x || {}) };
  c.aktif = c.aktif !== false;
  c.pembuka = String(c.pembuka || FORM_DEFAULT.pembuka).slice(0, 900);
  c.terima_kasih = String(c.terima_kasih || '').slice(0, 900);
  const opsi = {};
  Object.entries({ ...FORM_DEFAULT.opsi, ...(c.opsi || {}) }).forEach(([p, o]) => {
    const dom = (Array.isArray(o?.domisili) ? o.domisili : []).map(t => pendek(t)).filter(Boolean).slice(0, 15);
    const bud = (Array.isArray(o?.budget) ? o.budget : []).map(b => Array.isArray(b) ? [pendek(b[0]), Math.max(0, Math.round(Number(b[1]) || 0))] : null).filter(b => b && b[0]).slice(0, 15);
    opsi[p] = { domisili: dom.length ? dom : FORM_DEFAULT.opsi['BIO DISTRICT'].domisili, budget: bud };
  });
  c.opsi = opsi;
  c.flow = Object.fromEntries(Object.entries(c.flow || {}).filter(([, v]) => /^\d{6,25}$/.test(String(v))).map(([k, v]) => [k, String(v)]));
  c.mode = c.mode === 'draft' ? 'draft' : 'published';
  return c;
}
export async function ambilForm(sql) {
  const r = await sql`SELECT items FROM settings WHERE key = 'form_wa'`.catch(() => []);
  return rapikan(r[0]?.items);
}
export async function simpanForm(sql, baru) {
  const lama = await ambilForm(sql);
  const c = rapikan({ ...lama, ...baru });
  await sql`INSERT INTO settings (key, items) VALUES ('form_wa', ${JSON.stringify(c)}::jsonb) ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
  return c;
}

let siap = false;
export async function siapkanForm(sql) {
  if (siap) return;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_wa_at timestamptz`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_wa_ok timestamptz`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_wa_jenis text`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_wa_cadangan timestamptz`;
  try { await sql`ALTER TABLE wa_percakapan ADD COLUMN IF NOT EXISTS oleh text`; } catch {}
  siap = true;
}

// Rancangan formulir WhatsApp Flows — satu formulir untuk semua project, pilihan dikirim bersama pesan
export function flowJson() {
  const opsiSchema = { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } } };
  return {
    version: '6.0',
    screens: [{
      id: 'DATA_KONSUMEN', title: 'Data Singkat', terminal: true, success: true,
      data: {
        judul: { type: 'string', __example__: 'Bio District — data singkat' },
        domisili_opsi: { ...opsiSchema, __example__: [{ id: 'd0', title: 'BSD / Serpong' }] },
        budget_opsi: { ...opsiSchema, __example__: [{ id: 'b0', title: 'Rp1,5 – 2 M' }] },
      },
      layout: { type: 'SingleColumnLayout', children: [{ type: 'Form', name: 'form', children: [
        { type: 'TextSubheading', text: '${data.judul}' },
        { type: 'TextInput', name: 'nama', label: 'Nama lengkap', 'input-type': 'text', required: true },
        { type: 'Dropdown', name: 'domisili', label: 'Domisili', required: true, 'data-source': '${data.domisili_opsi}' },
        { type: 'TextInput', name: 'domisili_lain', label: 'Domisili lainnya (bila pilih Lainnya)', 'input-type': 'text', required: false },
        { type: 'Dropdown', name: 'budget', label: 'Budget', required: true, 'data-source': '${data.budget_opsi}' },
        { type: 'Footer', label: 'Kirim', 'on-click-action': { name: 'complete', payload: { nama: '${form.nama}', domisili: '${form.domisili}', domisili_lain: '${form.domisili_lain}', budget: '${form.budget}' } } },
      ] }] },
    }],
  };
}

async function kirimPesan(phoneId, body) {
  const r = await fetch(`${API()}/${phoneId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN() },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.error_user_msg || j?.error?.message || 'Gagal mengirim WA');
  return j;
}
async function catat(sql, wa, project, lead_code, peran, isi) {
  try { await sql`INSERT INTO wa_percakapan (wa, project, lead_code, peran, isi, oleh) VALUES (${wa}, ${project}, ${lead_code}, ${peran}, ${String(isi).slice(0, 2000)}, ${peran === 'user' ? null : 'Form otomatis'})`; } catch {}
}
const teksIsian = (cfg, project) => `${cfg.pembuka.replace(/\{project\}/g, rapiProject(project))}\n\nMohon balas pesan ini dengan melengkapi:\nNama: \nDomisili: \nBudget: \n\n(contoh — Budget: ${/permai/i.test(project) ? 'cicilan 1,2 jt/bulan' : '1,5 M'})`;

// Kirim formulir ke lead baru (dipanggil webhook saat nomor baru chat pertama kali)
export async function kirimForm(sql, { phoneId, wa, project, lead_code }) {
  await siapkanForm(sql);
  const cfg = await ambilForm(sql);
  if (!cfg.aktif || !phoneId || !TOKEN()) return null;
  const o = cfg.opsi[project] || cfg.opsi['BIO DISTRICT'];
  const flowId = cfg.flow[project];
  let jenis = 'teks';
  if (flowId && o.budget.length) {
    try {
      await kirimPesan(phoneId, { to: wa, type: 'interactive', interactive: {
        type: 'flow', body: { text: cfg.pembuka.replace(/\{project\}/g, rapiProject(project)).slice(0, 1024) }, footer: { text: 'Data hanya dipakai tim kami' },
        action: { name: 'flow', parameters: { flow_message_version: '3', flow_token: lead_code, flow_id: flowId, flow_cta: 'Isi Data', flow_action: 'navigate',
          ...(cfg.mode === 'draft' ? { mode: 'draft' } : {}),
          flow_action_payload: { screen: 'DATA_KONSUMEN', data: { judul: `${rapiProject(project)} — data singkat`,
            domisili_opsi: o.domisili.map((t, i) => ({ id: 'd' + i, title: t })), budget_opsi: o.budget.map((b, i) => ({ id: 'b' + i, title: b[0] })) } } } } } });
      jenis = 'flow';
      await catat(sql, wa, project, lead_code, 'tim', '📝 Formulir WA dikirim (nama, domisili, budget)');
    } catch (e) { console.error('form flow', e.message); }
  }
  if (jenis === 'teks') {
    const t = teksIsian(cfg, project);
    try { await kirimPesan(phoneId, { to: wa, type: 'text', text: { body: t } }); await catat(sql, wa, project, lead_code, 'tim', t); }
    catch (e) { console.error('form teks', e.message); return null; }
  }
  await sql`UPDATE leads SET form_wa_at = now(), form_wa_jenis = ${jenis} WHERE lead_code = ${lead_code}`;
  return jenis;
}

// "1,5 M", "1.5 miliar", "800jt", "800 juta", "1500000000", "cicilan 1,2 jt" → rupiah
export function bacaRupiah(t) {
  const s = String(t || '').toLowerCase().replace(/rp\.?/g, ' ');
  const m = /(\d+(?:[.,]\d+)*)\s*(miliar|milyar|m\b|jt|juta|rb|ribu|k\b)?/.exec(s);
  if (!m) return 0;
  let angka = m[1];
  // "2 – 2,5 M": satuan ditulis di belakang rentang
  const sat = m[2] || ((/(miliar|milyar|\bm\b|jt|juta|rb|ribu)/.exec(s) || [])[1] || '');
  if (sat) angka = angka.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); else angka = angka.replace(/[.,]/g, '');
  const n = parseFloat(angka) || 0;
  const kali = /^(miliar|milyar|m)$/.test(sat) ? 1e9 : /^(jt|juta)$/.test(sat) ? 1e6 : /^(rb|ribu|k)$/.test(sat) ? 1e3
    : n <= 20 ? 1e9 : n < 10000 ? 1e6 : 1; // tanpa satuan: "2" = 2 M, "800" = 800 jt
  return Math.round(n * kali);
}
// Balasan teks berformat "Nama: … / Domisili: … / Budget: …"
export function bacaIsian(teks) {
  const ambil = re => { const m = re.exec(String(teks || '')); return m ? m[1].trim().replace(/^[-:=\s]+/, '').slice(0, 120) : ''; };
  const nama = ambil(/(?:^|\n)\s*\*?nama\*?\s*[:=\-]\s*(.+)/i);
  const domisili = ambil(/(?:^|\n)\s*\*?(?:domisili|alamat|tinggal di|kota)\*?\s*[:=\-]\s*(.+)/i);
  const budgetTeks = ambil(/(?:^|\n)\s*\*?(?:budget|bujet|dana|anggaran)\*?\s*[:=\-]\s*(.+)/i);
  return { nama, domisili, budget_teks: budgetTeks, budget: budgetTeks ? bacaRupiah(budgetTeks) : 0 };
}

async function simpanData(sql, cfg, { lead, phoneId, wa, project, nama, domisili, budget, budget_teks, sumber }) {
  const catatan = `[Form WA${sumber === 'flow' ? '' : ' · balasan teks'}] ${[nama && 'Nama: ' + nama, domisili && 'Domisili: ' + domisili, budget_teks && 'Budget: ' + budget_teks].filter(Boolean).join(' · ')}`;
  await sql`UPDATE leads SET
      nama = CASE WHEN ${nama || ''} <> '' THEN ${nama || ''} ELSE nama END,
      domisili = CASE WHEN ${domisili || ''} <> '' THEN ${domisili || ''} ELSE domisili END,
      budget = CASE WHEN ${Number(budget) || 0}::bigint > 0 THEN ${Number(budget) || 0}::bigint ELSE budget END,
      catatan = trim(both ' ' from COALESCE(catatan, '') || ' ' || ${catatan}), updated_at = now()
    WHERE lead_code = ${lead.lead_code}`;
  const now = (await sql`SELECT nama, domisili, budget FROM leads WHERE lead_code = ${lead.lead_code}`)[0] || {};
  const lengkap = !!(now.nama && !/^WA\s/i.test(now.nama) && now.domisili && Number(now.budget) > 0);
  if (lengkap) {
    await sql`UPDATE leads SET form_wa_ok = now() WHERE lead_code = ${lead.lead_code} AND form_wa_ok IS NULL`;
    if (cfg.terima_kasih && phoneId) {
      const t = cfg.terima_kasih.replace(/\{nama\}/g, String(now.nama).split(/\s+/)[0]).replace(/\{project\}/g, rapiProject(project));
      try { await kirimPesan(phoneId, { to: wa, type: 'text', text: { body: t } }); await catat(sql, wa, project, lead.lead_code, 'tim', t); } catch (e) { console.error('form terima kasih', e.message); }
    }
  }
  try { const { cekAntrian } = await import('@/lib/distribusi-lead'); await cekAntrian(sql, lead.lead_code); } catch {}
  return lengkap;
}

// Dipanggil webhook untuk setiap pesan dari nomor yang sudah jadi lead. true = pesan sudah ditangani sebagai jawaban formulir
export async function tanganiBalasan(sql, { m, wa, project, phoneId, lead_code, isi }) {
  await siapkanForm(sql);
  const lead = (await sql`SELECT lead_code, project, form_wa_at, form_wa_ok, form_wa_jenis, form_wa_cadangan FROM leads WHERE lead_code = ${lead_code}`)[0];
  if (!lead) return false;
  const cfg = await ambilForm(sql);
  const pj = lead.project || project;
  const nfm = m?.type === 'interactive' && m.interactive?.type === 'nfm_reply';
  if (nfm) {
    let r = {}; try { r = JSON.parse(m.interactive.nfm_reply?.response_json || '{}'); } catch {}
    const o = cfg.opsi[pj] || cfg.opsi['BIO DISTRICT'];
    const di = Number(String(r.domisili || '').replace(/\D/g, '')), bi = Number(String(r.budget || '').replace(/\D/g, ''));
    let dom = o.domisili[di] || String(r.domisili || '');
    if (/lain/i.test(dom) && String(r.domisili_lain || '').trim()) dom = String(r.domisili_lain).trim().slice(0, 80);
    const b = o.budget[bi] || [String(r.budget || ''), 0];
    await catat(sql, wa, pj, lead.lead_code, 'user', `📝 Formulir: ${r.nama || '-'} · ${dom || '-'} · ${b[0] || '-'}`);
    await simpanData(sql, cfg, { lead, phoneId, wa, project: pj, nama: String(r.nama || '').trim().slice(0, 80), domisili: dom, budget: b[1], budget_teks: b[0], sumber: 'flow' });
    return true;
  }
  if (!lead.form_wa_at || lead.form_wa_ok || Date.now() - new Date(lead.form_wa_at).getTime() > 3 * 864e5) return false;
  const x = bacaIsian(isi);
  if (x.nama || x.domisili || x.budget_teks) {
    await simpanData(sql, cfg, { lead, phoneId, wa, project: pj, ...x, sumber: 'teks' });
    return true;
  }
  // Formulir tidak bisa dibuka / konsumen membalas teks biasa → kirim format isian sekali
  if (lead.form_wa_jenis === 'flow' && !lead.form_wa_cadangan && phoneId && cfg.aktif) {
    const t = teksIsian(cfg, pj).replace(/^[\s\S]*?\n\nMohon/, 'Bila formulir tidak bisa dibuka, mohon');
    try { await kirimPesan(phoneId, { to: wa, type: 'text', text: { body: t } }); await catat(sql, wa, pj, lead.lead_code, 'tim', t); } catch (e) { console.error('form cadangan', e.message); }
    await sql`UPDATE leads SET form_wa_cadangan = now() WHERE lead_code = ${lead.lead_code}`;
  }
  return false;
}

// Buat & publikasikan formulir di WhatsApp Manager lewat API (butuh izin whatsapp_business_management pada token)
export async function buatFlow(sql, project, wabaId) {
  const r = await fetch(`${API()}/${wabaId}/flows`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN() },
    body: JSON.stringify({ name: `CRM Data Lead ${rapiProject(project)} ${new Date().toISOString().slice(0, 10)}`, categories: ['LEAD_GENERATION'], flow_json: JSON.stringify(flowJson()), publish: true }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error((j?.error?.error_user_msg || j?.error?.message || 'Gagal membuat formulir') + (j?.validation_errors ? ' · ' + JSON.stringify(j.validation_errors).slice(0, 300) : ''));
  await simpanForm(sql, { flow: { ...(await ambilForm(sql)).flow, [project]: j.id } });
  return j.id;
}
