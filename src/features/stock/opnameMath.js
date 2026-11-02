import { shiftMonthKey } from '../reports/reportsMath';

/**
 * opnameMath — rumus murni Stok Opname (dites di opnameMath.test.js). Tanpa React, tanpa Supabase.
 *
 * Konsep (permintaan pemilik 2 Nov 2026):
 *  - Tidak ada form stok bulanan terpisah: stok awal/akhir bulan = checklist Isi Stok yang sama. Satu hari yang tersimpan dengan
 *    SEMUA item berisi angka = "hitungan penuh" (`stock_days.full_count`).
 *  - Hitungan penuh PALING AKHIR dalam satu bulan = stok akhir bulan itu = stok awal bulan berikutnya.
 *  - Nilai stok = jumlah × harga modal per satuan. Harga disalin ke baris isian saat hitungan penuh disimpan (`stock_counts.unit_cost`);
 *    baris yang belum punya salinan memakai harga item SEKARANG; tanpa harga sama sekali = Rp 0 dan ditandai "belum ada harga".
 *  - Mode opname (`stock_settings.opname_aktif`): SEMUA item wajib diisi.
 *  - Pengingat untuk owner: di hari terakhir bulan (H) dan sehari sebelumnya (H-1).
 */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, '0');

/** '2026-10-31' -> '2026-10'. Selain format tanggal -> ''. */
export const monthOf = (day) => (DAY_RE.test(String(day || '')) ? String(day).slice(0, 7) : '');

/** Hari terakhir bulan 'YYYY-MM' -> 'YYYY-MM-DD' (Februari kabisat dihitung). */
export function lastDayOfMonth(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

/** Sehari sebelum tanggal 'YYYY-MM-DD' (tanggal apa adanya, tanpa zona waktu). */
function dayBefore(day) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Tahap pengingat opname untuk tanggal bisnis `day`: 'h' = hari terakhir bulan, 'h1' = sehari sebelumnya, null = bukan keduanya. */
export function opnamePhase(day) {
  const ym = monthOf(day);
  if (!ym) return null;
  const last = lastDayOfMonth(ym);
  if (day === last) return 'h';
  if (day === dayBefore(last)) return 'h1';
  return null;
}

/** Bulan yang dihitung opname-nya untuk tahap pengingat (H dan H-1 sama-sama bulan dari `day`). */
export const opnameMonth = (day) => monthOf(day);

/**
 * Perlu mengingatkan owner? Hanya di H / H-1, mode opname belum nyala, dan hari ini belum ada hitungan penuh yang tersimpan.
 * `fullDays` = daftar tanggal ('YYYY-MM-DD') yang hitungan penuhnya sudah tersimpan.
 */
export function reminderFor(day, { opnameOn = false, fullDays = [] } = {}) {
  const phase = opnamePhase(day);
  if (!phase || opnameOn || fullDays.includes(day)) return null;
  return phase;
}

/** Salinan master dengan semua item wajib (mode opname). Mode mati = master apa adanya (referensi sama). */
export function withOpname(master, opnameOn) {
  if (!opnameOn) return master;
  return master.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, required: true })) }));
}

/** Apakah `counts` ({[itemId]:{qty}}) mengisi SEMUA item di master? (dasar hitungan penuh, dipakai klien untuk keterangan) */
export function isFullCount(master, counts = {}) {
  const items = master.flatMap((c) => c.items);
  return items.length > 0 && items.every((i) => counts[i.id]?.qty !== null && counts[i.id]?.qty !== undefined && !Number.isNaN(Number(counts[i.id]?.qty)));
}

/**
 * Hitungan penuh paling akhir per bulan. `days` = [{ day, saved_by, saved_at }] (hari yang full_count = true, urutan bebas).
 * Hasil: { 'YYYY-MM': { day, saved_by, saved_at } }.
 */
