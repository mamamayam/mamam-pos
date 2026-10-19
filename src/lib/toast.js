/**
 * toast — notifikasi singkat yang tidak menghalangi layar (beda dengan triggerAlert yang memunculkan
 * dialog dan menunggu "Oke"). Dipakai setelah form selesai diisi, supaya pengguna yang mencatat
 * banyak data berturut-turut tidak perlu menekan tombol tambahan.
 *
 *   showToast('Pengeluaran tersimpan')                       // sukses (bawaan)
 *   showToast('Gagal ...', { type: 'error' })
 *   showToast('Terkirim ke owner ...', { duration: 4500 })   // ms; bawaan 2200
 *
 * Modul murni tanpa React: `Toaster` (components/ui/Toaster.jsx) berlangganan dan menampilkannya.
 * Toast terbaru MENGGANTIKAN yang sedang tampil (id baru, jadi animasinya diputar ulang) sehingga
 * simpan beruntun tidak menumpuk daftar notifikasi.
 */
export const TOAST_DURATION_MS = 2200;

const listeners = new Set();
let seq = 0;
let current = null;

/** Tampilkan toast. Mengembalikan id-nya. Pesan kosong diabaikan. */
export function showToast(message, { type = 'success', duration = TOAST_DURATION_MS } = {}) {
  const text = String(message ?? '').trim();
  if (!text) return null;
  seq += 1;
  current = { id: seq, message: text, type: type === 'error' ? 'error' : 'success', duration };
  listeners.forEach((fn) => { try { fn(current); } catch (err) { console.error('[toast] listener gagal:', err); } });
  return seq;
}

/** Sembunyikan toast `id` (atau yang sedang tampil kalau id tidak diberikan). */
export function dismissToast(id) {
  if (!current || (id != null && current.id !== id)) return;
  current = null;
  listeners.forEach((fn) => { try { fn(null); } catch (err) { console.error('[toast] listener gagal:', err); } });
}

/** Berlangganan perubahan toast (null = sembunyi). Mengembalikan fungsi berhenti. */
export function subscribeToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getToast = () => current;
