import { describe, it, expect } from 'vitest';
import { effectiveToday, applyOverrides, applyAutoRules, prepareLogs, summarizeDay, validateEdit, CUTOFF_MINUTES } from './dayRules.js';
import { computeDayResult, computePayroll, weekPeriodForDate } from '../payroll/payrollEngine.js';
import { buildAttendanceBoard } from './attendanceBoard.js';

const T = '2026-10-06', Y = '2026-10-05';
const emp = (id, o = {}) => ({ id, name: id, role: 'kasir', status: 'aktif', externalId: `EMP-${id}`, startDate: '2026-01-01', ...o });
const L = (employeeId, type, time, date = Y) => ({ id: `${employeeId}${type}${time}${date}`, employeeId, date, type, time });
const prep = (logs, employees = [emp('a')], today = T, nowMinutes = 12 * 60, overrides = [], period = { start: Y, end: T }) =>
  prepareLogs({ logs, overrides, employees, period, today, nowMinutes });

describe('effectiveToday — cutoff 21:00', () => {
  it('sebelum 21:00 hari ini tetap hari ini', () => expect(effectiveToday(T, CUTOFF_MINUTES - 1)).toBe(T));
  it('mulai 21:00 hari ini dianggap sudah lewat', () => expect(effectiveToday(T, CUTOFF_MINUTES)).toBe('2026-10-07'));
  it('lintas bulan', () => expect(effectiveToday('2026-10-31', 22 * 60)).toBe('2026-11-01'));
});

describe('pulang otomatis (lupa absen pulang)', () => {
  it('hari lewat, masuk tanpa pulang -> pulang 19:00 bertanda auto', () => {
    const r = prep([L('a', 'masuk', '09:00')]);
    const p = r.logs.find(l => l.type === 'pulang');
    expect(p).toMatchObject({ time: '19:00', auto: true, date: Y });
    expect(r.autoPulangCount).toBe(1);
  });
  it('masuk <= 09:00 + pulang otomatis 19:00 -> DAPAT bonus full time (permintaan owner)', () => {
    const r = prep([L('a', 'masuk', '09:00')]);
    const day = computeDayResult(r.logs.filter(l => l.date === Y), emp('a'), Y, r.effectiveToday);
    expect(day).toMatchObject({ status: 'hadir', workedMinutes: 600, fullTimeBonus: true, overtimeMinutes: 0 });
  });
  it('masuk 09:30 + pulang otomatis -> hadir tapi tanpa bonus', () => {
    const r = prep([L('a', 'masuk', '09:30')]);
    expect(computeDayResult(r.logs.filter(l => l.date === Y), emp('a'), Y, r.effectiveToday)).toMatchObject({ workedMinutes: 570, fullTimeBonus: false });
  });
  it('hari ini sebelum 21:00 -> belum diotomatiskan', () => {
    expect(prep([L('a', 'masuk', '09:00', T)], [emp('a')], T, 20 * 60).autoPulangCount).toBe(0);
  });
  it('hari ini setelah 21:00 -> pulang otomatis', () => {
    expect(prep([L('a', 'masuk', '09:00', T)], [emp('a')], T, 21 * 60).autoPulangCount).toBe(1);
  });
  it('masuk -> bolong -> masuk lagi -> lupa pulang: pulang otomatis', () => {
    const r = prep([L('a', 'masuk', '09:00'), L('a', 'bolong', '13:00'), L('a', 'masuk_lagi', '14:00')]);
    expect(r.autoPulangCount).toBe(1);
    expect(computeDayResult(r.logs.filter(l => l.date === Y), emp('a'), Y, r.effectiveToday)).toMatchObject({ status: 'hadir', workedMinutes: 540, bolongMinutes: 60 });
  });
  it('bolong menggantung TIDAK ditambah pulang otomatis (jadi pulang lewat aturan bolong)', () => {
    const r = prep([L('a', 'masuk', '09:00'), L('a', 'bolong', '14:00')]);
    expect(r.autoPulangCount).toBe(0);
    expect(computeDayResult(r.logs.filter(l => l.date === Y), emp('a'), Y, r.effectiveToday)).toMatchObject({ status: 'hadir', workedMinutes: 300, effectiveFromBolong: true });
  });
  it('bolong menggantung HARI INI setelah 21:00 -> dianggap jam pulang', () => {
    const r = prep([L('a', 'masuk', '09:00', T), L('a', 'bolong', '14:00', T)], [emp('a')], T, 21 * 60 + 5);
    expect(computeDayResult(r.logs.filter(l => l.date === T), emp('a'), T, r.effectiveToday)).toMatchObject({ status: 'hadir', workedMinutes: 300 });
  });
  it('bolong menggantung HARI INI sebelum 21:00 -> tetap perlu klarifikasi', () => {
    const r = prep([L('a', 'masuk', '09:00', T), L('a', 'bolong', '14:00', T)], [emp('a')], T, 15 * 60);
    expect(computeDayResult(r.logs.filter(l => l.date === T), emp('a'), T, r.effectiveToday).status).toBe('perluKlarifikasi');
  });
  it('bolong menggantung + ada pulang (buatan orang) tetap perlu klarifikasi', () => {
    const r = prep([L('a', 'masuk', '09:00'), L('a', 'bolong', '14:00'), L('a', 'pulang', '19:00')]);
    expect(computeDayResult(r.logs.filter(l => l.date === Y), emp('a'), Y, r.effectiveToday).status).toBe('perluKlarifikasi');
  });
  it('masuk malam (>= 19:00) tanpa pulang tidak ditebak', () => {
    expect(prep([L('a', 'masuk', '19:30')]).autoPulangCount).toBe(0);
  });
});

