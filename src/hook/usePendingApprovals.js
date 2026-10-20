import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';

/**
 * usePendingApprovals — jumlah pengajuan yang menunggu keputusan owner (Tambahan karyawan +
 * hapus transaksi + hapus pengeluaran), dipakai badge merah di BottomNav (ikon Beranda dan Menu) dan di tile
 * Persetujuan, supaya owner tahu ada laporan masuk walau sedang di layar lain.
 *
 * Toko kecil, jadi cukup polling ringan (tiap 60 detik + saat aplikasi dibuka kembali),
 * bukan realtime. Kalau migrasi 009 / 016 / 018 belum dijalankan, bagian itu diam-diam dihitung 0
 * (tidak mengganggu layar lain).
 */
let count = 0;
const listeners = new Set();

export function setPendingApprovals(n) {
  const next = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (next === count) return;
  count = next;
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Jumlah saat ini (untuk badge). */
export const usePendingApprovals = () => useSyncExternalStore(subscribe, () => count, () => 0);

/** Hitung ulang dari database: Tambahan menunggu + pengajuan hapus transaksi + pengajuan hapus pengeluaran menunggu. */
export async function refreshPendingApprovals() {
  const countOf = async (table) => {
    const { count: n, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('status', 'menunggu');
    return error ? 0 : (n || 0);
  };
  const [tambahan, hapus, hapusPengeluaran] = await Promise.all([
    countOf('payroll_additions'), countOf('transaction_delete_requests'), countOf('expense_delete_requests'),
  ]);
  setPendingApprovals(tambahan + hapus + hapusPengeluaran);
}

/**
 * Sinyal "keputusan persetujuan baru saja dibuat" (dari sheet Persetujuan): layar yang datanya ikut
 * berubah (mis. Catat Cepat di Beranda) memuat ulang tanpa menunggu polling.
 */
const CHANGED_EVENT = 'mamam-approvals-changed';
export const notifyApprovalsChanged = () => {
  refreshPendingApprovals();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED_EVENT));
};
export const onApprovalsChanged = (fn) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGED_EVENT, fn);
  return () => window.removeEventListener(CHANGED_EVENT, fn);
};

/** Pasang sekali di App: poll hanya kalau yang login boleh menyetujui (owner). */
export function usePendingApprovalsPoller(enabled) {
  useEffect(() => {
    if (!enabled) { setPendingApprovals(0); return undefined; }
    const tick = () => { if (document.visibilityState === 'visible') refreshPendingApprovals(); };
    tick();
    const timer = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); setPendingApprovals(0); };
  }, [enabled]);
}
