import { useEffect, useRef, useState } from 'react';
import { backStack } from '../lib/backStack';

/**
 * useBackLayer(aktif, onBack, { rearm })
 *
 * Selama `aktif` true, tombol Back browser/HP memanggil `onBack` (menutup
 * overlay ini) alih-alih keluar dari layar/aplikasi. Pasang di komponen
 * overlay: modal, laci, bottom sheet.
 *
 * Wajib dipanggil SEBELUM `if (!isOpen) return null` (aturan hooks).
 * `onBack` tidak perlu di-memoize; versi terbaru selalu dipakai.
 *
 * `rearm` (bawaan false): untuk overlay yang boleh MENOLAK ditutup (form yang isiannya belum disimpan
 * dan menampilkan konfirmasi dulu). Saat Back ditekan, backStack sudah membuang lapisannya; kalau
 * `onBack` ternyata tidak menutup overlay (`aktif` tetap true), lapisan didaftarkan lagi, jadi Back
 * berikutnya tetap menutup overlay ini dan bukan keluar dari layar. Kalau overlay memang tertutup,
 * `aktif` jadi false dan tidak ada yang didaftarkan ulang.
 */
export default function useBackLayer(active, onBack, { rearm = false } = {}) {
  const latest = useRef(onBack);
  const rearmRef = useRef(rearm);
  useEffect(() => { latest.current = onBack; rearmRef.current = rearm; });
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const id = backStack.register(() => {
      latest.current?.();
      if (rearmRef.current) setEpoch((n) => n + 1);
    });
    return () => backStack.unregister(id);
  }, [active, epoch]);
}
