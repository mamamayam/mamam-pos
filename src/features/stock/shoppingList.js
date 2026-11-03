/**
 * shoppingList — rumus murni Daftar Belanja yang dicentang langsung di daftar stok satu hari (dites di shoppingList.test.js).
 * Tanpa React, tanpa Supabase.
 *
 * Bentuk data:
 *   groups = hasil `dayItems(...).groups` (belum disaring): [{ category, rows: [{ item, qty, status }] }]
 *   sel    = { [itemId]: true }                  (item stok yang dicentang; tidak ada centang otomatis)
 *   extras = [{ id, name, on }]                  (item di luar stok, mis. "Kantong kresek")
 * Jumlah beli sengaja tidak ada: pemilik menentukannya sendiri di WhatsApp.
 */
import { formatQty } from './stockMath';

const normalize = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Id item stok (yang punya angka hari itu) dengan nama ini, tanpa peduli huruf besar/kecil dan spasi ganda; tidak ada = null. */
export function findRowId(groups = [], name) {
  const key = normalize(name);
  if (!key) return null;
  for (const g of groups) {
    for (const r of g.rows) if (normalize(r.item.name) === key) return r.item.id;
  }
  return null;
}

/** Tambah item di luar stok. Nama kosong = tidak berubah; nama yang sudah ada di extras hanya dicentang (tidak dobel). */
export function addExtra(extras, name) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return extras;
  const key = clean.toLowerCase();
  const found = extras.find((e) => e.name.toLowerCase() === key);
  if (found) return extras.map((e) => (e === found ? { ...e, on: true } : e));
  return [...extras, { id: `x:${key}`, name: clean, on: true }];
}

/**
 * Item terpilih dikelompokkan per kategori stok (urutan daftar), lalu item tambahan sebagai kelompok terakhir.
 * Kelompok tanpa item dibuang. Bentuk: [[{ id, name, stock }]] — `stock` = sisa stok hari itu ("0 gr"), null untuk item tambahan.
 */
export function selectedGroups(groups = [], sel = {}, extras = []) {
  const out = [];
  for (const g of groups) {
    const picked = g.rows
      .filter((r) => sel[r.item.id])
      .map((r) => ({ id: r.item.id, name: r.item.name, stock: `${formatQty(r.qty)} ${r.item.unit}`.trim() }));
    if (picked.length) out.push(picked);
  }
  const more = extras.filter((e) => e.on).map((e) => ({ id: e.id, name: e.name, stock: null }));
  if (more.length) out.push(more);
  return out;
}

export const countSelected = (selGroups) => selGroups.reduce((n, g) => n + g.length, 0);

/**
 * Teks untuk ditempel di WhatsApp dari `selectedGroups(...)`. Tiap item membawa sisa stoknya: "1. BLD (sisa 0 gr)".
 * Kelompok (kategori) dipisah SATU BARIS KOSONG (enter dua kali), tanpa menulis nama kategori; nomor mulai dari 1 di tiap kelompok.
 * Item tambahan tanpa keterangan sisa. `dateLabel` mis. "Sel, 3 Nov".
 */
export function shoppingText(selGroups, dateLabel = '') {
  const head = `*Belanja MamamAyam*${dateLabel ? `\n${dateLabel}` : ''}`;
  if (!countSelected(selGroups)) return `${head}\n\nBelum ada item dipilih.`;
  const blocks = selGroups.map((g) => g.map((i, n) => `${n + 1}. ${i.name}${i.stock ? ` (sisa ${i.stock})` : ''}`).join('\n'));
  return `${head}\n\n${blocks.join('\n\n')}`;
}
