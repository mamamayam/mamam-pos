import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { deviceRpcArg } from '../lib/deviceId';
import { toLocalDateString } from '../utils/formatters';
import {
  newAdditionRow, additionUpdateRow, deductionRpcArgs, summarizeTodayExpenses, buildFeed, startOfLocalDayISO,
  mapAdditionRow, mapDeductionRow, mapExpenseRow, additionChanged,
} from '../features/home/quickEntryMath';
import { onApprovalsChanged } from './usePendingApprovals';
import { updateDeduction as updateDeductionRpc, fetchExpensePayment } from './deductionEdit';

/**
 * useQuickEntries — data "Catat Cepat" di Beranda, ONLINE-FIRST.
 *
 *  - Tambah (payroll_additions): staf mengajukan ('menunggu'). Owner memutuskan di sheet Persetujuan
 *    (features/approvals); di sini keputusan hanya terdengar lewat sinyal onApprovalsChanged -> muat ulang.
 *  - Potongan: RPC catat_potongan = potongan gaji + pengeluaran karyawan dalam SATU
 *    transaksi (tunai otomatis mengurangi saldo Dompet).
 *  - Pengeluaran toko: disimpan form Pengeluaran biasa (ExpenseFormSheet); di sini hanya dibaca.
 *  - Owner bisa MENGUBAH catatan dari daftar Beranda: Tambah (updateAddition), Potongan (updateDeduction,
 *    RPC ubah_potongan), Pengeluaran toko (form Pengeluaran + afterExpenseSaved).
 *
 * Kalau migrasi 009 belum dijalankan, Beranda tetap tampil (kolom baru dianggap kosong),
 * dan menyimpan memberi pesan jelas untuk menjalankan migrasinya.
 */

const MIGRATION_HINT = 'Fitur ini butuh migrasi baru: jalankan supabase/migrations/009_catat_cepat.sql di SQL Editor dulu.';
const fail = (error, aksi) => {
  // PGRST204 = kolom tidak ada, PGRST202 = fungsi tidak ada (schema cache), 42703/42883 = kolom/fungsi tidak ada (Postgres)
  if (['PGRST204', 'PGRST202', '42703', '42883'].includes(error.code) || /schema cache|does not exist/i.test(error.message || '')) throw new Error(MIGRATION_HINT);
  throw new Error(`${aksi}: ${error.message}`);
};

const EXPENSE_COLUMNS = 'id, category, amount, transaction_date, store_or_supplier_name, detail, payment_method, cash_holder_employee_id, cash_holder_name, created_at';

