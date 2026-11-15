import { describe, it, expect } from 'vitest';
import { isOnDuty, onDutyOnly, HIDDEN_STATUSES, statusChange } from './employeeOptions';

describe('cuti dan resign disembunyikan dari pilihan karyawan', () => {
  it('yang disembunyikan: cuti dan resign saja', () => expect(HIDDEN_STATUSES).toEqual(['cuti', 'resign']));
  it('aktif dan freelance tampil; cuti dan resign tidak', () => {
    expect(isOnDuty({ status: 'aktif' })).toBe(true);
    expect(isOnDuty({ status: 'freelance' })).toBe(true);
    expect(isOnDuty({ status: 'cuti' })).toBe(false);
    expect(isOnDuty({ status: 'resign' })).toBe(false);
  });
  it('tanpa status (data lama/sebagian): tidak disembunyikan', () => {
    expect(isOnDuty({})).toBe(true);
    expect(isOnDuty(undefined)).toBe(true);
  });
  it('onDutyOnly menyaring daftar, urutan tetap, aman untuk null', () => {
    const list = [{ id: 1, status: 'aktif' }, { id: 2, status: 'cuti' }, { id: 3, status: 'resign' }, { id: 4, status: 'freelance' }];
    expect(onDutyOnly(list).map((e) => e.id)).toEqual([1, 4]);
    expect(onDutyOnly(null)).toEqual([]);
  });
  it('status kembali aktif = muncul lagi', () => {
    expect(isOnDuty({ status: 'cuti' })).toBe(false);
    expect(isOnDuty({ status: 'aktif' })).toBe(true);
  });
});

describe('statusChange (dropdown status di kartu Karyawan)', () => {
  it('resign tanpa tanggal resign memakai hari ini; yang sudah punya tanggal dipertahankan', () => {
    expect(statusChange({ resignDate: '' }, 'resign', '2026-11-16')).toEqual({ status: 'resign', resignDate: '2026-11-16' });
    expect(statusChange({ resignDate: '2026-10-01' }, 'resign', '2026-11-16')).toEqual({ status: 'resign', resignDate: '2026-10-01' });
  });
  it('status lain mengosongkan tanggal resign (kembali aktif = tidak resign lagi)', () => {
    for (const st of ['aktif', 'freelance', 'cuti']) expect(statusChange({ resignDate: '2026-10-01' }, st, '2026-11-16')).toEqual({ status: st, resignDate: '' });
  });
});
