/**
 * dayRules — aturan HARIAN yang diadaptasi dari mamam-global, dihitung SAAT
 * DIBACA (tidak menulis apa pun ke database absensi). FUNGSI MURNI.
 *
 * Kenapa di sini dan bukan di payrollEngine: engine harus tetap identik dengan
 * mamam-kasir (B). Aturan di bawah hanya MENYIAPKAN log sebelum masuk engine,
 * jadi engine tidak diubah. Saat migrasi ke B, normalisasi ini disalin ke
 * AttendanceProvider B.
 *
 * Urutan (lihat prepareLogs):
 *   1. koreksi owner (applyOverrides)  — hari yang dikoreksi memakai data koreksi
 *   2. aturan otomatis (applyAutoRules):
 *        a. LUPA PULANG: hari sudah lewat, ada masuk, tidak ada pulang, tidak ada
 *           bolong yang menggantung -> pulang otomatis 19:00 (ikut aturan bonus
 *           full time biasa: masuk <= 09:00 dan pulang >= 19:00)
 *        b. LIBUR OTOMATIS: karyawan aktif tanpa catatan apa pun pada hari yang
 *           sudah lewat -> libur (tidak mengubah gaji; hanya tampilan & hitungan)
 *   "Hari sudah lewat" = tanggalnya sebelum hari ini ATAU hari ini sudah lewat
 *   jam cutoff 21:00 (sama seperti watchdog mamam-global).
 *   Bolong yang tidak ada masuk-lagi dihitung jam pulang oleh engine begitu hari
 *   itu "sudah lewat" menurut aturan yang sama.
 */
import { findStuckBolong, timeToMinutes, parseIsoDate, formatIsoDate } from '../payroll/payrollEngine.js';

export const CUTOFF_MINUTES = 21 * 60;       // 21:00
export const AUTO_PULANG_TIME = '19:00';
export const LIBUR_LOOKBACK_DAYS = 60;       // sama seperti backfill libur di mamam-global

const addDays = (iso, n) => formatIsoDate(new Date(parseIsoDate(iso).getTime() + n * 86400000));
const keyOf = (employeeId, date) => `${employeeId}|${date}`;
const hhmm = (t) => (typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);

export const nowMinutesOf = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

/**
 * "Hari ini" versi engine: setelah jam cutoff, hari ini dianggap sudah lewat.
 * Dipakai sebagai argumen `today` untuk engine/papan; tanggal asli tetap dipakai
 * untuk hal lain (mis. syarat tutup periode).
 */
export function effectiveToday(todayIso, nowMinutes) {
  return nowMinutes >= CUTOFF_MINUTES ? addDays(todayIso, 1) : todayIso;
}

/** Ringkas log satu hari jadi bentuk yang bisa diedit. */
export function summarizeDay(dayLogs) {
  const timed = [...dayLogs].filter(l => l.time).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const masuk = timed.find(l => l.type === 'masuk')?.time ?? '';
  const pulang = [...timed].reverse().find(l => l.type === 'pulang')?.time ?? '';
  const bolongs = timed.filter(l => l.type === 'bolong').map(b => ({
    from: b.time, to: timed.find(l => l.type === 'masuk_lagi' && l.time > b.time)?.time ?? '',
  }));
  return { masuk, pulang, bolongs, libur: !masuk && dayLogs.some(l => l.type === 'libur') };
}

/**
 * Terapkan koreksi owner. Satu koreksi = SATU hari satu karyawan, MENGGANTIKAN
 * seluruh log hari itu dari sistem absensi.
 * override: { employeeId, date, libur, masuk, pulang, bolongs:[{from,to}] }
 */
export function applyOverrides(logs, overrides) {
  if (!overrides || overrides.length === 0) return { logs, editedCount: 0 };
  const byKey = new Map(overrides.map(o => [keyOf(o.employeeId, o.date), o]));
  const kept = logs.filter(l => !byKey.has(keyOf(l.employeeId, l.date)));
  const made = [];
  for (const o of byKey.values()) {
    const base = { employeeId: o.employeeId, date: o.date, auto: false, edited: true };
    const id = (s) => `edit-${o.employeeId}-${o.date}-${s}`;
    if (o.libur) { made.push({ ...base, id: id('libur'), type: 'libur', time: null }); continue; }
    if (hhmm(o.masuk)) made.push({ ...base, id: id('masuk'), type: 'masuk', time: o.masuk });
    (o.bolongs || []).forEach((b, i) => {
      if (hhmm(b.from)) made.push({ ...base, id: id(`bolong${i}`), type: 'bolong', time: b.from });
      if (hhmm(b.from) && hhmm(b.to)) made.push({ ...base, id: id(`lagi${i}`), type: 'masuk_lagi', time: b.to });
    });
    if (hhmm(o.pulang)) made.push({ ...base, id: id('pulang'), type: 'pulang', time: o.pulang });
  }
  return { logs: [...kept, ...made], editedCount: byKey.size };
}

