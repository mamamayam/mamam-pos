import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { randomSalt, hashPin, verifyPinHash } from '../auth/pinHash';
import { onDutyOnly } from '../features/employee/employeeOptions';

/**
 * useEmployeePins — PIN karyawan (untuk melihat gaji sendiri di Penggajian mode
 * staf). Mengembalikan daftar karyawan aktif + status "punya PIN". Hash PIN
 * tidak pernah dimuat ke daftar; hanya dibaca saat verifikasi satu karyawan.
 */
export function useEmployeePins() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const [emp, pins] = await Promise.all([
      supabase.from('employees').select('id, name, status').order('name'),
      supabase.from('employee_pins').select('employee_id'),
    ]);
    const e = emp.error || pins.error;
    if (e) { setError(e.message); setLoading(false); return; }
    const have = new Set((pins.data || []).map((p) => p.employee_id));
    setPeople(onDutyOnly(emp.data).map((x) => ({ id: x.id, name: x.name, hasPin: have.has(x.id) })));
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setPin = useCallback(async (employeeId, pin) => {
    if (!/^\d{4}$/.test(String(pin))) throw new Error('PIN harus 4 digit angka.');
    const salt = randomSalt();
    const pin_hash = await hashPin(pin, salt, employeeId);
    const { error: e } = await supabase.from('employee_pins').upsert(
      { employee_id: employeeId, salt, pin_hash, updated_at: new Date().toISOString() }, { onConflict: 'employee_id' });
    if (e) throw new Error(`Gagal menyimpan PIN: ${e.message}`);
    await reload();
  }, [reload]);

  const clearPin = useCallback(async (employeeId) => {
    const { error: e } = await supabase.from('employee_pins').delete().eq('employee_id', employeeId);
    if (e) throw new Error(`Gagal menghapus PIN: ${e.message}`);
    await reload();
  }, [reload]);

  /** true kalau PIN cocok. Melempar error kalau server tidak terjangkau. */
  const verifyPin = useCallback(async (employeeId, pin) => {
    const { data, error: e } = await supabase.from('employee_pins').select('salt, pin_hash').eq('employee_id', employeeId).maybeSingle();
    if (e) throw new Error('Tidak bisa memeriksa PIN. Cek internet lalu coba lagi.');
    return data ? verifyPinHash(pin, data.salt, employeeId, data.pin_hash) : false;
  }, []);

  return { people, loading, error, reload, setPin, clearPin, verifyPin };
}
