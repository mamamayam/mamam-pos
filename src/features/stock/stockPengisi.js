/**
 * Pengisi checklist stok = orang yang MENGETIK namanya sendiri sebelum mengisi (bukan otomatis dari siapa
 * yang membuka Dompet, karena yang mengisi checklist bisa orang lain). Disimpan per hari bisnis di
 * localStorage HP ini supaya tidak hilang kalau halaman dimuat ulang di tengah pengisian; ganti hari = tanya lagi.
 */
const PREFIX = 'mamam-pos-stok-pengisi:';

/** Rapikan nama: buang spasi di ujung dan spasi ganda ("Sri  Depi " -> "Sri Depi"). */
export const cleanName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
/** Nama dianggap sah kalau minimal 2 karakter. */
export const validName = (v) => cleanName(v).length >= 2;

const store = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };

export function readPengisi(day, storage = store()) {
  if (!day || !storage) return '';
  try { return cleanName(storage.getItem(PREFIX + day)); } catch { return ''; }
}

export function savePengisi(day, name, storage = store()) {
  if (!day || !storage) return;
  try {
    const n = cleanName(name);
    if (n) storage.setItem(PREFIX + day, n); else storage.removeItem(PREFIX + day);
  } catch { /* penyimpanan diblokir: nama tetap hidup di layar, hanya tidak tahan muat ulang */ }
}
