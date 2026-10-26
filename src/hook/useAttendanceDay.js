import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { loadAttendance } from '../features/payroll/attendanceProvider';
import { buildAttendanceBoard } from '../features/attendance/attendanceBoard';
import { toLocalDateString } from '../utils/formatters';
import { prepareLogs, nowMinutesOf } from '../features/attendance/dayRules';
import { fetchOverrides } from './attendanceOverrides';

/**
 * useAttendanceDay — papan absensi satu hari, BACA-SAJA dari tabel attendance_log (ditulis web mamam-absensi).
 * "Real time" = dibaca langsung tiap layar dibuka + diperbarui otomatis tiap
 * `pollMs` selama layar terbuka dan tab terlihat (tanpa langganan realtime,
 * supaya tidak ada state lokal yang bisa basi). Pembaruan berikutnya berjalan
 * diam-diam: daftar tidak berkedip jadi "memuat".
 */
export function useAttendanceDay({ date, attendanceClient = supabase, pollMs = 60000 }) {
  const [employees, setEmployees] = useState([]);
  const [data, setData] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const emps = await supabase.from('employees').select('id, name, role, status, external_id, start_date').order('name');
      if (emps.error) throw new Error(emps.error.message);
      const list = (emps.data || []).map(e => ({ id: e.id, name: e.name, role: e.role, status: e.status, externalId: e.external_id || null, startDate: e.start_date ? String(e.start_date).slice(0, 10) : '' }));
      if (!alive.current) return;
      setEmployees(list);
      const [result, ovr] = await Promise.all([
        loadAttendance(attendanceClient, { start: date, end: date }, list),
        fetchOverrides(date, date).catch(() => []),   // koreksi gagal dibaca: tampilkan absensi apa adanya
      ]);
      if (!alive.current) return;
      setData(result); setOverrides(ovr);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [date, attendanceClient]);

  useEffect(() => { alive.current = true; setLoading(true); reload(); return () => { alive.current = false; }; }, [reload]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') reload(); }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, reload]);

  const today = toLocalDateString();
  const prepared = useMemo(
    () => (data ? prepareLogs({ logs: data.logs, overrides, employees, period: { start: date, end: date }, today, nowMinutes: nowMinutesOf() }) : null),
    [employees, data, overrides, date, today],
  );
  const board = useMemo(
    () => (prepared ? buildAttendanceBoard(employees, prepared.logs, date, prepared.effectiveToday) : null),
    [employees, prepared, date],
  );

  return { loading, error, board, info: data, updatedAt, reload, overrideKeys: new Set(overrides.map(o => `${o.employeeId}|${o.date}`)) };
}
