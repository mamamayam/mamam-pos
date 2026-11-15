import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { parseBackupEmployees } from '../features/employee/backupImport';
import { OVERTIME_RATE_PER_30MIN } from '../features/employee/employeeOptions';

/**
 * useEmployeeData — layer data Karyawan, ONLINE-FIRST.
 *
 * Bentuk yang diberikan ke UI mengikuti nama field mamam-global
 * (hourlyRate, fullTimeBonus, overtimeRate30, startDate, resignDate) supaya
 * form/kartu bisa dipakai apa adanya; di database kolomnya mengikuti nama
 * model HRD mamam-kasir (wage_per_hour, bonus_full_time, dst).
 *
 * HARD DELETE. Menghapus karyawan TIDAK merusak histori: transaksi,
 * pengeluaran, dan dompet yang menunjuk ke karyawan itu cukup melepas
 * referensinya (ON DELETE SET NULL); nama tetap ada lewat salinan nama.
 */

const fail = (error, aksi) => { throw new Error(`${aksi}: ${error.message}`); };
const day = (v) => (v ? String(v).slice(0, 10) : '');

const toUi = (e) => ({
  id: e.id, externalId: e.external_id || null, name: e.name,
  phone: e.phone || '', address: e.address || '',
  status: e.status, role: e.role,
  hourlyRate: e.wage_per_hour, fullTimeBonus: e.bonus_full_time,
  overtimeRate30: e.overtime_rate_per_30_min,
  startDate: day(e.start_date), resignDate: day(e.resign_date),
});

export function useEmployeeData() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const { data, error: e } = await supabase.from('employees').select('*').order('name');
    if (e) { setError(e.message); setLoading(false); return; }
    setEmployees((data || []).map(toUi));
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const saveEmployee = async (f) => {
    const name = (f.name || '').trim();
    const rate = Number(f.hourlyRate);
    if (!name || !(rate > 0)) throw new Error('Nama dan Upah per jam harus diisi dengan benar!');
    const status = f.status || 'aktif';
    const row = {
      name, phone: (f.phone || '').trim() || null, address: (f.address || '').trim() || null,
      status, role: f.role || 'kasir',
      external_id: (f.externalId || '').trim() || null,   // id di sistem absensi (EMP-xxxx), untuk mencocokkan log absen
      wage_per_hour: Math.round(rate),
      bonus_full_time: Math.max(0, Math.round(Number(f.fullTimeBonus) || 0)),
      overtime_rate_per_30_min: Number(f.overtimeRate30) > 0 ? Math.round(Number(f.overtimeRate30)) : OVERTIME_RATE_PER_30MIN,
      start_date: f.startDate || null,
      resign_date: status === 'resign' ? (f.resignDate || null) : null,
    };
    if (f.id) {
      const { error: e } = await supabase.from('employees').update({ ...row, updated_at: new Date().toISOString() }).eq('id', f.id);
      if (e) fail(e, 'Gagal menyimpan karyawan');
    } else {
      const { error: e } = await supabase.from('employees').insert(row);
      if (e) fail(e, 'Gagal menambah karyawan');
    }
    await reload();
  };

  // Ubah status saja (dropdown di kartu Karyawan): hanya kolom status + tanggal resign, kolom lain tidak disentuh.
  const setEmployeeStatus = async (id, status, resignDate = '') => {
    const { error: e } = await supabase.from('employees').update({
      status, resign_date: status === 'resign' ? (resignDate || null) : null, updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (e) fail(e, 'Gagal mengubah status karyawan');
    await reload();
  };

  const deleteEmployee = async (id) => {
    const { error: e } = await supabase.from('employees').delete().eq('id', id);
    if (e) {
      // 23503 = foreign_key_violation: masih ada tambahan/potongan/saldo awal gaji (ON DELETE RESTRICT)
      if (e.code === '23503' || /foreign key|violates/i.test(e.message)) {
        throw new Error('Karyawan ini masih punya data gaji (tambahan, potongan, atau saldo awal), jadi tidak bisa dihapus. Ubah statusnya jadi Resign saja.');
      }
      fail(e, 'Gagal menghapus karyawan');
    }
    await reload();
  };

  /**
   * Impor dari file backup mamam-global. Yang SUDAH ada (id lama sama) dilewati,
   * tidak ditimpa — jadi aman diulang dan tidak menghapus edit yang sudah
   * dilakukan di C.
   */
  const importFromBackup = async (json) => {
    const { rows, skipped } = parseBackupEmployees(json);
    if (rows.length === 0) throw new Error('Tidak ada karyawan yang bisa diimpor dari file ini.');

    const { data: existing, error: e1 } = await supabase.from('employees').select('external_id');
    if (e1) fail(e1, 'Gagal memeriksa data karyawan');
    const have = new Set((existing || []).map(x => x.external_id).filter(Boolean));

    const toInsert = rows.filter(r => !r.external_id || !have.has(r.external_id));
    const alreadyThere = rows.length - toInsert.length;
    if (toInsert.length > 0) {
      const { error: e2 } = await supabase.from('employees').insert(toInsert);
      if (e2) fail(e2, 'Gagal mengimpor karyawan');
    }
    await reload();
    return { added: toInsert.length, alreadyThere, skipped };
  };

  return { employees, loading, error, reload, saveEmployee, setEmployeeStatus, deleteEmployee, importFromBackup };
}
