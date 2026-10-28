/**
 * Pengisi checklist stok = orang yang MEMILIH namanya sendiri dari data karyawan sebelum mengisi (bukan otomatis
 * dari siapa yang membuka Dompet, karena yang mengisi checklist bisa orang lain). Disimpan per hari bisnis di
 * localStorage HP ini supaya tidak hilang kalau halaman dimuat ulang di tengah pengisian; ganti hari = tanya lagi.
 */
const PREFIX = 'mamam-pos-stok-pengisi:';

/** Rapikan nama: buang spasi di ujung dan spasi ganda ("Sri  Depi " -> "Sri Depi"). */
export const cleanName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
/** Nama dianggap sah kalau minimal 2 karakter. */
export const validName = (v) => cleanName(v).length >= 2;

/**
 * Nama yang boleh dipilih = karyawan yang masih bisa absen (aturan sama dengan SQL `absen_daftar_karyawan`):
 * aktif, status aktif/freelance, dan belum lewat tanggal resign. Diurutkan menurut nama, tanpa nama ganda.
 * @param {Array<{name:string,status?:string,is_active?:boolean,resign_date?:string|null}>} rows
 * @param {string} today  "YYYY-MM-DD" (hari bisnis)
 */
export function pengisiNames(rows = [], today = '') {
  const out = new Set();
  for (const e of rows) {
    const name = cleanName(e?.name);
    if (!name) continue;
    if (e.is_active === false) continue;
    if (e.status && !['aktif', 'freelance'].includes(e.status)) continue;   // cuti dan resign tidak muncul
    if (e.resign_date && today && String(e.resign_date).slice(0, 10) <= today) continue;
    out.add(name);
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'id'));
}

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
