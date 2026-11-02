// Aturan pewarisan harga: unit memakai harga sendiri bila diisi, bila tidak mengikuti tipenya.

// Harga efektif sebuah unit: harga sendiri bila diisi, bila tidak mewarisi dari tipenya
export function hargaEfektif(u, t) {
  const dariUnit = u && (u.harga_standar > 0 || u.harga_allin > 0);
  const src = dariUnit ? u : (t || {});
  return {
    harga_list: Number((u && u.harga_list > 0 ? u.harga_list : (t || {}).harga_list) || 0),
    harga_standar: Number(src.harga_standar || 0), harga_allin: Number(src.harga_allin || 0),
    sumber: dariUnit ? 'unit' : (t ? 'tipe' : 'kosong'),
    lb: (u && u.lb) || (t || {}).lb || null, lt: (u && u.lt) || (t || {}).lt || null,
    dimensi: (u && u.dimensi) || (t || {}).dimensi || '', arah: (u && u.arah) || (t || {}).arah || '',
    ppn_dtp: u && u.ppn_dtp !== null && u.tipe ? Boolean(u.ppn_dtp) : Boolean((t || {}).ppn_dtp),
  };
}