export function latestFullByMonth(days = []) {
  const out = {};
  for (const d of days) {
    const ym = monthOf(d.day);
    if (!ym) continue;
    if (!out[ym] || d.day > out[ym].day) out[ym] = d;
  }
  return out;
}

/** Harga satu baris isian: salinan saat hitung kalau ada, kalau tidak harga item sekarang, kalau tidak ada = null. */
export function priceOf(count, item) {
  const snap = count?.unit_cost;
  if (snap !== null && snap !== undefined && snap !== '' && !Number.isNaN(Number(snap))) return Number(snap);
  const cur = item?.unit_cost;
  if (cur !== null && cur !== undefined && cur !== '' && !Number.isNaN(Number(cur))) return Number(cur);
  return null;
}

/**
 * Nilai stok satu hitungan penuh. `counts` = [{ item_id, qty, unit_cost }], `items` = [{ id, unit_cost }].
 * Uang = integer rupiah (pembulatan per item). `missing` = jumlah item yang ada stoknya (> 0) tapi belum punya harga.
 */
export function opnameValue(counts = [], items = []) {
  const byId = new Map(items.map((i) => [i.id, i]));
  let total = 0, missing = 0;
  for (const c of counts) {
    const qty = Number(c.qty);
    if (c.qty === null || c.qty === undefined || Number.isNaN(qty) || qty <= 0) continue;
    const price = priceOf(c, byId.get(c.item_id));
    if (price === null) { missing += 1; continue; }
    total += Math.round(qty * price);
  }
  return { total, missing };
}

/** Rincian per kategori untuk sheet detail opname: [{ category, rows: [{ item, qty, price, value }], subtotal }] (urutan master, hanya item yang punya angka). */
export function opnameGroups(master, counts = []) {
  const byItem = new Map(counts.map((c) => [c.item_id, c]));
  const groups = [];
  for (const category of master) {
    const rows = [];
    for (const item of category.items) {
      const c = byItem.get(item.id);
      if (!c || c.qty === null || c.qty === undefined) continue;
      const qty = Number(c.qty);
      const price = priceOf(c, item);
      rows.push({ item, qty, price, value: price === null ? 0 : Math.round(qty * price) });
    }
    if (rows.length) groups.push({ category, rows, subtotal: rows.reduce((t, r) => t + r.value, 0) });
  }
  return groups;
}

/** Item yang belum punya harga modal (untuk peringatan di Kelola dan Riwayat). */
export const itemsWithoutPrice = (items = []) => items.filter((i) => i.unit_cost === null || i.unit_cost === undefined || i.unit_cost === '');

/** Daftar bulan untuk Riwayat opname: bulan berjalan lalu mundur `count` bulan. Tiap bulan ikut `byMonth` ({ym: {day,...}}). */
export function recentMonths(currentYm, count = 3) {
  return Array.from({ length: count }, (_, i) => shiftMonthKey(currentYm, -i));
}

/**
 * Angka stok untuk Income Statement bulan `ym`: awal = nilai hitungan penuh terakhir bulan SEBELUMNYA, akhir = bulan ini.
 * `values` = { 'YYYY-MM': nilaiRupiah }. Bulan tanpa hitungan penuh = null (tampil "Belum diisi", dihitung 0).
 */
export function statementStock(values = {}, ym) {
  const prev = shiftMonthKey(ym, -1);
  const pick = (k) => (Object.hasOwn(values, k) ? values[k] : null);
  return { awal: pick(prev), akhir: pick(ym) };
}

/**
 * Sel kalender untuk bulan 'YYYY-MM' (minggu mulai Senin): isi tanggal 'YYYY-MM-DD', atau null untuk kotak kosong di awal.
 * Dipakai "Pilih hari lain" di Riwayat stok.
 */
export function calendarCells(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;   // Senin = 0
  const last = Number(lastDayOfMonth(ym).slice(8, 10));
  return [...Array(lead).fill(null), ...Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`)];
}
