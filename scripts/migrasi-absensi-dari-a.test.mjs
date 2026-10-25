import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, loadEnv, buildPlan, cIsLive, run } from './migrasi-absensi-dari-a.mjs';

const ANON = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.sig';
const SERVICE = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.sig';
const ENV = `VITE_SUPABASE_URL=https://cccc.supabase.co/\nVITE_SUPABASE_ANON_KEY=${ANON}\nA_SUPABASE_URL=https://aaaa.supabase.co\nA_SUPABASE_ANON_KEY=${ANON}\n`;

const att = (id, employeeId = 'EMP-1', extra = {}) => ({ id, payload: { id, employeeId, type: 'masuk', dateStr: '2026-10-01', deletedAt: null, ...extra }, updated_by: 'web-absensi' });
const stock = (key, extra = {}) => ({ key, date_str: key, values: { a: { qty: '1' } }, category_done: { x: true }, locked: true, submitted_at: null, submitted_by: 'Sri', shared_at: null, updated_at: '2026-10-01T00:00:00Z', ...extra });

/** Dua project palsu (A dan C) di memori: GET dengan limit/offset dan POST upsert. */
function fakeWorld({ a, c }) {
  const dbs = { 'aaaa.supabase.co': a, 'cccc.supabase.co': c };
  const writes = [];
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    const db = dbs[u.host];
    const table = decodeURIComponent(u.pathname.split('/').pop());
    const method = init.method || 'GET';
    if (!(table in db)) return { ok: false, status: 404, json: async () => ({ code: 'PGRST205', message: 'tabel tidak ada' }) };
    if (method === 'POST') {
      const conflict = u.searchParams.get('on_conflict');
      const rows = JSON.parse(init.body);
      writes.push({ host: u.host, table, n: rows.length });
      for (const r of rows) {
        const i = db[table].findIndex((x) => x[conflict] === r[conflict]);
        if (i >= 0) db[table][i] = { ...db[table][i], ...r }; else db[table].push({ ...r });
      }
      return { ok: true, status: 201, json: async () => ({}) };
    }
    if (u.searchParams.get('key') === 'eq.stockMaster') {
      const hit = db[table].filter((r) => r.key === 'stockMaster');
      return { ok: true, status: 200, json: async () => hit.map((r) => ({ value: r.value })) };
    }
    const limit = Number(u.searchParams.get('limit')); const offset = Number(u.searchParams.get('offset'));
    return { ok: true, status: 200, json: async () => db[table].slice(offset, offset + limit) };
  };
  return { impl, writes, dbs };
}

function inTempDir(envText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-abs-'));
  fs.writeFileSync(path.join(dir, '.env.local'), envText);
  return dir;
}

describe('parseArgs', () => {
  it('bawaan = simulasi; --apply dan --paksa dikenali; pilihan asing ditolak', () => {
    expect(parseArgs([])).toMatchObject({ apply: false, paksa: false });
    expect(parseArgs(['--apply', '--paksa'])).toMatchObject({ apply: true, paksa: true });
    expect(() => parseArgs(['--hapus'])).toThrow(/tidak dikenal/);
  });
});

describe('loadEnv', () => {
  it('membaca kedua project dan membuang /rest/v1 serta garis miring akhir', () => {
    const { a, c } = loadEnv(ENV);
    expect(c.url).toBe('https://cccc.supabase.co'); expect(a.url).toBe('https://aaaa.supabase.co');
  });
  it('menolak kunci rahasia, A sama dengan C, dan env yang kurang', () => {
    expect(() => loadEnv(ENV.replace(`A_SUPABASE_ANON_KEY=${ANON}`, `A_SUPABASE_ANON_KEY=${SERVICE}`))).toThrow(/RAHASIA/);
    expect(() => loadEnv(ENV.replace('https://aaaa.supabase.co', 'https://cccc.supabase.co'))).toThrow(/berbeda/);
    expect(() => loadEnv('VITE_SUPABASE_URL=x')).toThrow(/belum berisi/);
  });
});

