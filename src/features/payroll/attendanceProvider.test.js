import { describe, it, expect } from 'vitest';
import { mapAttendanceRows, fetchAttendanceRows, loadAttendance, defaultLocalHHmm, PAGE_SIZE } from './attendanceProvider.js';
import { computeDayResult } from './payrollEngine.js';

// Zona waktu tokoh tes: WITA (UTC+8). Diinjeksikan supaya tes tidak bergantung zona waktu mesin.
const wita = (iso) => { const t = new Date(iso).getTime(); if (Number.isNaN(t)) return null; return new Date(t + 8 * 3600000).toISOString().slice(11, 16); };
const row = (o) => ({ id: o.id ?? Math.random().toString(36).slice(2), payload: { id: o.id, employeeId: 'EMP-1', employeeName: 'Andi', deletedAt: null, ...o } });
const MAP = new Map([['EMP-1', 'uuid-1'], ['EMP-2', 'uuid-2']]);
const map = (rows) => mapAttendanceRows(rows, MAP, { toLocalHHmm: wita });

describe('mapAttendanceRows', () => {
  it("'keluar' -> 'pulang'; jam diubah ke waktu lokal; tanggal dari dateStr; id ke id karyawan C", () => {
    const { logs } = map([
      row({ id: 'a', type: 'masuk', date: '2026-09-04T00:58:00.000Z', dateStr: '2026-09-04' }),     // 08:58 WITA
      row({ id: 'b', type: 'keluar', date: '2026-09-04T11:05:00.000Z', dateStr: '2026-09-04' }),    // 19:05 WITA
    ]);
    expect(logs).toEqual([
      { id: 'a', employeeId: 'uuid-1', date: '2026-09-04', type: 'masuk', time: '08:58', auto: false },
      { id: 'b', employeeId: 'uuid-1', date: '2026-09-04', type: 'pulang', time: '19:05', auto: false },
    ]);
  });

  it('tanggal memakai dateStr, BUKAN tanggal dari timestamp (masuk 07:30 WITA = 23:30 UTC hari sebelumnya)', () => {
    const { logs } = map([row({ id: 'a', type: 'masuk', date: '2026-09-03T23:30:00.000Z', dateStr: '2026-09-04' })]);
    expect(logs[0]).toMatchObject({ date: '2026-09-04', time: '07:30' });
  });

  it('baris terhapus dilewati dan dihitung', () => {
    const r = map([row({ id: 'a', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04', deletedAt: '2026-09-05T00:00:00Z' })]);
    expect(r.logs).toEqual([]); expect(r.skippedDeleted).toBe(1);
  });

  it('karyawan yang belum ada di C dilaporkan (bukan diam-diam hilang)', () => {
    const r = map([row({ id: 'a', employeeId: 'EMP-99', employeeName: 'Orang Baru', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04' })]);
    expect(r.logs).toEqual([]); expect(r.unknownEmployees).toEqual([{ externalId: 'EMP-99', name: 'Orang Baru' }]);
  });

  it('baris rusak dilewati: tipe asing, tanggal jelek, timestamp jelek, bukan objek', () => {
    const r = map([
      row({ id: 'a', type: 'terbang', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04' }),
      row({ id: 'b', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: 'kemarin' }),
      row({ id: 'c', type: 'masuk', date: 'bukan-tanggal', dateStr: '2026-09-04' }),
      null, 'teks',
    ]);
    expect(r.logs).toEqual([]); expect(r.skippedInvalid).toBe(5);
  });

  it("'libur' tidak butuh jam (time = null)", () => {
    const { logs } = map([row({ id: 'a', type: 'libur', date: '2026-09-04T00:00:00Z', dateStr: '2026-09-04' })]);
    expect(logs[0]).toMatchObject({ type: 'libur', time: null });
  });

  it('URUT kronologis walau baris datang acak', () => {
    const { logs } = map([
      row({ id: 'p', type: 'keluar', date: '2026-09-04T11:00:00Z', dateStr: '2026-09-04' }),
      row({ id: 'm', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04' }),
    ]);
    expect(logs.map((l) => l.id)).toEqual(['m', 'p']);
  });

  it('LIBUR USANG (watchdog) dibuang kalau karyawan itu akhirnya masuk — gajinya tidak hangus', () => {
    const rows = [
      row({ id: 'l', type: 'libur', date: '2026-09-04T11:30:00Z', dateStr: '2026-09-04' }),   // tersimpan duluan
      row({ id: 'm', type: 'masuk', date: '2026-09-04T03:00:00Z', dateStr: '2026-09-04' }),   // 11:00 WITA (telat, absen setelahnya)
      row({ id: 'p', type: 'keluar', date: '2026-09-04T11:00:00Z', dateStr: '2026-09-04' }),
    ];
    const r = map(rows);
    expect(r.staleLiburIgnored).toBe(1);
    expect(r.logs.map((l) => l.type)).toEqual(['masuk', 'pulang']);
    // bukti dampaknya di mesin B: dengan libur ikut masuk, hari itu hangus
    const withLibur = [{ id: 'l', employeeId: 'uuid-1', date: '2026-09-04', type: 'libur', time: null }, ...r.logs];
    expect(computeDayResult(withLibur, {}, '2026-09-04', '2026-09-30').status).toBe('libur');   // hangus
    expect(computeDayResult(r.logs, {}, '2026-09-04', '2026-09-30').status).toBe('hadir');      // benar
  });

  it('libur yang sah (tanpa masuk) tetap dipertahankan', () => {
    const r = map([row({ id: 'l', type: 'libur', date: '2026-09-04T00:00:00Z', dateStr: '2026-09-04' })]);
    expect(r.logs).toHaveLength(1); expect(r.staleLiburIgnored).toBe(0);
  });

  it('libur di hari lain karyawan yang sama TIDAK ikut dibuang', () => {
    const r = map([
      row({ id: 'l', type: 'libur', date: '2026-09-05T00:00:00Z', dateStr: '2026-09-05' }),
      row({ id: 'm', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04' }),
    ]);
    expect(r.logs.some((l) => l.type === 'libur')).toBe(true);
  });

  it("dua 'keluar' di hari yang sama: pakai yang TERAKHIR (seperti mamam-global)", () => {
    const r = map([
      row({ id: 'm', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04' }),
      row({ id: 'k1', type: 'keluar', date: '2026-09-04T08:00:00Z', dateStr: '2026-09-04' }),
      row({ id: 'k2', type: 'keluar', date: '2026-09-04T11:00:00Z', dateStr: '2026-09-04' }),
    ]);
    expect(r.duplicatePulangIgnored).toBe(1);
    expect(r.logs.filter((l) => l.type === 'pulang').map((l) => l.id)).toEqual(['k2']);
  });

  it('karyawan berbeda tidak saling mempengaruhi (libur/pulang dihitung per karyawan)', () => {
    const r = map([
      row({ id: 'l', employeeId: 'EMP-2', type: 'libur', date: '2026-09-04T00:00:00Z', dateStr: '2026-09-04' }),
      row({ id: 'm', employeeId: 'EMP-1', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04' }),
    ]);
    expect(r.logs.find((l) => l.type === 'libur').employeeId).toBe('uuid-2');
  });

  it('defaultLocalHHmm: format HH:mm dan null untuk tak valid', () => {
    expect(defaultLocalHHmm('2026-09-04T01:00:00Z')).toMatch(/^\d{2}:\d{2}$/);
    expect(defaultLocalHHmm('xx')).toBeNull();
  });
});

// ── klien palsu yang meniru rantai query supabase-js dan membatasi 1000 baris ──
function fakeClient(all, { failAtPage = null } = {}) {
  const calls = [];
  const state = {};
  const q = {
    from(t) { state.table = t; return q; },
    select() { return q; },
    gte(c, v) { state.gte = [c, v]; return q; },
    lte(c, v) { state.lte = [c, v]; return q; },
    order() { return q; },
    range(a, b) {
      calls.push({ a, b, gte: state.gte, lte: state.lte, table: state.table });
      if (failAtPage != null && calls.length === failAtPage) return Promise.resolve({ data: null, error: { message: 'timeout' } });
      return Promise.resolve({ data: all.slice(a, b + 1), error: null });
    },
  };
  return { client: q, calls };
}

describe('fetchAttendanceRows (paginasi)', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i), payload: {} }));
  it('mengambil SEMUA baris walau lebih dari 1000', async () => {
    const { client, calls } = fakeClient(mk(2350));
    const rows = await fetchAttendanceRows(client, '2026-09-01', '2026-09-30');
    expect(rows).toHaveLength(2350); expect(calls).toHaveLength(3);
    expect(calls.map((c) => [c.a, c.b])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it('tepat kelipatan 1000 tidak berhenti terlalu awal', async () => {
    const { client, calls } = fakeClient(mk(2000));
    expect(await fetchAttendanceRows(client, 'a', 'b')).toHaveLength(2000); expect(calls).toHaveLength(3);
  });
  it('kosong -> satu permintaan, hasil kosong', async () => {
    const { client, calls } = fakeClient([]);
    expect(await fetchAttendanceRows(client, 'a', 'b')).toEqual([]); expect(calls).toHaveLength(1);
  });
  it('filter memakai tanggal lokal dateStr pada tabel attendanceLog', async () => {
    const { client, calls } = fakeClient([]);
    await fetchAttendanceRows(client, '2026-09-01', '2026-09-30');
    expect(calls[0]).toMatchObject({ table: 'attendance_log', gte: ['payload->>dateStr', '2026-09-01'], lte: ['payload->>dateStr', '2026-09-30'] });
  });
  it('error di tengah paginasi dilempar jelas, bukan hasil setengah', async () => {
    const { client } = fakeClient(mk(2500), { failAtPage: 2 });
    await expect(fetchAttendanceRows(client, 'a', 'b')).rejects.toThrow(/Gagal membaca absensi: timeout/);
  });
  it('PAGE_SIZE sama dengan batas PostgREST (1000)', () => { expect(PAGE_SIZE).toBe(1000); });
});

describe('loadAttendance', () => {
  it('memetakan absen berid lama (externalId EMP-…) DAN absen baru berid uuid C ke karyawan yang sama', async () => {
    const { client } = fakeClient([
      row({ id: 'a', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04' }),                              // log lama: EMP-1
      row({ id: 'b', employeeId: 'uuid-1', type: 'masuk', date: '2026-11-04T01:00:00Z', dateStr: '2026-11-04' }),         // log baru: uuid C
      row({ id: 'c', employeeId: 'uuid-9', type: 'masuk', date: '2026-11-04T01:05:00Z', dateStr: '2026-11-04' }),         // karyawan baru tanpa externalId
    ]);
    const emps = [{ id: 'uuid-1', externalId: 'EMP-1', name: 'Andi', status: 'aktif' }, { id: 'uuid-9', externalId: null, name: 'Baru', status: 'aktif' }];
    const r = await loadAttendance(client, { start: '2026-09-01', end: '2026-11-30' }, emps, { toLocalHHmm: wita });
    expect(r.logs.map(l => [l.id, l.employeeId])).toEqual([['a', 'uuid-1'], ['b', 'uuid-1'], ['c', 'uuid-9']]);
    expect(r.unknownEmployees).toEqual([]);
  });
  it('id di log yang tidak cocok dengan karyawan mana pun dilaporkan', async () => {
    const { client } = fakeClient([row({ id: 'a', employeeId: 'EMP-404', employeeName: 'Hantu', type: 'masuk', date: '2026-09-04T01:00:00Z', dateStr: '2026-09-04' })]);
    const r = await loadAttendance(client, { start: '2026-09-01', end: '2026-09-30' }, [{ id: 'uuid-1', externalId: 'EMP-1', name: 'Andi', status: 'aktif' }], { toLocalHHmm: wita });
    expect(r.logs).toEqual([]); expect(r.unknownEmployees).toEqual([{ externalId: 'EMP-404', name: 'Hantu' }]);
  });
});

describe('log otomatis buatan mamam-global (adaptasi)', () => {
  const idMap = new Map([['EMP-1', 'emp-1']]);
  const row = (o) => ({ id: o.id, payload: { employeeId: 'EMP-1', employeeName: 'Andi', dateStr: '2026-09-29', deletedAt: null, ...o } });
  it('isAutoClose -> auto: true; log biasa -> auto: false', () => {
    const r = mapAttendanceRows([
      row({ id: 'm', type: 'masuk', date: '2026-09-29T02:00:00Z' }),
      row({ id: 'k', type: 'keluar', date: '2026-09-29T12:00:00Z', isAutoClose: true }),
    ], idMap, { toLocalHHmm: () => '09:00' });
    expect(r.logs.find(l => l.type === 'pulang').auto).toBe(true);
    expect(r.logs.find(l => l.type === 'masuk').auto).toBe(false);
  });
  it('pulang otomatis dari bolong (isFromBolong) dibuang supaya bolong->pulang yang berlaku', () => {
    const r = mapAttendanceRows([
      row({ id: 'm', type: 'masuk', date: '2026-09-29T02:00:00Z' }),
      row({ id: 'b', type: 'bolong', date: '2026-09-29T07:00:00Z' }),
      row({ id: 'k', type: 'keluar', date: '2026-09-29T12:00:00Z', isAutoClose: true, isFromBolong: true }),
    ], idMap, { toLocalHHmm: (iso) => ({ '2026-09-29T02:00:00Z': '09:00', '2026-09-29T07:00:00Z': '14:00', '2026-09-29T12:00:00Z': '19:00' })[iso] });
    expect(r.logs.map(l => l.type)).toEqual(['masuk', 'bolong']);
    expect(r.autoFromBolongIgnored).toBe(1);
  });
});
