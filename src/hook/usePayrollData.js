import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { computePayroll } from '../features/payroll/payrollEngine';
import { loadAttendance } from '../features/payroll/attendanceProvider';
import { toLocalDateString } from '../utils/formatters';
import { employeeGrossCost } from '../features/payroll/payrollCost';
import { prepareLogs, nowMinutesOf } from '../features/attendance/dayRules';
import { fetchOverrides } from './attendanceOverrides';
import { isOnDuty } from '../features/employee/employeeOptions';
import { isCountedAddition, countPendingAdditions } from '../features/payroll/additionApproval';
import { parseDetail } from '../features/payroll/additionDetail';
import { deductionUpdateArgs } from '../features/home/quickEntryMath';

/**
 * usePayrollData — data Penggajian untuk satu periode (mingguan Jumat–Kamis
 * atau bulanan), ONLINE-FIRST.
 *
 * Sumber data:
 *  - karyawan, tambahan, potongan, saldo awal  -> project Supabase C (baca & tulis)
 *  - absensi                                    -> sistem absensi (project A, BACA-SAJA)
 * Semua angka dihitung ulang oleh payrollEngine tiap tampil; tidak ada hasil
 * gaji yang disimpan, jadi tidak ada angka basi yang bisa nyangkut.
 *
 * Kalau absensi belum tersambung / gagal dibaca, `results` KOSONG dan status
 * dijelaskan — TIDAK menampilkan gaji Rp 0 yang menyesatkan.
 */

const fail = (error, aksi) => { throw new Error(`${aksi}: ${error.message}`); };
const MIGRATION_010 = 'Mengubah potongan butuh migrasi baru: jalankan supabase/migrations/010_ubah_potongan.sql di SQL Editor dulu.';
const day = (v) => String(v).slice(0, 10);

const toEngineEmployee = (e) => ({
  id: e.id, wagePerHour: e.wage_per_hour, bonusFullTime: e.bonus_full_time, overtimeRatePer30Min: e.overtime_rate_per_30_min,
});