describe('buildPlan', () => {
  it('memisahkan baru, berubah, dan sama; master tidak menimpa yang sudah ada di C', () => {
    const plan = buildPlan({
      aAttendance: [att('1'), att('2'), att('3', 'EMP-1', { deletedAt: '2026-10-02T00:00:00Z' })],
      cAttendance: [att('1'), att('3')],
      aStock: [stock('2026-10-01'), stock('2026-10-02')],
      cStock: [stock('2026-10-01')],
      aMaster: { categories: [1] }, cMaster: { categories: [2] },
    });
    expect(plan.attendance).toMatchObject({ total: 3, sama: 1 });
    expect(plan.attendance.baru.map((r) => r.id)).toEqual(['2']);
    expect(plan.attendance.berubah.map((r) => r.id)).toEqual(['3']);
    expect(plan.stock.baru.map((r) => r.key)).toEqual(['2026-10-02']);
    expect(plan.master).toMatchObject({ tulis: false, beda: true });
  });
  it('urutan kunci di JSON tidak dianggap perbedaan', () => {
    const a = { id: '1', payload: { x: 1, y: { b: 1, a: 2 } } }; const c = { id: '1', payload: { y: { a: 2, b: 1 }, x: 1 } };
    expect(buildPlan({ aAttendance: [a], cAttendance: [c], aStock: [], cStock: [], aMaster: null, cMaster: null }).attendance.sama).toBe(1);
  });
});

describe('cIsLive', () => {
  it('C dianggap sudah dipakai kalau ada absen berid karyawan uuid', () => {
    expect(cIsLive([att('1', 'EMP-1')])).toBe(false);
    expect(cIsLive([att('1', 'EMP-1'), att('2', '4996fd85-a0f7-5147-8256-eccf59cb15ed')])).toBe(true);
  });
});

describe('run', () => {
  const world = () => fakeWorld({
    a: { attendanceLog: [att('1'), att('2')], stock_checklists: [stock('2026-10-01')], app_config: [{ key: 'stockMaster', value: { categories: ['A'] } }] },
    c: { attendance_log: [att('1')], stock_checklists: [], app_settings: [] },
  });
  const quiet = () => { const out = []; return { out, log: (s) => out.push(String(s)) }; };

  it('simulasi tidak menulis apa pun', async () => {
    const w = world(); const q = quiet();
    await run([], { cwd: inTempDir(ENV), fetchImpl: w.impl, log: q.log });
    expect(w.writes).toEqual([]);
    expect(q.out.join('\n')).toMatch(/SIMULASI/);
  });

  it('--apply menyalin yang kurang ke C saja, lalu cek ulang OK; A tidak pernah ditulis', async () => {
    const w = world(); const q = quiet();
    await run(['--apply'], { cwd: inTempDir(ENV), fetchImpl: w.impl, log: q.log });
    expect(w.writes.every((x) => x.host === 'cccc.supabase.co')).toBe(true);
    expect(w.dbs['cccc.supabase.co'].attendance_log.map((r) => r.id).sort()).toEqual(['1', '2']);
    expect(w.dbs['cccc.supabase.co'].stock_checklists).toHaveLength(1);
    expect(w.dbs['cccc.supabase.co'].app_settings).toEqual([{ key: 'stockMaster', value: { categories: ['A'] } }]);
    expect(q.out.join('\n')).toMatch(/Cek ulang OK/);
  });

  it('dijalankan dua kali: yang kedua tidak menulis apa-apa lagi', async () => {
    const w = world(); const dir = inTempDir(ENV);
    await run(['--apply'], { cwd: dir, fetchImpl: w.impl, log: () => {} });
    const before = w.writes.length;
    await run(['--apply'], { cwd: dir, fetchImpl: w.impl, log: () => {} });
    expect(w.writes.length).toBe(before);
  });

  it('menolak menulis kalau C sudah menerima absen baru (kecuali --paksa)', async () => {
    const w = world();
    w.dbs['cccc.supabase.co'].attendance_log.push(att('9', '4996fd85-a0f7-5147-8256-eccf59cb15ed'));
    await expect(run(['--apply'], { cwd: inTempDir(ENV), fetchImpl: w.impl, log: () => {} })).rejects.toThrow(/sudah menerima absen baru/);
    expect(w.writes).toEqual([]);
    await run(['--apply', '--paksa'], { cwd: inTempDir(ENV), fetchImpl: w.impl, log: () => {} });
    expect(w.dbs['cccc.supabase.co'].attendance_log.map((r) => r.id)).toContain('2');
  });

  it('migrasi 020 belum dijalankan di C: pesan jelas, tidak ada yang tertulis', async () => {
    const w = fakeWorld({ a: { attendanceLog: [att('1')], stock_checklists: [], app_config: [] }, c: { app_settings: [] } });
    await expect(run(['--apply'], { cwd: inTempDir(ENV), fetchImpl: w.impl, log: () => {} })).rejects.toThrow(/020_absensi\.sql/);
    expect(w.writes).toEqual([]);
  });

  it('kunci tidak pernah ikut tercetak di laporan', async () => {
    const w = world(); const q = quiet();
    await run(['--apply'], { cwd: inTempDir(ENV), fetchImpl: w.impl, log: q.log });
    expect(q.out.join('\n')).not.toContain(ANON);
  });
});