export function useQuickEntries({ canApprove, onChanged }) {
  const [employees, setEmployees] = useState([]);
  const [additions, setAdditions] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [today, setToday] = useState(toLocalDateString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; });   // selalu pakai callback terbaru tanpa memicu reload
  const lastRequester = useRef('');   // "Dicatat oleh" terakhir dipakai, supaya staf tidak memilih ulang tiap kali

  const reload = useCallback(async () => {
    try {
      const day = toLocalDateString();
      const since = startOfLocalDayISO(day);
      const inToday = (col) => `${col}.eq.${day},created_at.gte.${since}`;   // dicatat untuk hari ini ATAU dibuat hari ini

      const fetchExpenses = async () => {
        const base = (cols) => supabase.from('expenses').select(cols).eq('direction', 'pengeluaran').or(inToday('transaction_date')).order('created_at', { ascending: false });
        const first = await base(`${EXPENSE_COLUMNS}, employee_id`);
        if (!first.error) return first;
        return base(EXPENSE_COLUMNS);   // migrasi 009 belum ada: semua dianggap pengeluaran toko
      };

      const [emps, adds, deds, exps] = await Promise.all([
        supabase.from('employees').select('id, name, role, status').order('name'),
        supabase.from('payroll_additions').select('*').or(inToday('date')).order('created_at', { ascending: false }),
        supabase.from('payroll_deductions').select('*').or(inToday('date')).order('created_at', { ascending: false }),
        fetchExpenses(),
      ]);
      const bad = [emps, adds, deds, exps].find(r => r.error);
      if (bad) throw new Error(bad.error.message);

      const nameById = Object.fromEntries((emps.data || []).map(e => [e.id, e.name]));
      setEmployees((emps.data || []).filter(e => e.status !== 'resign'));
      setAdditions((adds.data || []).map(r => mapAdditionRow(r, nameById)));
      setDeductions((deds.data || []).map(r => mapDeductionRow(r, nameById)));
      setExpenses((exps.data || []).map(mapExpenseRow));
      setToday(day);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => onApprovalsChanged(reload), [reload]);   // owner memutuskan di sheet Persetujuan: daftar catatan ikut segar

  // Owner perlu melihat pengajuan baru tanpa refresh: muat ulang saat aplikasi dibuka kembali + tiap 60 detik.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') reload(); };
    const timer = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [reload]);

  /** Tambah: owner langsung disetujui, staf menunggu persetujuan. Mengembalikan 'disetujui' | 'menunggu'. */
  const submitAddition = async (form) => {
    const row = newAdditionRow(form, { canApprove, nowISO: new Date().toISOString() });
    const { error: e } = await supabase.from('payroll_additions').insert(row);
    if (e) fail(e, 'Gagal menyimpan tambahan');
    if (!canApprove) lastRequester.current = form.requestedBy;
    await reload();
    onChangedRef.current?.();
    return row.status;
  };

  /** Potongan: langsung dicatat + jadi pengeluaran karyawan (tunai = mengurangi Dompet). */
  const submitDeduction = async (form) => {
    const { error: e } = await supabase.rpc('catat_potongan', { ...deductionRpcArgs(form), ...deviceRpcArg() });
    if (e) fail(e, 'Gagal menyimpan potongan');
    await reload();
    onChangedRef.current?.();   // potongan = pengeluaran karyawan: kartu di Beranda ikut berubah
  };

  /** Staf membatalkan pengajuan yang masih menunggu. */
  const cancelRequest = async (id) => {
    const { error: e } = await supabase.from('payroll_additions').delete().eq('id', id).eq('status', 'menunggu');
    if (e) fail(e, 'Gagal membatalkan pengajuan');
    await reload();
    onChangedRef.current?.();
  };

  /**
   * Owner: ubah Tambah (apa pun statusnya; status/persetujuan tidak berubah). Periode gaji yang sudah
   * ditutup ditolak oleh database (trigger migrasi 006).
   */
  const updateAddition = async (id, form, hadDetail = false) => {
    const patch = additionUpdateRow(form, { hadDetail });
    // Penanda "Diedit" (kolom edited_at, migrasi 019) hanya diisi kalau isinya benar-benar berubah.
    const { data: before } = await supabase.from('payroll_additions').select('*').eq('id', id).maybeSingle();
    const changed = before ? additionChanged(mapAdditionRow(before), patch) : false;
    const run = (p) => supabase.from('payroll_additions').update(p).eq('id', id).select('id');
    let { data, error: e } = await run(changed ? { ...patch, edited_at: new Date().toISOString() } : patch);
    // Kolom edited_at belum ada (migrasi 019 belum dijalankan): simpan perubahannya saja, tanpa penanda.
    if (e && changed && ['PGRST204', '42703'].includes(e.code)) ({ data, error: e } = await run(patch));
    if (e) fail(e, 'Gagal mengubah tambahan');
    if (!data || data.length === 0) { await reload(); throw new Error('Tambahan ini sudah tidak ada (mungkin dihapus). Tampilan sudah diperbarui.'); }
    await reload();
    onChangedRef.current?.();
  };

  /** Owner: ubah Potongan + pengeluaran karyawannya dalam satu transaksi (RPC ubah_potongan). */
  const updateDeduction = async (id, form) => {
    await updateDeductionRpc(id, form);
    await reload();
    onChangedRef.current?.();
  };

  /** Sumber dana (Tunai/Non-Tunai) pengeluaran yang tertaut ke potongan; null = potongan lama tanpa pengeluaran. */
  const deductionPayment = async (deduction) => {
    if (!deduction?.expenseId) return null;
    const known = expenses.find(x => x.id === deduction.expenseId);
    if (known) return known.paymentMethod === 'Non-Tunai' ? 'Non-Tunai' : 'Tunai';
    return fetchExpensePayment(deduction.expenseId);   // pengeluaran tidak ada di daftar hari ini: tanya database, jangan menebak
  };

  /** Setelah form Pengeluaran biasa menyimpan. */
  const afterExpenseSaved = async () => { await reload(); onChangedRef.current?.(); };

  const totals = useMemo(() => summarizeTodayExpenses(expenses, today), [expenses, today]);
  const feed = useMemo(() => buildFeed({ additions, deductions, expenses }), [additions, deductions, expenses]);

  return {
    employees, feed, totals, today, loading, error, reload,
    submitAddition, submitDeduction, cancelRequest, afterExpenseSaved, lastRequester,
    updateAddition, updateDeduction, deductionPayment,
  };
}