describe('libur otomatis', () => {
  const period = { start: '2026-10-01', end: T };
  it('hari lewat tanpa catatan -> libur auto; hari ini sebelum 21:00 -> belum', () => {
    const r = prep([L('a', 'masuk', '09:00', '2026-10-03'), L('a', 'pulang', '19:00', '2026-10-03')], [emp('a')], T, 12 * 60, [], period);
    const liburDates = r.logs.filter(l => l.type === 'libur').map(l => l.date);
    expect(liburDates).toEqual(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05']);
    expect(r.logs.filter(l => l.type === 'libur').every(l => l.auto)).toBe(true);
  });
  it('hari ini setelah 21:00 ikut libur kalau tidak ada catatan', () => {
    const r = prep([], [emp('a')], T, 21 * 60, [], { start: T, end: T });
    expect(r.logs.map(l => l.date)).toEqual([T]);
  });
  it('tidak ada libur sebelum tanggal mulai kerja', () => {
    const r = prep([], [emp('a', { startDate: '2026-10-04' })], T, 12 * 60, [], period);
    expect(r.logs.map(l => l.date)).toEqual(['2026-10-04', '2026-10-05']);
  });
  it('hanya status aktif; cuti/freelance/resign dilewati', () => {
    for (const status of ['cuti', 'freelance', 'resign']) expect(prep([], [emp('a', { status })], T, 12 * 60, [], period).autoLiburCount).toBe(0);
  });
  it('karyawan baru tanpa ID absensi lama tetap dapat libur otomatis (absennya memakai id karyawan sendiri)', () => {
    expect(prep([], [emp('a', { externalId: null })], T, 12 * 60, [], period).autoLiburCount).toBeGreaterThan(0);
  });
  it('bentuk baris DB (start_date/external_id) juga dikenali', () => {
    const r = prep([], [{ id: 'a', status: 'aktif', external_id: 'EMP-a', start_date: '2026-10-05' }], T, 12 * 60, [], period);
    expect(r.logs.map(l => l.date)).toEqual(['2026-10-05']);
  });
  it('libur tidak mengubah gaji, tapi tercatat di hitungan', () => {
    const e = { id: 'a', wagePerHour: 10000, bonusFullTime: 0, overtimeRatePer30Min: 5000 };
    const base = [L('a', 'masuk', '09:00', '2026-10-02'), L('a', 'pulang', '19:00', '2026-10-02')];
    const r = prep(base, [emp('a')], T, 12 * 60, [], period);
    const pay = (logs) => computePayroll({ employee: e, logs, additions: [], deductions: [], openingBalances: {}, period: { ...period, monthKey: null }, today: r.effectiveToday });
    expect(pay(r.logs).netPay).toBe(pay(base).netPay);
    expect(pay(r.logs).attendance.liburDays).toBe(4);
  });
  it('papan absensi: hari lewat tanpa log -> Libur (bukan Belum Absen)', () => {
    const r = prep([], [emp('a')], T, 12 * 60, [], { start: Y, end: Y });
    const row = buildAttendanceBoard([emp('a')], r.logs, Y, r.effectiveToday).rows[0];
    expect(row.status).toBe('libur'); expect(row.autoLibur).toBe(true);
  });
});

describe('koreksi owner', () => {
  const ovr = (o) => ({ employeeId: 'a', date: Y, libur: false, masuk: '', pulang: '', bolongs: [], ...o });
  it('menggantikan SELURUH log hari itu dan menandai edited', () => {
    const { logs } = applyOverrides([L('a', 'masuk', '09:00'), L('a', 'bolong', '14:00'), L('b', 'masuk', '08:00')], [ovr({ masuk: '10:00', pulang: '19:00' })]);
    expect(logs.filter(l => l.employeeId === 'a').map(l => [l.type, l.time])).toEqual([['masuk', '10:00'], ['pulang', '19:00']]);
    expect(logs.find(l => l.employeeId === 'a').edited).toBe(true);
    expect(logs.filter(l => l.employeeId === 'b')).toHaveLength(1);
  });
  it('bolong lengkap -> bolong + masuk lagi', () => {
    const { logs } = applyOverrides([], [ovr({ masuk: '09:00', bolongs: [{ from: '13:00', to: '14:00' }], pulang: '19:00' })]);
    expect(logs.map(l => l.type)).toEqual(['masuk', 'bolong', 'masuk_lagi', 'pulang']);
  });
  it('libur menggantikan absen', () => {
    const { logs } = applyOverrides([L('a', 'masuk', '09:00')], [ovr({ libur: true })]);
    expect(logs.map(l => l.type)).toEqual(['libur']);
  });
  it('koreksi bolong menggantung + pulang diizinkan lewat bentuk valid: menghapus bolong dari log', () => {
    const r = prep([L('a', 'masuk', '09:00'), L('a', 'bolong', '14:00'), L('a', 'pulang', '19:00')], [emp('a')], T, 12 * 60, [ovr({ masuk: '09:00', pulang: '19:00' })]);
    expect(computeDayResult(r.logs.filter(l => l.date === Y), emp('a'), Y, r.effectiveToday).status).toBe('hadir');
    expect(r.editedCount).toBe(1);
  });
  it('hari yang dikoreksi tidak kena libur otomatis; papan menandai diedit', () => {
    const r = prep([], [emp('a')], T, 12 * 60, [ovr({ masuk: '09:00', pulang: '19:00' })], { start: Y, end: Y });
    const row = buildAttendanceBoard([emp('a')], r.logs, Y, r.effectiveToday).rows[0];
    expect(row).toMatchObject({ status: 'sudahPulang', edited: true });
  });
  it('summarizeDay mengembalikan nilai form', () => {
    expect(summarizeDay([L('a', 'masuk', '09:00'), L('a', 'bolong', '13:00'), L('a', 'masuk_lagi', '14:00'), L('a', 'pulang', '19:00')]))
      .toEqual({ masuk: '09:00', pulang: '19:00', bolongs: [{ from: '13:00', to: '14:00' }], libur: false });
    expect(summarizeDay([{ type: 'libur', time: null }]).libur).toBe(true);
  });
});

describe('validateEdit', () => {
  it('libur selalu valid', () => expect(validateEdit({ libur: true })).toBeNull());
  it('kosong semua -> error', () => expect(validateEdit({ masuk: '', pulang: '', bolongs: [] })).toMatch(/jam masuk/i));
  it('pulang tanpa masuk -> error', () => expect(validateEdit({ masuk: '', pulang: '19:00', bolongs: [] })).toMatch(/masuk dulu/i));
  it('pulang sebelum masuk -> error', () => expect(validateEdit({ masuk: '10:00', pulang: '09:00', bolongs: [] })).toMatch(/setelah/));
  it('masuk saja (lupa pulang) valid', () => expect(validateEdit({ masuk: '09:00', pulang: '', bolongs: [] })).toBeNull());
  it('bolong menggantung + pulang -> ditolak dengan petunjuk', () => expect(validateEdit({ masuk: '09:00', pulang: '19:00', bolongs: [{ from: '14:00', to: '' }] })).toMatch(/masuk-lagi/i));
  it('bolong menggantung tanpa pulang valid (jadi jam pulang)', () => expect(validateEdit({ masuk: '09:00', pulang: '', bolongs: [{ from: '14:00', to: '' }] })).toBeNull());
  it('masuk-lagi sebelum mulai bolong -> error', () => expect(validateEdit({ masuk: '09:00', pulang: '', bolongs: [{ from: '14:00', to: '13:00' }] })).toMatch(/setelah mulai bolong/));
  it('dua bolong berurutan valid, bertabrakan ditolak', () => {
    expect(validateEdit({ masuk: '09:00', pulang: '19:00', bolongs: [{ from: '12:00', to: '12:30' }, { from: '15:00', to: '15:15' }] })).toBeNull();
    expect(validateEdit({ masuk: '09:00', pulang: '19:00', bolongs: [{ from: '12:00', to: '13:00' }, { from: '12:30', to: '13:30' }] })).toMatch(/tidak boleh sebelum/);
  });
});
