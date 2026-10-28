/**
 * menuOrder — tata letak ikon menu slide-up yang bisa diatur sendiri (drag & drop).
 * FUNGSI MURNI (dites) + simpan/baca per peran di localStorage perangkat ini.
 *
 * Tata letak = { pinned, full }:
 *  - pinned = daftar id (berurutan) yang tampil di menu RINGKAS; sisanya masuk tile "Lainnya".
 *             null = belum diatur: bawaannya DEFAULT_PINNED_COUNT menu pertama dari urutan penuh.
 *  - full   = urutan SEMUA menu saat "Lainnya" dibuka. null = belum diatur sendiri: ikut urutan
 *             ringkas lebih dulu, sisanya menyusul (jadi urutan atas tidak berubah saat dibuka).
 * Format lama (array polos id) dibaca sebagai { pinned: null, full: array }.
 *
 * Menu baru yang belum ada di daftar tersimpan ditaruh di belakang (masuk Lainnya), dan id yang
 * sudah tidak ada diabaikan, jadi menambah/menghapus menu di kode tidak merusak pilihan pengguna.
 */
export const MENU_ORDER_KEY = 'mamam-pos-menu-order';
/** Jumlah menu tampilan ringkas bawaan (sebelum pemilik memilih sendiri). */
export const DEFAULT_PINNED_COUNT = 5;

/** Susun `items` ({ id, ... }) menurut `savedIds`; sisanya mengikuti urutan bawaan di belakang. */
export function orderMenus(items, savedIds) {
  const saved = Array.isArray(savedIds) ? savedIds : [];
  const byId = new Map(items.map((it) => [it.id, it]));
  const picked = [];
  for (const id of saved) {
    if (byId.has(id)) { picked.push(byId.get(id)); byId.delete(id); }   // `delete` juga membuang id ganda
  }
  return [...picked, ...byId.values()];
}

/** Pindahkan `fromId` ke posisi `toId` (yang lain bergeser). Id tak dikenal = tidak berubah. */
export function moveId(ids, fromId, toId) {
  const from = ids.indexOf(fromId), to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

/** Id elemen yang persegi panjangnya memuat titik (x, y); null kalau di luar semuanya. */
export function itemAtPoint(rects, x, y) {
  for (const [id, r] of Object.entries(rects)) {
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
  }
  return null;
}

const keyFor = (role) => `${MENU_ORDER_KEY}:${role || 'umum'}`;

const cleanIds = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null);

/** Bentuk apa pun yang tersimpan (array lama / objek baru / sampah) -> { pinned, full } atau null. */
export function normalizeLayout(raw) {
  if (Array.isArray(raw)) return { pinned: null, full: cleanIds(raw) };
  if (raw && typeof raw === 'object') {
    const pinned = cleanIds(raw.pinned), full = cleanIds(raw.full);
    if (pinned || full) return { pinned, full };
  }
  return null;
}

/**
 * Hitung tampilan dari `items` + tata letak tersimpan:
 *  compact  = menu di tampilan ringkas (berurutan),
 *  expanded = semua menu saat Lainnya dibuka,
 *  hidden   = menu yang masuk Lainnya (menurut urutan expanded).
 */
export function resolveMenuLayout(items, layout) {
  const { pinned = null, full = null } = layout || {};
  const byFull = orderMenus(items, full);
  let compact;
  if (Array.isArray(pinned)) {
    const set = new Set(pinned);
    compact = orderMenus(items, pinned).filter((it) => set.has(it.id));
  } else {
    compact = byFull.slice(0, DEFAULT_PINNED_COUNT);
  }
  const inCompact = new Set(compact.map((it) => it.id));
  const expanded = Array.isArray(full) ? byFull : [...compact, ...items.filter((it) => !inCompact.has(it.id))];
  return { compact, expanded, hidden: expanded.filter((it) => !inCompact.has(it.id)) };
}

const idsOf = (list) => list.map((it) => it.id);

/** Pin / lepas pin satu menu. Menu yang baru di-pin ditaruh di akhir urutan ringkas. */
export function togglePin(items, layout, id) {
  const { compact } = resolveMenuLayout(items, layout);
  const ids = idsOf(compact);
  const pinned = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  return { pinned, full: layout?.full ?? null };
}

/** Geser satu menu di urutan RINGKAS (urutan "Lainnya dibuka" tidak disentuh). */
export function moveCompact(items, layout, fromId, toId) {
  const { compact } = resolveMenuLayout(items, layout);
  return { pinned: moveId(idsOf(compact), fromId, toId), full: layout?.full ?? null };
}

/**
 * Geser satu menu di urutan saat Lainnya DIBUKA. Urutan ringkas dikunci dulu (pinned diisi), karena
 * bawaannya diturunkan dari urutan penuh dan akan ikut bergeser kalau tidak dikunci.
 */
export function moveExpanded(items, layout, fromId, toId) {
  const { compact, expanded } = resolveMenuLayout(items, layout);
  return { pinned: idsOf(compact), full: moveId(idsOf(expanded), fromId, toId) };
}

export function readMenuLayout(role, storage = globalThis.localStorage) {
  try { return normalizeLayout(JSON.parse(storage?.getItem(keyFor(role)) || 'null')); } catch { return null; }
}

export function saveMenuLayout(role, layout, storage = globalThis.localStorage) {
  try { storage?.setItem(keyFor(role), JSON.stringify(layout)); } catch { /* storage penuh / diblokir: abaikan */ }
}

export function clearMenuOrder(role, storage = globalThis.localStorage) {
  try { storage?.removeItem(keyFor(role)); } catch { /* abaikan */ }
}