/**
 * Pulang otomatis + libur otomatis.
 * @param employees  karyawan (boleh bentuk UI atau baris DB: startDate/start_date)
 * @param period     { start, end } rentang yang sedang dilihat (inklusif)
 */
export function applyAutoRules(logs, employees, period, today, nowMinutes) {
  const effToday = effectiveToday(today, nowMinutes);
  const groups = new Map();
  for (const l of logs) {
    const k = keyOf(l.employeeId, l.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }

  const added = [];
  let autoPulangCount = 0, autoLiburCount = 0;

  // a. lupa pulang
  for (const [k, dayLogs] of groups) {
    const [employeeId, date] = k.split('|');
    if (date >= effToday) continue;
    const masuk = dayLogs.find(l => l.type === 'masuk' && l.time);
    if (!masuk || dayLogs.some(l => l.type === 'pulang')) continue;
    if (findStuckBolong(dayLogs)) continue;                              // bolong menggantung ditangani engine
    if (timeToMinutes(masuk.time) >= timeToMinutes(AUTO_PULANG_TIME)) continue;   // masuk malam: jangan menebak
    added.push({ id: `auto-pulang-${employeeId}-${date}`, employeeId, date, type: 'pulang', time: AUTO_PULANG_TIME, auto: true });
    autoPulangCount++;
  }

  // b. libur otomatis — karyawan aktif tanpa catatan apa pun (dibatasi tanggal mulai kerja)
  const floor = addDays(effToday, -LIBUR_LOOKBACK_DAYS);
  const last = addDays(effToday, -1);
  for (const e of employees || []) {
    if (e.status !== 'aktif') continue;
    const startDate = String(e.startDate ?? e.start_date ?? '').slice(0, 10);
    let from = period.start > floor ? period.start : floor;
    if (startDate && startDate > from) from = startDate;
    const to = period.end < last ? period.end : last;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (groups.has(keyOf(e.id, d))) continue;
      added.push({ id: `auto-libur-${e.id}-${d}`, employeeId: e.id, date: d, type: 'libur', time: null, auto: true });
      autoLiburCount++;
    }
  }

  return { logs: added.length ? [...logs, ...added] : logs, autoPulangCount, autoLiburCount, effectiveToday: effToday };
}

/** Semua langkah sekaligus. */
export function prepareLogs({ logs, overrides, employees, period, today, nowMinutes = nowMinutesOf() }) {
  const o = applyOverrides(logs, overrides);
  const a = applyAutoRules(o.logs, employees, period, today, nowMinutes);
  return { logs: a.logs, editedCount: o.editedCount, autoPulangCount: a.autoPulangCount, autoLiburCount: a.autoLiburCount, effectiveToday: a.effectiveToday };
}

/**
 * Validasi isi form koreksi. Mengembalikan pesan error (string) atau null.
 * `bolong menggantung + pulang` ditolak karena itu keadaan janggal yang tidak
 * pernah dihitung otomatis.
 */
export function validateEdit({ libur, masuk, pulang, bolongs = [] }) {
  if (libur) return null;
  if (!masuk) return pulang || bolongs.length ? 'Isi jam masuk dulu.' : 'Isi jam masuk, atau tandai Libur.';
  if (!hhmm(masuk)) return 'Format jam masuk tidak valid.';
  if (pulang && !hhmm(pulang)) return 'Format jam pulang tidak valid.';
  let cursor = masuk;
  for (let i = 0; i < bolongs.length; i++) {
    const { from, to } = bolongs[i];
    const n = i + 1;
    if (!hhmm(from)) return `Isi jam mulai bolong #${n}.`;
    if (from < cursor) return `Bolong #${n} tidak boleh sebelum ${i === 0 ? 'jam masuk' : 'masuk-lagi sebelumnya'} (${cursor}).`;
    if (to) {
      if (!hhmm(to)) return `Format jam masuk-lagi #${n} tidak valid.`;
      if (to <= from) return `Masuk-lagi #${n} harus setelah mulai bolong.`;
      cursor = to;
    } else {
      if (i < bolongs.length - 1) return `Bolong #${n} belum ada jam masuk-lagi, tapi masih ada bolong sesudahnya.`;
      if (pulang) return `Bolong #${n} belum kembali tapi sudah ada jam pulang. Isi jam masuk-lagi, atau kosongkan jam pulang (bolong dianggap jam pulang).`;
      cursor = from;
    }
  }
  if (pulang && pulang <= cursor) return `Jam pulang harus setelah ${cursor}.`;
  return null;
}
