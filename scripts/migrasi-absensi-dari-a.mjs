#!/usr/bin/env node
/**
 * migrasi-absensi-dari-a.mjs — salin data absensi dari project lama (A / mamam-global) ke project C.
 *
 * Yang disalin (A -> C):
 *   attendanceLog   -> attendance_log          (log absen: masuk/keluar/bolong/libur)
 *   stock_checklists-> stock_checklists        (riwayat checklist stok)
 *   app_config 'stockMaster' -> app_settings 'stockMaster'  (master checklist stok)
 * Foto selfie TIDAK disalin (link foto lama tetap menunjuk ke bucket A).
 *
 * Aturan keselamatan:
 *   - A hanya DIBACA (GET). Penulisan hanya ke C, dan hanya dengan --apply.
 *   - Tanpa --apply = simulasi (laporan saja).
 *   - Menolak kunci rahasia (service_role / sb_secret_) dan menolak kalau A dan C project yang sama.
 *   - Boleh dijalankan berulang SEBELUM web absensi dialihkan ke C: baris yang sudah sama dilewati,
 *     yang berubah/baru disalin. Begitu C sudah menerima absen baru (id uuid), skrip menolak menulis
 *     (supaya tidak menimpa data baru), kecuali dengan --paksa.
 *   - Kunci tidak pernah dicetak.
 *
 * Pakai (dari folder mamam-pos, .env.local berisi kunci C dan A):
 *   node scripts/migrasi-absensi-dari-a.mjs            simulasi
 *   node scripts/migrasi-absensi-dari-a.mjs --apply    tulis ke C
 * .env.local:
 *   VITE_SUPABASE_URL=...  VITE_SUPABASE_ANON_KEY=...     (project C)
 *   A_SUPABASE_URL=...     A_SUPABASE_ANON_KEY=...        (project A, kunci anon saja)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from './migrasi/cli.mjs';

const PAGE = 1000;
const BATCH = 200;
const MASTER_KEY = 'stockMaster';
const STOCK_COLS = 'key,date_str,values,category_done,locked,submitted_at,submitted_by,shared_at,updated_at';

export const HELP = `
Salin data absensi dari project lama (A) ke project C.

  node scripts/migrasi-absensi-dari-a.mjs            simulasi (tidak menulis apa pun)
  node scripts/migrasi-absensi-dari-a.mjs --apply    tulis ke C

Pilihan:
  --apply        benar-benar menulis ke C
  --paksa        tetap menulis walau C sudah menerima absen baru (HATI-HATI: bisa menimpa)
  --env <file>   pakai file env selain .env.local
  --help         bantuan ini

.env.local harus berisi VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (C) dan A_SUPABASE_URL + A_SUPABASE_ANON_KEY (A).
`;

export function parseArgs(argv) {
  const o = { apply: false, paksa: false, envFile: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--paksa') o.paksa = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--env') { const v = argv[++i]; if (!v || v.startsWith('--')) throw new Error('--env perlu nama file.'); o.envFile = v; }
    else throw new Error(`Pilihan tidak dikenal: ${a}. Lihat --help.`);
  }
  return o;
}

const cleanUrl = (u) => String(u || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };

function keyKind(key) {
  const k = String(key || '').trim();
  if (k.startsWith('sb_secret_')) return 'secret';
  const parts = k.split('.');
  if (parts.length === 3) {
    try {
      const role = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role;
      if (role === 'service_role') return 'secret';
    } catch { /* bukan JWT */ }
  }
  return 'ok';
}

/** Baca dan periksa env. Melempar pesan jelas kalau ada yang salah/berbahaya. */
export function loadEnv(envText) {
  const env = parseEnv(envText);
  const c = { url: cleanUrl(env.VITE_SUPABASE_URL), key: String(env.VITE_SUPABASE_ANON_KEY || '').trim() };
  const a = { url: cleanUrl(env.A_SUPABASE_URL), key: String(env.A_SUPABASE_ANON_KEY || '').trim() };
  if (!c.url || !c.key) throw new Error('.env.local belum berisi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY (project C).');
  if (!a.url || !a.key) throw new Error('.env.local belum berisi A_SUPABASE_URL dan A_SUPABASE_ANON_KEY (project A / mamam-global, kunci anon saja).');
  for (const [nama, t] of [['C', c], ['A', a]]) {
    if (!/^https?:\/\//i.test(t.url)) throw new Error(`Alamat ${nama} harus berupa https://… (tanpa /rest/v1/).`);
    if (keyKind(t.key) === 'secret') throw new Error(`Kunci ${nama} adalah kunci RAHASIA (service_role/secret). Pakai kunci "anon"/"publishable" saja.`);
  }
  if (hostOf(a.url) === hostOf(c.url)) throw new Error('A_SUPABASE_URL sama dengan VITE_SUPABASE_URL. A dan C harus project yang berbeda.');
  return { a, c };
}

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));

