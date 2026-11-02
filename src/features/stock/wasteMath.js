import { parseQty, formatQty } from './stockMath';

/**
 * wasteMath — rumus murni Waste (dites di wasteMath.test.js). Tanpa React, tanpa Supabase.
 *
 * Catatan waste (staf mencatat, owner mengatur pilihan): rincian jenis ayam × porsi (bisa desimal), SATU penyaluran
 * (dimakan karyawan, disumbangkan, dibuang, dst: pilihan owner), dan nama pengisi. Harga per porsi dari daftar jenis
 * (owner) disalin ke tiap baris saat dicatat, jadi mengubah harga tidak mengubah catatan lama. Staf tidak melihat harga.
 * Nilai kerugian = jumlah × harga per baris, dibulatkan ke rupiah.
 */

/** Pilihan jenis "Lainnya": nama bebas, harga 0 (staf tidak mengisi harga). */
export const CUSTOM_WASTE = 'Lainnya';

export const emptyWasteRow = (type = '') => ({ type, name: '', qty: '' });

/** Nama tampil satu baris: jenis, atau nama bebas kalau jenisnya "Lainnya". */
export const rowName = (r) => (r.type === CUSTOM_WASTE ? String(r.name || '').trim() : String(r.type || '').trim());

/** Baris sah = ada nama dan porsi > 0. */
export const wasteRowOk = (r) => rowName(r) !== '' && (parseQty(r.qty) ?? 0) > 0;

/** Harga per porsi untuk satu baris dari daftar jenis ([{ name, price }]). "Lainnya" atau jenis yang tak dikenal = 0. */
export function priceFor(row, jenis = []) {
  if (row.type === CUSTOM_WASTE) return 0;
  const hit = jenis.find((j) => j.name === row.type);
  return hit ? Math.max(0, Number(hit.price) || 0) : 0;
}

/** Baris isian form -> baris tersimpan [{ type, name, qty, price }] (hanya baris sah, harga disalin). */
export function toStoredRows(rows, jenis = []) {
  return rows.filter(wasteRowOk).map((r) => ({
    type: r.type, name: r.type === CUSTOM_WASTE ? rowName(r) : '', qty: parseQty(r.qty), price: priceFor(r, jenis),
  }));
}

/** Total porsi dan nilai dari baris tersimpan. */
export function wasteTotals(storedRows = []) {
  let qty = 0, value = 0;
  for (const r of storedRows) {
    const q = Number(r.qty) || 0;
    qty += q;
    value += Math.round(q * (Number(r.price) || 0));
  }
  return { qty: Math.round(qty * 1000) / 1000, value };
}

/** Total porsi dari baris isian form (sebelum disimpan; baris yang belum sah tidak dihitung). */
export const formQty = (rows) => Math.round(rows.reduce((t, r) => t + (wasteRowOk(r) ? parseQty(r.qty) : 0), 0) * 1000) / 1000;

/** Boleh simpan? Minimal satu baris sah, tidak ada baris setengah terisi, penyaluran dan pengisi dipilih. `reason` = apa yang kurang. */
export function wasteCheck({ rows, penyaluran, by }) {
  const half = rows.some((r) => (String(r.qty).trim() !== '' || String(r.name || '').trim() !== '') && !wasteRowOk(r));
  const missing = [];
  if (!rows.some(wasteRowOk) || half) missing.push('isi jenis dan porsi');
  if (!penyaluran) missing.push('pilih penyaluran');
  if (!by) missing.push('pilih nama');
  return { ok: missing.length === 0, reason: missing.join(', ') };
}

/** "Dada 4 · Paha atas 2,5" dari baris tersimpan atau baris form sah. */
export const describeWaste = (rows = []) =>
  rows.map((r) => `${rowName(r)} ${formatQty(typeof r.qty === 'number' ? r.qty : parseQty(r.qty) ?? 0)}`).join(' · ');

/** Rekap catatan ([{ rows, total_qty, total_value }]) per jenis, nilai terbesar dulu: [{ name, qty, value }]. */
export function wasteByJenis(catatan = []) {
  const map = new Map();
  for (const c of catatan) {
    for (const r of c.rows || []) {
      const name = rowName(r) || 'Lainnya';
      const cur = map.get(name) || { name, qty: 0, value: 0 };
      cur.qty += Number(r.qty) || 0;
      cur.value += Math.round((Number(r.qty) || 0) * (Number(r.price) || 0));
      map.set(name, cur);
    }
  }
  return [...map.values()].map((x) => ({ ...x, qty: Math.round(x.qty * 1000) / 1000 })).sort((a, b) => b.value - a.value || b.qty - a.qty || a.name.localeCompare(b.name));
}

/** Rekap per penyaluran: [{ name, qty, value }] (porsi terbanyak dulu). */
export function wasteByPenyaluran(catatan = []) {
  const map = new Map();
  for (const c of catatan) {
    const name = c.penyaluran || 'Tanpa penyaluran';
    const cur = map.get(name) || { name, qty: 0, value: 0 };
    cur.qty += Number(c.total_qty) || 0;
    cur.value += Number(c.total_value) || 0;
    map.set(name, cur);
  }
  return [...map.values()].map((x) => ({ ...x, qty: Math.round(x.qty * 1000) / 1000 })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

/** Total kerugian waste (rupiah) dan porsi dari daftar catatan. Dipakai Income Statement dan kartu owner. */
export function sumWaste(catatan = []) {
  let value = 0, qty = 0;
  for (const c of catatan) { value += Number(c.total_value) || 0; qty += Number(c.total_qty) || 0; }
  return { value: Math.round(value), qty: Math.round(qty * 1000) / 1000, count: catatan.length };
}

/** Jenis ayam yang belum punya harga (peringatan untuk owner). */
export const jenisWithoutPrice = (jenis = []) => jenis.filter((j) => !(Number(j.price) > 0));

/** Catatan yang ada baris "Lainnya" atau jenis tanpa harga: nilainya belum lengkap. */
export const wasteUnpriced = (c) => (c.rows || []).some((r) => !(Number(r.price) > 0));
