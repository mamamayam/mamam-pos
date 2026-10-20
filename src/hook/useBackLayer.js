import { useEffect, useRef } from 'react';
import { backStack } from '../lib/backStack';

/**
 * useBackLayer(aktif, onBack, { guard })
 *
 * Selama `aktif` true, tombol Back browser/HP memanggil `onBack` (menutup
 * overlay ini) alih-alih keluar dari layar/aplikasi. Pasang di komponen
 * overlay: modal, laci, bottom sheet.
 *
 * Wajib dipanggil SEBELUM `if (!isOpen) return null` (aturan hooks).
 * `onBack` tidak perlu di-memoize; versi terbaru selalu dipakai.
 *
 * `guard` (bawaan false): untuk overlay yang boleh MENOLAK ditutup (form yang isiannya belum disimpan dan
 * menampilkan konfirmasi dulu). Selama true, Back hanya memanggil `onBack` (yang menampilkan konfirmasi) dan
 * lapisan TETAP terpasang: backStack mengembalikan entri riwayatnya saat itu juga. Jangan diganti dengan
 * "daftar ulang setelah render": Back kedua yang datang cepat akan keluar dari aplikasi (lihat backStack.js).
 */
export default function useBackLayer(active, onBack, { guard = false } = {}) {
  const latest = useRef(onBack);
  const guardRef = useRef(guard);
  useEffect(() => { latest.current = onBack; guardRef.current = guard; });

  useEffect(() => {
    if (!active) return undefined;
    const id = backStack.register(() => latest.current?.(), { guard: () => guardRef.current });
    return () => backStack.unregister(id);
  }, [active]);
}
