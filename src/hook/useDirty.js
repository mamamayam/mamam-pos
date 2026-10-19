import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useDirty(open, values) -> { dirty, rebase }
 *
 * Apakah isian form sudah berubah dari keadaan awalnya sejak form dibuka? Dipakai untuk prop `dirty`
 * pada Modal (peringatan "buang isian?" sebelum menutup).
 *
 * `values` = semua isian form dalam satu objek/array (dibandingkan lewat JSON). Keadaan awal diambil
 * sebentar SETELAH form terbuka, supaya isian awal yang diisi lewat effect (mode ubah, tanggal hari ini,
 * dll.) tidak dianggap ketikan pengguna. Form yang ditutup lalu dibuka lagi mengambil keadaan awal baru.
 *
 * `rebase()` = jadikan isian SEKARANG sebagai keadaan awal baru. Dipanggil setelah simpan berhasil dan
 * form dikosongkan untuk input berikutnya (form tidak menutup sendiri), supaya langsung dianggap bersih.
 *
 * Wajib dipanggil di komponen yang selalu terpasang (sebelum `if (!open) return null`), seperti hook lain.
 */
export const SETTLE_MS = 60;

export default function useDirty(open, values) {
  const json = JSON.stringify(values);
  const latest = useRef(json);
  latest.current = json;
  const [base, setBase] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!open) { setBase(null); return undefined; }
    timer.current = setTimeout(() => setBase(latest.current), SETTLE_MS);
    return () => clearTimeout(timer.current);
  }, [open]);

  const rebase = useCallback(() => {
    clearTimeout(timer.current);
    // setTimeout supaya state yang baru di-reset sudah ter-render sebelum diambil.
    timer.current = setTimeout(() => setBase(latest.current), 0);
  }, []);

  return { dirty: Boolean(open) && base !== null && json !== base, rebase };
}
