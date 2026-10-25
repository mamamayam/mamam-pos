/**
 * attendanceProvider — mengambil log absensi (tabel `attendance_log` di project C,
 * ditulis oleh web mamam-absensi) dan mengubahnya ke bentuk yang dimengerti
 * payrollEngine (bentuk AttendanceLog milik mamam-kasir).
 *
 * Bentuk baris (kolom `payload`):
 *   { id, employeeId, employeeName, type, date:'<waktu UTC ISO>',
 *     dateStr:'YYYY-MM-DD' (tanggal lokal), photoUrl, location, deletedAt }
 *   `employeeId` = id karyawan C (uuid) untuk absen baru. Log lama yang disalin dari
 *   sistem lama masih berisi id 'EMP-…' (disimpan di employees.external_id); keduanya dikenali.
 *   type: masuk | bolong | masuk_lagi | keluar | libur
 *
 * Perbedaan penamaan ke bentuk B: 'keluar' -> 'pulang'; jam 'HH:mm' diambil dari
 * `date` dan diubah ke waktu LOKAL perangkat (sama seperti mamam-global), tanggal
 * memakai `dateStr` apa adanya.
 */

export const PAGE_SIZE = 1000;   // batas baris per permintaan PostgREST
export const ATTENDANCE_TABLE = 'attendance_log';

const TYPE_MAP = { masuk: 'masuk', masuk_lagi: 'masuk_lagi', bolong: 'bolong', keluar: 'pulang', pulang: 'pulang', libur: 'libur' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n) => String(n).padStart(2, '0');

/** Jam lokal perangkat 'HH:mm' dari timestamp ISO (null kalau tidak valid). */
export function defaultLocalHHmm(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Ubah baris mentah jadi log siap hitung. FUNGSI MURNI.
 * @param rows  baris { id, payload } (atau payload langsung)
 * @param externalIdToEmployeeId  Map dari id di log (uuid C atau id lama 'EMP-…') ke id karyawan di C
 */
export function mapAttendanceRows(rows, externalIdToEmployeeId, { toLocalHHmm = defaultLocalHHmm } = {}) {
  const parsed = [];
  const unknown = new Map();
  let skippedDeleted = 0, skippedInvalid = 0;

  for (const row of rows || []) {
    const p = row && typeof row === 'object' ? (row.payload ?? row) : null;
    if (!p || typeof p !== 'object') { skippedInvalid++; continue; }
    if (p.deletedAt) { skippedDeleted++; continue; }

    const type = TYPE_MAP[p.type];
    const date = String(p.dateStr ?? '').slice(0, 10);
    if (!type || !DATE_RE.test(date)) { skippedInvalid++; continue; }

    const employeeId = externalIdToEmployeeId.get(String(p.employeeId));
    if (!employeeId) { unknown.set(String(p.employeeId), p.employeeName || String(p.employeeId)); continue; }

    let time = null;
    if (type !== 'libur') {
      time = toLocalHHmm(p.date);
      if (!time) { skippedInvalid++; continue; }
    }
    parsed.push({ id: String(p.id ?? row.id), employeeId, date, type, time, auto: Boolean(p.isAutoClose), fromBolong: Boolean(p.isFromBolong), ts: Date.parse(p.date) || 0 });
  }

  // Urut kronologis, supaya "masuk pertama" = masuk paling awal.
  parsed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts));

  // Kunci hari: karyawan|tanggal
  const key = (l) => `${l.employeeId}|${l.date}`;
  const hasMasuk = new Set(parsed.filter((l) => l.type === 'masuk').map(key));

  // (1) 'libur' yang tersimpan padahal karyawan itu akhirnya masuk = tebakan usang
  //     dari watchdog otomatis di mamam-global. Fakta (masuk) menang. Kalau tidak
  //     dibuang, mesin B akan memberi libur pada hari itu dan gajinya hangus.
  let staleLiburIgnored = 0;
  const afterLibur = parsed.filter((l) => {
    if (l.type === 'libur' && hasMasuk.has(key(l))) { staleLiburIgnored++; return false; }
    return true;
  });

  // (1b) 'pulang' buatan watchdog mamam-global untuk karyawan yang lupa masuk-lagi
  //      setelah bolong (isFromBolong, jam tutup 19:00): itu tebakan mesin, bukan
  //  absen sungguhan. Dibuang supaya aturan bolong->pulang biasa yang berlaku
  //  (jam kerjanya sama dengan hitungan mamam-global). Pulang yang dibuat orang
  //  bersama bolong menggantung tetap "perlu klarifikasi".
  let autoFromBolongIgnored = 0;
  const afterAuto = afterLibur.filter((l) => {
    if (l.type === 'pulang' && l.fromBolong) { autoFromBolongIgnored++; return false; }
    return true;
  });

  // (2) Lebih dari satu 'pulang' di hari yang sama: pakai yang TERAKHIR
  //     (sama seperti mamam-global memilih keluar terakhir).
  const lastPulangIdx = new Map();
  afterAuto.forEach((l, i) => { if (l.type === 'pulang') lastPulangIdx.set(key(l), i); });
  let duplicatePulangIgnored = 0;
  const logs = afterAuto.filter((l, i) => {
    if (l.type !== 'pulang') return true;
    if (lastPulangIdx.get(key(l)) === i) return true;
    duplicatePulangIgnored++;
    return false;
  }).map(({ ts, fromBolong, ...l }) => l);

  return {
    logs,
    unknownEmployees: [...unknown].map(([externalId, name]) => ({ externalId, name })),
    skippedDeleted, skippedInvalid, staleLiburIgnored, duplicatePulangIgnored, autoFromBolongIgnored,
  };
}

/**
 * Ambil SEMUA baris absensi untuk rentang tanggal (inklusif), dengan paginasi:
 * PostgREST membatasi 1000 baris per permintaan, sedangkan satu bulan absensi
 * beberapa karyawan bisa lebih dari itu.
 */
export async function fetchAttendanceRows(client, fromDate, toDate) {
  const rows = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await client
      .from(ATTENDANCE_TABLE)
      .select('id, payload')
      .gte('payload->>dateStr', fromDate)
      .lte('payload->>dateStr', toDate)
      .order('id')
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`Gagal membaca absensi: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    if (start > 200000) throw new Error('Data absensi terlalu banyak untuk satu periode.');
  }
  return rows;
}

/**
 * Peta id-di-log -> id karyawan C. Absen baru memakai uuid C; log lama (disalin dari
 * sistem lama) memakai id 'EMP-…' yang tersimpan di external_id.
 */
export function buildEmployeeIdMap(employees) {
  const map = new Map();
  for (const e of employees) {
    if (e.externalId) map.set(String(e.externalId), e.id);
    map.set(String(e.id), e.id);
  }
  return map;
}

/** Semua langkah: ambil + petakan. `employees` berbentuk hasil useEmployeeData. */
export async function loadAttendance(client, period, employees, options) {
  const rows = await fetchAttendanceRows(client, period.start, period.end);
  return mapAttendanceRows(rows, buildEmployeeIdMap(employees), options);
}
