import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { deviceRpcArg } from '../lib/deviceId';
import { dayStartISO, nextDayStartISO } from '../features/reports/reportsMath';
import { requestIndex } from '../features/approvals/deleteRequestMath';
import { mapEditRequest, mapEditLog, validateEditRequest } from '../features/history/transactionEditMath';
import { notifyApprovalsChanged } from './usePendingApprovals';

/**
 * useTransactionEdits — Ubah transaksi (migrasi 024), ONLINE-FIRST. Aturan dan rumus: transactionEditMath.js.
 *
 *  ubahTransaksi         : jalur LANGSUNG. Staf hanya dalam 30 menit sejak dibayar (dicek database juga); owner kapan saja (`asOwner`).
 *  ajukanUbahTransaksi   : staf mengajukan ke owner (alasan + nama wajib); transaksi TIDAK berubah sampai owner setuju.
 *  putuskanUbahTransaksi : owner setuju (diterapkan database lewat jalur yang sama) atau tolak.
 *  useEditLog            : catatan perubahan untuk rentang tanggal (penanda pensil di Riwayat + riwayat perubahan di Detail).
 *  useEditRequestIndex   : pengajuan menunggu / ditolak 7 hari terakhir per transaksi (badge di Riwayat).
 *  usePendingEditRequests: daftar yang menunggu untuk sheet Persetujuan.
 *
 * Kalau migrasi 024 belum dijalankan: membaca diam-diam kosong (layar lain tidak terganggu), mengubah/mengajukan memberi petunjuk.
 */
export const EDIT_MIGRATION_HINT = 'Fitur ini butuh migrasi baru: jalankan supabase/migrations/024_ubah_transaksi.sql di SQL Editor dulu.';
const MISSING = ['PGRST202', 'PGRST205', '42883', '42P01'];
const missing = (e) => MISSING.includes(e?.code) || /schema cache|does not exist/i.test(e?.message || '');

/** Pesan galat database (raise exception) apa adanya; fungsi/tabel hilang = petunjuk migrasi. */
const fail = (error, aksi) => {
  if (missing(error)) throw new Error(EDIT_MIGRATION_HINT);
  if (error.code === '23505') throw new Error('Transaksi ini sudah diajukan untuk diubah, tunggu keputusan owner.');
  throw new Error(error.code === 'P0001' ? error.message : `${aksi}: ${error.message}`);
};

export async function ubahTransaksi(transactionId, changes, { asOwner = false } = {}) {
  const { error } = await supabase.rpc('ubah_transaksi', {
    p_transaction_id: transactionId, p_changes: changes, p_as_owner: Boolean(asOwner), ...deviceRpcArg(),
  });
  if (error) fail(error, 'Gagal mengubah transaksi');
  notifyApprovalsChanged();   // pengajuan ubah lain untuk transaksi ini ditutup database, hitung ulang badge
}

export async function ajukanUbahTransaksi(transactionId, changes, form) {
  const { reason, requestedBy } = validateEditRequest(form);
  const { error } = await supabase.rpc('ajukan_ubah_transaksi', {
    p_transaction_id: transactionId, p_changes: changes, p_reason: reason, p_requested_by: requestedBy, ...deviceRpcArg(),
  });
  if (error) fail(error, 'Gagal mengajukan ubah');
  notifyApprovalsChanged();
}

/** Owner: setujui (transaksi diubah) atau tolak. Mengembalikan 'disetujui' | 'ditolak'. */
export async function putuskanUbahTransaksi(requestId, approve, reason = '') {
  const { data, error } = await supabase.rpc('putuskan_ubah_transaksi', { p_request_id: requestId, p_approve: approve, p_reason: reason || null });
  if (error) { notifyApprovalsChanged(); fail(error, approve ? 'Gagal menyetujui' : 'Gagal menolak'); }
  notifyApprovalsChanged();
  return data;
}

const LOG_COLUMNS = 'id, transaction_id, display_number, edited_by, via, reason, device_name, before, after, created_at';
const sevenDaysAgoISO = () => new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

/** Catatan perubahan transaksi yang dibayar pada rentang tanggal lokal (null = tanpa batas). Migrasi belum ada = kosong. */
export function useEditLog({ fromDate, toDate }) {
  const [logs, setLogs] = useState([]);
  const reload = useCallback(async () => {
    let q = supabase.from('transaction_edits').select(LOG_COLUMNS);
    if (fromDate) q = q.gte('transaction_at', dayStartISO(fromDate));
    if (toDate) q = q.lt('transaction_at', nextDayStartISO(toDate));
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1000);
    setLogs(error ? [] : (data || []).map(mapEditLog));
  }, [fromDate, toDate]);
  useEffect(() => { reload(); }, [reload]);
  return { logs, reload };
}

/** transactionId -> pengajuan ubah (menunggu menang; kalau tidak ada, yang ditolak terbaru dalam 7 hari). */
export function useEditRequestIndex() {
  const [index, setIndex] = useState(() => new Map());
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('transaction_edit_requests').select('*')
      .or(`status.eq.menunggu,and(status.eq.ditolak,decided_at.gte.${sevenDaysAgoISO()})`);
    setIndex(error ? new Map() : requestIndex((data || []).map(mapEditRequest)));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { index, reload };
}

/** Pengajuan ubah yang menunggu (sheet Persetujuan owner), terlama dulu. */
export function usePendingEditRequests(enabled) {
  const [list, setList] = useState([]);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const { data, error: e } = await supabase.from('transaction_edit_requests').select('*').eq('status', 'menunggu').order('created_at');
    if (e) { setList([]); setError(missing(e) ? EDIT_MIGRATION_HINT : e.message); return; }
    setList((data || []).map(mapEditRequest));
    setError(null);
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { list, error, reload };
}