/** Apakah C sudah menerima absen baru (karyawan C memakai uuid, bukan 'EMP-…')? */
export function cIsLive(cAttendance) {
  return cAttendance.some((r) => { const e = String(r?.payload?.employeeId ?? ''); return e && !e.startsWith('EMP-'); });
}

/**
 * Susun rencana. Semua masukan berupa array baris mentah. FUNGSI MURNI.
 * Mengembalikan baris yang perlu ditulis ke C (baru atau isinya berbeda).
 */
export function buildPlan({ aAttendance, cAttendance, aStock, cStock, aMaster, cMaster }) {
  const cAttById = new Map(cAttendance.map((r) => [r.id, r]));
  const attendance = { total: aAttendance.length, sama: 0, baru: [], berubah: [] };
  for (const r of aAttendance) {
    const cur = cAttById.get(r.id);
    const row = { id: r.id, payload: r.payload, updated_by: r.updated_by ?? null };
    if (!cur) attendance.baru.push(row);
    else if (stable(cur.payload) !== stable(r.payload)) attendance.berubah.push(row);
    else attendance.sama += 1;
  }

  const cStockByKey = new Map(cStock.map((r) => [r.key, r]));
  const stock = { total: aStock.length, sama: 0, baru: [], berubah: [] };
  const stockFields = ['date_str', 'values', 'category_done', 'locked', 'submitted_at', 'submitted_by', 'shared_at'];
  for (const r of aStock) {
    const cur = cStockByKey.get(r.key);
    const row = Object.fromEntries([['key', r.key], ...stockFields.map((f) => [f, r[f] ?? null]), ['updated_at', r.updated_at]]);
    if (!cur) stock.baru.push(row);
    else if (stockFields.some((f) => stable(cur[f] ?? null) !== stable(r[f] ?? null))) stock.berubah.push(row);
    else stock.sama += 1;
  }

  // Master checklist: tidak menimpa kalau di C sudah ada (bisa saja sudah diubah di sana).
  const master = { ada_di_a: aMaster != null, ada_di_c: cMaster != null, tulis: aMaster != null && cMaster == null, beda: aMaster != null && cMaster != null && stable(aMaster) !== stable(cMaster) };
  return { attendance, stock, master };
}

// --- akses REST (fetch bawaan Node; kunci hanya dikirim sebagai header ke project masing-masing) ---