export function usePayrollData({ period, attendanceClient = supabase }) {
  const [employees, setEmployees] = useState([]);
  const [additions, setAdditions] = useState([]);
  const [pendingAdditions, setPendingAdditions] = useState(0);   // pengajuan Tambahan yang belum diputuskan owner (tidak dihitung di gaji)
  const [deductions, setDeductions] = useState([]);
  const [openingBalances, setOpeningBalances] = useState({});
  const [closing, setClosing] = useState(null);           // penutupan periode ini (kalau sudah ditutup)
  const [closingLines, setClosingLines] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [empList, setEmpList] = useState([]);
  const [attendance, setAttendance] = useState({ status: 'loading', data: null, error: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const start = period.start, end = period.end, monthKey = period.monthKey;

  const reload = useCallback(async () => {
    try {
      const [emps, adds, deds, opens, clos] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase.from('payroll_additions').select('*').gte('date', start).lte('date', end).order('date'),
        supabase.from('payroll_deductions').select('*').gte('date', start).lte('date', end).order('date'),
        monthKey ? supabase.from('payroll_opening_balances').select('*').eq('month', monthKey) : Promise.resolve({ data: [], error: null }),
        supabase.from('payroll_closings').select('*').eq('period_start', start).eq('period_end', end),
      ]);
      const bad = [emps, adds, deds, opens, clos].find(r => r.error);
      if (bad) throw new Error(bad.error.message);

      const empRows = (emps.data || []).map(e => ({ ...e, externalId: e.external_id || null, name: e.name }));
      setEmployees(empRows); setEmpList(empRows);
      // Hanya Tambahan yang DISETUJUI yang masuk hitungan gaji (menunggu/ditolak diabaikan).
      setAdditions((adds.data || []).filter(isCountedAddition).map(a => ({ id: a.id, employeeId: a.employee_id, label: a.label, amount: a.amount, date: day(a.date), category: a.category, detail: parseDetail(a.detail) })));
      setPendingAdditions(countPendingAdditions(adds.data));
      setDeductions((deds.data || []).map(d => ({ id: d.id, employeeId: d.employee_id, label: d.label, amount: d.amount, date: day(d.date), category: d.category, expenseId: d.expense_id || null })));
      setOpeningBalances(Object.fromEntries((opens.data || []).map(o => [`${o.employee_id}|${o.month}`, o.amount])));
      const closed = (clos.data || [])[0] || null;
      if (closed) {
        const lines = await supabase.from('payroll_closing_lines').select('*').eq('closing_id', closed.id);
        if (lines.error) throw new Error(lines.error.message);
        setClosing(closed); setClosingLines(lines.data || []);
      } else { setClosing(null); setClosingLines([]); }
      setError(null);
      setLoading(false);

      // Periode tertutup: angka diambil dari foto yang tersimpan, absensi tidak dibaca lagi.
      if (closed) { setAttendance({ status: 'closed', data: null, error: null }); return; }
      setAttendance(prev => ({ status: 'loading', data: prev.data, error: null }));
      try {
        const [data, ovr] = await Promise.all([
          loadAttendance(attendanceClient, { start, end }, empRows),
          fetchOverrides(start, end).catch(() => []),   // koreksi gagal dibaca: pakai absensi apa adanya
        ]);
        setOverrides(ovr);
        setAttendance({ status: 'ready', data, error: null });
      } catch (e) {
        setAttendance({ status: 'error', data: null, error: e.message });
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [start, end, monthKey, attendanceClient]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);

  const today = toLocalDateString();

  // Log siap hitung: absensi + koreksi owner + aturan harian (pulang/libur otomatis).
  // `engineToday` = hari ini versi engine (setelah 21:00 hari ini dianggap sudah lewat);
  // `today` asli tetap dipakai untuk syarat tutup periode.
  const prepared = useMemo(() => {
    if (attendance.status !== 'ready' || !attendance.data) return null;
    return prepareLogs({ logs: attendance.data.logs, overrides, employees: empList, period: { start, end }, today, nowMinutes: nowMinutesOf() });
  }, [attendance, overrides, empList, start, end, today]);

  const { results, totals } = useMemo(() => {
    const sumTotals = (rows) => {
      const sum = (f) => rows.reduce((s, r) => s + f(r.payroll), 0);
      return {
        wage: sum(p => p.attendance.wagePay), overtime: sum(p => p.attendance.overtimePay), fullTime: sum(p => p.attendance.fullTimeBonusPay),
        additions: sum(p => p.additionsTotal), deductions: sum(p => p.deductionsTotal), openingBalance: sum(p => p.openingBalance),
        net: sum(p => p.netPay),
      };
    };
    if (closing) {
      const rows = closingLines
        .map(l => ({ employee: { id: l.employee_id || l.id, name: l.employee_name, role: l.role, status: 'tutup', externalId: l.employee_external_id }, payroll: l.payroll_json, rates: l.rates_json || null, needsClarification: [] }))
        .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
      return { results: rows, totals: sumTotals(rows) };
    }
    if (attendance.status !== 'ready') return { results: [], totals: null };
    const logs = prepared.logs;
    const engineToday = prepared.effectiveToday;
    const rows = [];
    for (const e of employees) {
      const payroll = computePayroll({
        employee: toEngineEmployee(e), logs, additions, deductions, openingBalances, period: { start, end, monthKey, isMonth: !!monthKey }, today: engineToday,
      });
      const active = payroll.attendance.dayRows.length > 0 || payroll.additions.length > 0 || payroll.deductions.length > 0 || payroll.openingBalance !== 0;
      if (!isOnDuty(e) && !active) continue;      // cuti/resign tanpa aktivitas di periode ini: disembunyikan
      const needsClarification = payroll.attendance.dayRows.filter(r => r.status === 'perluKlarifikasi');
      rows.push({ employee: { id: e.id, name: e.name, role: e.role, status: e.status, externalId: e.externalId }, payroll, rates: toEngineEmployee(e), needsClarification });
    }
    return { results: rows, totals: sumTotals(rows) };
  }, [closing, closingLines, attendance, prepared, employees, additions, deductions, openingBalances, start, end, monthKey, today]);

  // Status gabungan untuk layar: 'closed' berarti angka berasal dari foto yang tersimpan.
  const status = closing ? 'closed' : attendance.status;
  const isLocked = !!closing;

  // Alasan periode BELUM boleh ditutup (kosong = boleh).
  const closeBlockers = [];
  if (!closing) {
    if (attendance.status !== 'ready') closeBlockers.push('Absensi belum siap dibaca.');
    else {
      if (end >= today) closeBlockers.push('Periode belum selesai (baru bisa ditutup setelah tanggal akhirnya lewat).');
      const klar = results.reduce((n, r) => n + r.needsClarification.length, 0);
      if (klar > 0) closeBlockers.push(`Ada ${klar} hari perlu klarifikasi (bolong belum selesai). Selesaikan dulu supaya gajinya tidak salah dibekukan.`);
      if (results.length === 0) closeBlockers.push('Tidak ada data gaji pada periode ini.');
      if (pendingAdditions > 0) closeBlockers.push(`Ada ${pendingAdditions} pengajuan Tambahan yang belum diputuskan (lihat Beranda). Setujui atau tolak dulu supaya tidak terlewat dari gaji.`);
    }
  }

  // ── Penulisan (semua ke server, gagal = pesan jelas) ────────────────
  const deleteAddition = async (id) => {
    const { error: e } = await supabase.from('payroll_additions').delete().eq('id', id);
    if (e) fail(e, 'Gagal menghapus tambahan');
    await reload();
  };
  const deleteDeduction = async (id) => {
    // Potongan dari "Catat Cepat" terhubung ke pengeluaran karyawan (dan saldo Dompet kalau tunai):
    // menghapus pengeluarannya ikut menghapus potongan (ON DELETE CASCADE), jadi keduanya hilang bersama.
    const target = deductions.find(d => d.id === id);
    const { error: e } = target?.expenseId
      ? await supabase.from('expenses').delete().eq('id', target.expenseId)
      : await supabase.from('payroll_deductions').delete().eq('id', id);
    if (e) fail(e, 'Gagal menghapus potongan');
    await reload();
  };

  /**
   * Ubah potongan: RPC ubah_potongan mengubah potongan gaji + pengeluaran karyawannya dalam SATU transaksi
   * (nominal, tanggal, kategori, keterangan, sumber dana). Periode yang sudah ditutup ditolak oleh database.
   */
  const updateDeduction = async (id, form) => {
    const { error: e } = await supabase.rpc('ubah_potongan', deductionUpdateArgs(id, form));
    if (e) {
      if (['PGRST202', '42883'].includes(e.code) || /schema cache|does not exist/i.test(e.message || '')) throw new Error(MIGRATION_010);
      fail(e, 'Gagal mengubah potongan');
    }
    await reload();
  };

  /** Sumber dana (Tunai/Non-Tunai) pengeluaran yang terhubung ke potongan; null kalau potongan lama tanpa pengeluaran. */
  const getDeductionPayment = async (id) => {
    const target = deductions.find(d => d.id === id);
    if (!target?.expenseId) return null;
    const { data, error: e } = await supabase.from('expenses').select('payment_method').eq('id', target.expenseId).maybeSingle();
    if (e) fail(e, 'Gagal membaca sumber dana potongan');
    return data?.payment_method === 'Non-Tunai' ? 'Non-Tunai' : 'Tunai';
  };

  /** Saldo awal bulan (hanya periode bulanan). Positif = karyawan berutang ke toko. */
  const setOpeningBalance = async (employeeId, amount) => {
    if (!monthKey) throw new Error('Saldo awal hanya untuk periode bulanan.');
    const amt = Number(amount);
    if (!Number.isInteger(amt)) throw new Error('Saldo awal harus angka bulat.');
    const del = await supabase.from('payroll_opening_balances').delete().eq('employee_id', employeeId).eq('month', monthKey);
    if (del.error) fail(del.error, 'Gagal menyimpan saldo awal');
    if (amt !== 0) {
      const { error: e } = await supabase.from('payroll_opening_balances').insert({ employee_id: employeeId, month: monthKey, amount: amt });
      if (e) fail(e, 'Gagal menyimpan saldo awal');
    }
    await reload();
  };

  /** Bekukan angka periode ini. Atomik di database (satu transaksi). */
  const closePeriod = async (note) => {
    if (closeBlockers.length > 0) throw new Error(closeBlockers[0]);
    const lines = results.map(r => {
      const e = employees.find(x => x.id === r.employee.id) || {};
      const c = employeeGrossCost(r);
      return {
        employee_id: r.employee.id, employee_name: r.employee.name, employee_external_id: r.employee.externalId || '', role: r.employee.role || '',
        net_pay: r.payroll.netPay, gross_cost: c.gross, kasbon_total: c.kasbon,
        rates_json: { wagePerHour: e.wage_per_hour, bonusFullTime: e.bonus_full_time, overtimeRatePer30Min: e.overtime_rate_per_30_min },
        payroll_json: r.payroll,
      };
    });
    const { error: e } = await supabase.rpc('close_payroll_period', {
      p_type: monthKey ? 'bulan' : 'minggu', p_start: start, p_end: end, p_today: today, p_note: note || '', p_lines: lines,
    });
    if (e) {
      await reload();
      if (e.code === '23505' || /duplicate|unique/i.test(e.message)) throw new Error('Periode ini sudah ditutup dari perangkat lain. Tampilan sudah diperbarui.');
      fail(e, 'Gagal menutup periode');
    }
    await reload();
  };

  /** Buka kembali = hapus penutupan; angka kembali dihitung dari data terbaru. */
  const reopenPeriod = async () => {
    if (!closing) return;
    const { error: e } = await supabase.from('payroll_closings').delete().eq('id', closing.id);
    if (e) fail(e, 'Gagal membuka kembali periode');
    await reload();
  };

  return {
    loading, error, attendance, status, isLocked, closing, closeBlockers, results, totals, employees,
    prepared, overrideKeys: new Set(overrides.map(o => `${o.employeeId}|${o.date}`)),
    reload, deleteAddition, deleteDeduction, updateDeduction, getDeductionPayment, setOpeningBalance, closePeriod, reopenPeriod,
  };
}
