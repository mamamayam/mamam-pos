/**
 * shoppingList — rumus murni Daftar Belanja yang dicentang langsung di daftar stok satu hari (dites di shoppingList.test.js).
 * Tanpa React, tanpa Supabase.
 *
 * Bentuk data:
 *   groups = hasil `dayItems(...).groups` (belum disaring): [{ category, rows: [{ item, qty, status }] }]
 *   sel    = { [itemId]: { on: boolean, qty: string } }   (centang + jumlah beli; teks bebas "5 kg")
 *   extras = [{ id, name, on, qty }]                       (item di luar stok, mis. "Kantong kresek")
 */

/** Kategori sisa masak (mis. "Ayam Matang Sisa") bukan barang belanja: tampil, tapi tidak dicentang otomatis. */
export const isLeftoverCategory = (name) => /matang/i.test(String(name || ''));

/** Centang awal: item Habis dan Menipis di kategori belanja. Sisa masak dan yang Aman tidak dicentang. */
export function initialSelection(groups = []) {
  const sel = {};
  for (const g of groups) {
    if (isLeftoverCategory(g.category.name)) continue;
    for (const r of g.rows) {
      if (r.status === 'habis' || r.status === 'menipis') sel[r.item.id] = { on: true, qty: '' };
    }
  }
  return sel;
}

/** Id item stok (yang punya angka hari itu) dengan nama ini, tanpa peduli huruf besar/kecil dan spasi ganda; tidak ada = null. */
export function findRowId(groups = [], name) {
  const key = normalize(name);
  if (!key) return null;
  for (const g of groups) {
    for (const r of g.rows) if (normalize(r.item.name) === key) return r.item.id;
  }
  return null;
}

const normalize = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Tambah item di luar stok. Nama kosong = tidak berubah; nama yang sudah ada di extras hanya dicentang (tidak dobel). */
export function addExtra(extras, name) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return extras;
  const key = clean.toLowerCase();
  const found = extras.find((e) => e.name.toLowerCase() === key);
  if (found) return extras.map((e) => (e === found ? { ...e, on: true } : e));
  return [...extras, { id: `x:${key}`, name: clean, on: true, qty: '' }];
}

/** Item terpilih berurutan: item stok mengikuti urutan kategori/item di daftar, lalu item tambahan. Bentuk { id, name, qty }. */
export function selectedItems(groups = [], sel = {}, extras = []) {
  const out = [];
  for (const g of groups) {
    for (const r of g.rows) {
      const s = sel[r.item.id];
      if (s?.on) out.push({ id: r.item.id, name: r.item.name, qty: s.qty ?? '' });
    }
  }
  for (const e of extras) if (e.on) out.push({ id: e.id, name: e.name, qty: e.qty ?? '' });
  return out;
}

/**
 * Teks untuk ditempel di WhatsApp dari `selectedItems(...)`: bernomor, urutan seperti di daftar.
 * Format: "1. BLD - 5 kg" (tanpa " - ..." kalau jumlah kosong). `dateLabel` mis. "Sel, 3 Nov".
 */
export function shoppingText(items, dateLabel = '') {
  const head = `*Belanja MamamAyam*${dateLabel ? `\n${dateLabel}` : ''}`;
  if (!items.length) return `${head}\n\nBelum ada item dipilih.`;
  const lines = items.map((i, n) => {
    const qty = String(i.qty ?? '').trim();
    return `${n + 1}. ${i.name}${qty ? ` - ${qty}` : ''}`;
  });
  return [head, '', ...lines].join('\n');
}