async function call(fetchImpl, { url, key }, method, pathAndQuery, { body, prefer } = {}) {
  let res;
  try {
    res = await fetchImpl(`${url}/rest/v1${pathAndQuery}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(prefer ? { Prefer: prefer } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`Tidak bisa menghubungi ${hostOf(url)} (${err?.cause?.code || err?.message || 'jaringan'}).`);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg = j.message; if (j?.code === 'PGRST205') msg += ' (tabel belum ada: jalankan supabase/migrations/020_absensi.sql di project C dulu)'; } catch { /* bukan JSON */ }
    throw new Error(`${hostOf(url)} menolak: ${msg}`);
  }
  return res;
}

async function readAll(fetchImpl, target, table, columns, orderBy) {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await call(fetchImpl, target, 'GET', `/${encodeURIComponent(table)}?select=${columns}&order=${orderBy}&limit=${PAGE}&offset=${offset}`);
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

async function readMaster(fetchImpl, target, table) {
  const res = await call(fetchImpl, target, 'GET', `/${table}?select=value&key=eq.${MASTER_KEY}&limit=1`);
  const rows = await res.json();
  return rows.length ? rows[0].value ?? null : null;
}

async function upsert(fetchImpl, target, table, conflict, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await call(fetchImpl, target, 'POST', `/${table}?on_conflict=${conflict}`, { body: rows.slice(i, i + BATCH), prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}

export function formatReport(plan, { apply, hostC, live }) {
  const L = [''];
  L.push(apply ? '=== SALIN ABSENSI A → C: MENULIS KE DATABASE ===' : '=== SALIN ABSENSI A → C: SIMULASI (belum ada yang ditulis) ===');
  L.push(`Target : ${hostC}`);
  if (live) L.push('PERHATIAN: C sudah menerima absen baru (id uuid). Penulisan ditolak kecuali --paksa.');
  L.push('');
  const line = (nama, p) => `${nama.padEnd(18)} di A: ${String(p.total).padStart(5)} | sudah sama: ${String(p.sama).padStart(5)} | baru: ${String(p.baru.length).padStart(5)} | berubah: ${String(p.berubah.length).padStart(4)}`;
  L.push(line('Log absen', plan.attendance));
  L.push(line('Stock checklist', plan.stock));
  const m = plan.master;
  L.push(`Master stok        : ${!m.ada_di_a ? 'tidak ada di A' : m.tulis ? 'akan disalin (belum ada di C)' : m.beda ? 'di C sudah ada dan BERBEDA dari A (tidak ditimpa)' : 'sudah sama'}`);
  L.push('');
  L.push('Foto selfie tidak disalin: link foto lama tetap menunjuk ke bucket project A.');
  return L.join('\n');
}

export async function run(argv, { cwd = process.cwd(), log = console.log, fetchImpl = globalThis.fetch } = {}) {
  const o = parseArgs(argv);
  if (o.help) { log(HELP); return 0; }
  const envPath = path.resolve(cwd, o.envFile || '.env.local');
  if (!fs.existsSync(envPath)) throw new Error(`File env tidak ditemukan: ${envPath}`);
  const { a, c } = loadEnv(fs.readFileSync(envPath, 'utf8'));

  const [aAttendance, aStock, aMaster, cAttendance, cStock, cMaster] = await Promise.all([
    readAll(fetchImpl, a, 'attendanceLog', 'id,payload,updated_by', 'id.asc'),
    readAll(fetchImpl, a, 'stock_checklists', STOCK_COLS, 'key.asc'),
    readMaster(fetchImpl, a, 'app_config'),
    readAll(fetchImpl, c, 'attendance_log', 'id,payload', 'id.asc'),
    readAll(fetchImpl, c, 'stock_checklists', STOCK_COLS, 'key.asc'),
    readMaster(fetchImpl, c, 'app_settings'),
  ]);

  const plan = buildPlan({ aAttendance, cAttendance, aStock, cStock, aMaster, cMaster });
  const live = cIsLive(cAttendance);
  log(formatReport(plan, { apply: o.apply, hostC: hostOf(c.url), live }));

  if (!o.apply) { log('\nIni simulasi. Kalau laporannya masuk akal, ulangi dengan --apply.'); return 0; }
  if (live && !o.paksa) throw new Error('C sudah menerima absen baru. Tidak menulis apa pun. (Pakai --paksa hanya kalau kamu yakin.)');

  const attRows = [...plan.attendance.baru, ...plan.attendance.berubah];
  const stockRows = [...plan.stock.baru, ...plan.stock.berubah];
  if (attRows.length) await upsert(fetchImpl, c, 'attendance_log', 'id', attRows);
  if (stockRows.length) await upsert(fetchImpl, c, 'stock_checklists', 'key', stockRows);
  if (plan.master.tulis) await upsert(fetchImpl, c, 'app_settings', 'key', [{ key: MASTER_KEY, value: aMaster }]);

  // Cek ulang: jumlah baris A harus sudah ada semua di C.
  const after = await readAll(fetchImpl, c, 'attendance_log', 'id', 'id.asc');
  const have = new Set(after.map((r) => r.id));
  const missing = aAttendance.filter((r) => !have.has(r.id)).length;
  log(`\nSelesai. Ditulis: ${attRows.length} log absen, ${stockRows.length} checklist stok${plan.master.tulis ? ', master stok' : ''}.`);
  if (missing) throw new Error(`Cek ulang gagal: ${missing} log absen dari A belum ada di C.`);
  log(`Cek ulang OK: semua ${aAttendance.length} log absen dari A ada di C.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`\nGagal: ${err.message}`); process.exit(1); });
}
