/**
 * attendanceBoard — status absensi tiap karyawan pada SATU hari. FUNGSI MURNI.
 * Memakai aturan yang sama dengan mesin payroll (payrollEngine) supaya yang
 * tampil di layar Absensi tidak pernah berbeda dengan yang dihitung untuk gaji.
 *
 * Status:
 *   sedangJaga       sudah masuk hari ini, belum pulang, tidak sedang bolong
 *   bolong           hari ini sedang bolong (belum masuk lagi)
 *   perluKlarifikasi bolong belum selesai TAPI ada catatan pulang (janggal)
 *   lupaPulang       hari yang sudah lewat: ada masuk, tidak ada pulang
 *   belumAbsen       tidak ada catatan sama sekali
 *   sudahPulang      masuk dan pulang lengkap
 *   libur            ditandai libur di sistem absensi
 */
import { computeDayResult } from '../payroll/payrollEngine.js';
import { isOnDuty } from '../employee/employeeOptions.js';

export const STATUS_ORDER = ['sedangJaga', 'bolong', 'perluKlarifikasi', 'lupaPulang', 'belumAbsen', 'sudahPulang', 'libur'];

const byTime = (a, b) => String(a.time ?? '').localeCompare(String(b.time ?? ''));

/** Pasangan bolong -> masuk lagi (to = null kalau belum kembali). */
export function bolongPairs(dayLogs) {
  const sorted = [...dayLogs].filter(l => l.time).sort(byTime);
  return sorted.filter(l => l.type === 'bolong').map(b => {
    const back = sorted.find(l => l.type === 'masuk_lagi' && l.time > b.time);
    return { from: b.time, to: back ? back.time : null };
  });
}

export function buildAttendanceBoard(employees, logs, date, today) {
  const rows = [];
  for (const emp of employees) {
    if (!isOnDuty(emp)) continue;   // cuti dan resign tidak tampil di papan
    const dayLogs = logs.filter(l => l.employeeId === emp.id && l.date === date);
    const masukLog = dayLogs.filter(l => l.type === 'masuk').sort(byTime)[0];
    const pulangLog = dayLogs.filter(l => l.type === 'pulang').sort(byTime).slice(-1)[0];
    const pairs = bolongPairs(dayLogs);
    const base = {
      employee: { id: emp.id, name: emp.name, role: emp.role },
      masuk: masukLog?.time ?? null, pulang: pulangLog?.time ?? null, bolongs: pairs,
      workedMinutes: 0, overtimeMinutes: 0, note: null,
      edited: dayLogs.some(l => l.edited), autoPulang: Boolean(pulangLog?.auto), autoLibur: dayLogs.some(l => l.type === 'libur' && l.auto),
    };

    if (dayLogs.some(l => l.type === 'libur') && !masukLog) { rows.push({ ...base, status: 'libur' }); continue; }
    if (dayLogs.length === 0 || !masukLog) { rows.push({ ...base, status: 'belumAbsen' }); continue; }

    // Fakta (masuk) mengalahkan tebakan (libur otomatis), sama seperti attendanceProvider.
    // Mesin B memberi libur prioritas, jadi catatan libur disingkirkan sebelum dihitung.
    const effectiveLogs = dayLogs.filter(l => l.type !== 'libur');
    const res = computeDayResult(effectiveLogs, emp, date, today);
    let status;
    if (res.status === 'perluKlarifikasi') status = pulangLog ? 'perluKlarifikasi' : 'bolong';
    else if (res.status === 'belumPulang') status = date === today ? 'sedangJaga' : 'lupaPulang';
    else if (res.status === 'hadir') status = 'sudahPulang';
    else status = 'belumAbsen';

    rows.push({
      ...base, status,
      workedMinutes: res.workedMinutes || 0, overtimeMinutes: res.overtimeMinutes || 0,
      note: res.effectiveFromBolong ? 'bolong dianggap jam pulang (hari sudah lewat)' : (pulangLog?.auto ? `pulang otomatis ${pulangLog.time} (lupa absen pulang)` : null),
    });
  }
  rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.employee.name.localeCompare(b.employee.name));
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, 0]));
  for (const r of rows) counts[r.status]++;
  return { rows, counts };
}
