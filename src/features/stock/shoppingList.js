/**
 * shoppingList — rumus murni Daftar Belanja dari isi stok satu hari (dites di shoppingList.test.js). Tanpa React, tanpa Supabase.
 *
 * Bentuk satu baris daftar:
 *   { id, name, category, status, checked, qty, custom? }
 *   qty = teks bebas yang diketik pemilik ("5 kg", "2 karung"); kosong = tanpa jumlah di teks WhatsApp.
 */

/** Kategori sisa masak (mis. "Ayam Matang Sisa") bukan barang belanja: tampil, tapi tidak dicentang otomatis. */
export const isLeftoverCategory = (name) => /matang/i.test(String(name || ''));

/**
 * Usulan awal dari `dayItems(...).groups`: item Habis dan Menipis, urutan master.
 * Item belanja dicentang; item dari kategori sisa masak ditaruh di bawah dan tidak dicentang.
 */
export function suggestShoppingItems(groups = []) {
  const buy = [];
  const leftover = [];
  for (const g of groups) {
    const isLeftover = isLeftoverCategory(g.category.name);
    for (const r of g.rows) {
      if (r.status !== 'habis' && r.status !== 'menipis') continue;
      (isLeftover ? leftover : buy).push({
        id: r.item.id, name: r.item.name, category: g.category.name, status: r.status, checked: !isLeftover, qty: '',
      });
    }
  }
  return [...buy, ...leftover];
}

/**
 * Tambah item di luar stok (mis. "Kantong kresek"). Nama kosong = tidak berubah.
 * Nama yang sudah ada di daftar (tanpa peduli huruf besar/kecil) tidak diduplikasi, cukup dicentang.
 */
export function addCustomItem(items, name) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return items;
  const key = clean.toLowerCase();
  const found = items.find((i) => i.name.toLowerCase() === key);
  if (found) return items.map((i) => (i === found ? { ...i, checked: true } : i));
  return [...items, { id: `custom:${key}`, name: clean, category: '', status: null, checked: true, qty: '', custom: true }];
}

export const checkedCount = (items) => items.filter((i) => i.checked).length;

/**
 * Teks untuk ditempel di WhatsApp: hanya item yang dicentang, bernomor, urutan seperti di daftar.
 * Format: "1. BLD - 5 kg" (tanpa " - ..." kalau jumlah kosong). `dateLabel` mis. "Sel, 3 Nov".
 */
export function shoppingText(items, dateLabel = '') {
  const picked = items.filter((i) => i.checked);
  const head = `*Belanja MamamAyam*${dateLabel ? `\n${dateLabel}` : ''}`;
  if (!picked.length) return `${head}\n\nBelum ada item dipilih.`;
  const lines = picked.map((i, n) => {
    const qty = String(i.qty ?? '').trim();
    return `${n + 1}. ${i.name}${qty ? ` - ${qty}` : ''}`;
  });
  return [head, '', ...lines].join('\n');
}
