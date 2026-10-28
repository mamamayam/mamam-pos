import { describe, it, expect } from 'vitest';
import { buildAttendanceBoard, bolongPairs } from './attendanceBoard.js';

const T = '2026-09-30', Y = '2026-09-29';
const emp = (id, name, status = 'aktif') => ({ id, name, role: 'kasir', status });
const L = (employeeId, type, time, date = T) => ({ id: employeeId + type + time, employeeId, date, type, time });
const status = (logs, date = T, today = T) => buildAttendanceBoard([emp('a', 'Andi')], logs, date, today).rows[0];

describe('buildAttendanceBoard — status per karyawan', () => {
  it('tidak ada catatan -> belum absen', () => { expect(status([]).status).toBe('belumAbsen'); });
  it('masuk saja, hari ini -> sedang jaga', () => { const r = status([L('a', 'masuk', '08:55')]); expect(r.status).toBe('sedangJaga'); expect(r.masuk).toBe('08:55'); });
  it('sedang bolong hari ini (belum kembali) -> bolong', () => {
    const r = status([L('a', 'masuk', '09:00'), L('a', 'bolong', '13:00')]);
    expect(r.status).toBe('bolong'); expect(r.bolongs).toEqual([{ from: '13:00', to: null }]);
  });
  it('bolong lalu masuk lagi -> kembali sedang jaga, pasangan lengkap', () => {
    const r = status([L('a', 'masuk', '09:00'), L('a', 'bolong', '13:00'), L('a', 'masuk_lagi', '14:00')]);
    expect(r.status).toBe('sedangJaga'); expect(r.bolongs).toEqual([{ from: '13:00', to: '14:00' }]);
  });
  it('masuk + pulang lengkap -> sudah pulang, dengan jam kerja', () => {
    const r = status([L('a', 'masuk', '09:00'), L('a', 'pulang', '19:00')]);
    expect(r).toMatchObject({ status: 'sudahPulang', masuk: '09:00', pulang: '19:00', workedMinutes: 600, overtimeMinutes: 0 });
  });
  it('lembur terlihat', () => { expect(status([L('a', 'masuk', '08:30'), L('a', 'pulang', '19:30')]).overtimeMinutes).toBe(60); });
  it('hari LEWAT, masuk tanpa pulang -> lupa pulang (bukan sedang jaga)', () => {
    expect(status([L('a', 'masuk', '09:00', Y)], Y, T).status).toBe('lupaPulang');
  });
  it('bolong nyangkut + ada pulang -> perlu klarifikasi', () => {
    expect(status([L('a', 'masuk', '09:00'), L('a', 'bolong', '13:00'), L('a', 'pulang', '19:00')]).status).toBe('perluKlarifikasi');
  });
  it('hari lewat, bolong nyangkut tanpa pulang -> sudah pulang dengan catatan "dianggap jam pulang"', () => {
    const r = status([L('a', 'masuk', '09:00', Y), L('a', 'bolong', '13:00', Y)], Y, T);
    expect(r.status).toBe('sudahPulang'); expect(r.workedMinutes).toBe(240); expect(r.note).toMatch(/dianggap jam pulang/);
  });
  it('libur', () => { expect(status([L('a', 'libur', null)]).status).toBe('libur'); });
  it('libur usang tapi karyawan masuk -> fakta (masuk) menang', () => { expect(status([L('a', 'libur', null), L('a', 'masuk', '10:00')]).status).toBe('sedangJaga'); });
  it('hanya bolong tanpa masuk -> belum absen', () => { expect(status([L('a', 'bolong', '13:00')]).status).toBe('belumAbsen'); });
  it('dua catatan pulang: dipakai yang terakhir', () => {
    expect(status([L('a', 'masuk', '09:00'), L('a', 'pulang', '17:00'), L('a', 'pulang', '19:00')]).pulang).toBe('19:00');
  });
  it('catatan hari lain / karyawan lain tidak ikut', () => {
    const r = buildAttendanceBoard([emp('a', 'Andi')], [L('b', 'masuk', '09:00'), L('a', 'masuk', '09:00', Y)], T, T).rows[0];
    expect(r.status).toBe('belumAbsen');
  });
});

describe('papan hari: urutan, hitungan, filter', () => {
  const employees = [emp('a', 'Andi'), emp('b', 'Budi'), emp('c', 'Citra'), emp('d', 'Dedi'), emp('e', 'Eko', 'resign'), emp('f', 'Fani'), emp('g', 'Gita', 'cuti'), emp('h', 'Hana', 'freelance')];
  const logs = [L('b', 'masuk', '09:00'), L('c', 'masuk', '09:00'), L('c', 'pulang', '19:00'), L('d', 'libur', null), L('f', 'masuk', '09:00'), L('f', 'bolong', '12:00'), L('e', 'masuk', '09:00')];
  const { rows, counts } = buildAttendanceBoard(employees, logs, T, T);
  it('karyawan resign tidak tampil', () => { expect(rows.map(r => r.employee.name)).not.toContain('Eko'); });
  it('karyawan cuti juga tidak tampil; freelance tampil', () => {
    const names = rows.map(r => r.employee.name);
    expect(names).not.toContain('Gita');
    expect(names).toContain('Hana');
  });
  it('urutan: sedang jaga, bolong, belum absen, sudah pulang, libur', () => {
    expect(rows.map(r => r.employee.name + ':' + r.status)).toEqual(['Budi:sedangJaga', 'Fani:bolong', 'Andi:belumAbsen', 'Hana:belumAbsen', 'Citra:sudahPulang', 'Dedi:libur']);
  });
  it('hitungan per status', () => { expect(counts).toMatchObject({ sedangJaga: 1, bolong: 1, belumAbsen: 2, sudahPulang: 1, libur: 1, lupaPulang: 0, perluKlarifikasi: 0 }); });
  it('daftar kosong aman', () => { expect(buildAttendanceBoard([], [], T, T).rows).toEqual([]); });
});

describe('bolongPairs', () => {
  it('beberapa bolong dipasangkan ke masuk-lagi berikutnya masing-masing', () => {
    const p = bolongPairs([L('a', 'bolong', '11:00'), L('a', 'masuk_lagi', '11:30'), L('a', 'bolong', '15:00'), L('a', 'masuk_lagi', '15:20')]);
    expect(p).toEqual([{ from: '11:00', to: '11:30' }, { from: '15:00', to: '15:20' }]);
  });
});
