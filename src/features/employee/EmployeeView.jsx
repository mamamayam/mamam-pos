import { useState, useMemo } from 'react';
import { Plus, Edit3, Trash2, Briefcase, ArrowUpDown } from 'lucide-react';
import { Card, Button, Input, NominalInput, Select, IconButton, Badge, SortModal, EmptyState, Modal } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../auth/AuthContext';
import { useEmployeeData } from '../../hook/useEmployeeData';
import { applySort } from '../../utils/sortUtils';
import { toLocalDateString } from '../../utils/formatters';
import useDirty from '../../hook/useDirty';
import { showToast } from '../../lib/toast';
import {
  EMPLOYEE_STATUS_OPTIONS, EMPLOYEE_ROLE_OPTIONS, OVERTIME_RATE_PER_30MIN, statusInfo, roleInfo,
} from './employeeOptions';

/**
 * EmployeeView — Karyawan. Form dan kartu daftar di-port dari
 * ManageEmployeesTab mamam-global (field sama: upah per jam, bonus full time,
 * tarif lembur per 30 menit, status, role, mulai kerja, tanggal resign).
 *
 * BEDA yang disengaja:
 *  - Data langsung ke Supabase; kalau gagal, user diberi tahu jelas
 *  - Hapus = permanen (histori transaksi/pengeluaran/dompet tetap utuh)
 *  - Tombol/kartu "Impor dari mamam-global" sudah dihapus dari layar ini (logika
 *    impor masih ada di backupImport.js + useEmployeeData kalau suatu saat dibutuhkan).
 *  - Form Tambah tidak menutup sendiri setelah simpan: toast + form dikosongkan untuk karyawan berikutnya.
 *    Form Edit menutup setelah simpan. Menutup form yang sudah terisi = konfirmasi buang isian.
 */
const emptyForm = () => ({
  id: '', externalId: '', name: '', phone: '', address: '',
  hourlyRate: 0, fullTimeBonus: 0, overtimeRate30: OVERTIME_RATE_PER_30MIN,
  startDate: toLocalDateString(), status: 'aktif', resignDate: '', role: 'kasir',
});

const filterSelectCls = 'flex-1 min-w-0 md:flex-none text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-accent-600 dark:hover:text-accent-400 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 bg-transparent focus:outline-none focus:ring-2 focus:ring-accent-500/30 transition-all duration-300';

export default function EmployeeView() {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();
  const { can } = useAuth();
  const canManage = can('karyawan.kelola');   // tambah / edit / hapus / impor
  const canWage = can('karyawan.upah');        // melihat upah, bonus, tarif lembur
  const { employees, loading, error, reload, saveEmployee, deleteEmployee } = useEmployeeData();

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sortKey, setSortKey] = useState('name-asc');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('semua');
  const [roleFilter, setRoleFilter] = useState('semua');
  const [busy, setBusy] = useState(false);
  const { dirty, rebase } = useDirty(isEditing, form);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
    finally { setBusy(false); }
  };

  const handleSave = () => run(async () => {
    const wasEdit = !!form.id;
    await saveEmployee(form);
    setForm(emptyForm());
    if (wasEdit) {
      setIsEditing(false);
      showToast('Data karyawan diperbarui');
    } else {
      showToast('Karyawan baru ditambahkan');   // form tetap terbuka, kosong untuk karyawan berikutnya
      rebase();
    }
  });

  const handleDelete = (emp) => {
    triggerConfirm(`Yakin ingin menghapus "${emp.name}"? Data hilang permanen, tapi riwayat transaksi, pengeluaran, dan dompet tetap tersimpan dengan nama ini. Karyawan yang masih punya data gaji tidak bisa dihapus (ubah jadi Resign).`, () =>
      run(async () => { await deleteEmployee(emp.id); }));
  };

  const sorted = useMemo(() => {
    let list = statusFilter === 'semua' ? employees : employees.filter(e => e.status === statusFilter);
    if (roleFilter !== 'semua') list = list.filter(e => e.role === roleFilter);
    return applySort(list, sortKey, {
      name: e => e.name || '', rate: e => e.hourlyRate || 0, date: e => e.startDate || '',
    });
  }, [employees, statusFilter, roleFilter, sortKey]);

  const sortOptions = [
    { key: 'name-asc', label: 'Nama (A-Z)' }, { key: 'name-desc', label: 'Nama (Z-A)' },
    { key: 'rate-desc', label: 'Upah Tertinggi' },
    { key: 'date-desc', label: 'Gabung Terbaru' }, { key: 'date-asc', label: 'Gabung Terlama' },
  ];

  if (loading) return <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">Memuat karyawan...</div>;
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <p className="text-sm font-semibold text-red-500">Gagal memuat karyawan</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">{error}</p>
        <Button onClick={reload}>Coba Lagi</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
        <div className="space-y-6">
          <Card className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Briefcase className="w-5 h-5 text-slate-700 dark:text-slate-200" /> Daftar Karyawan</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Select bare title="Status Karyawan" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={filterSelectCls}>
                <option value="semua">Semua Status</option>
                {EMPLOYEE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <Select bare title="Role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={filterSelectCls}>
                <option value="semua">Semua Role</option>
                {EMPLOYEE_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <button type="button" onClick={() => setIsSortOpen(true)}
                className="flex-1 min-w-0 md:flex-none flex items-center justify-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-accent-600 dark:hover:text-accent-400 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 active:scale-95 transition-all duration-300">
                <ArrowUpDown className="w-3.5 h-3.5" /> Urutkan
              </button>
              {canManage && (
              <Button className="w-full md:w-auto" icon={<Plus className="w-4 h-4" />} onClick={() => { setForm(emptyForm()); setIsEditing(true); }}>
                Tambah Karyawan
              </Button>
              )}
            </div>
          </Card>

          {sorted.length === 0 ? (
            <EmptyState icon={<Briefcase className="w-12 h-12" />}
              title={employees.length === 0 ? (canManage ? 'Belum ada karyawan. Tambah lewat tombol di atas.' : 'Belum ada karyawan.') : 'Tidak ada karyawan dengan filter ini.'} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
              {sorted.map(emp => (
                <Card key={emp.id} padding="lg" className="relative group hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                  {canManage && (
                  <div className="absolute top-4 right-4 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconButton variant="edit" ghost title="Edit Karyawan" onClick={() => { setForm({ ...emptyForm(), ...emp }); setIsEditing(true); }}><Edit3 className="w-4 h-4" /></IconButton>
                    <IconButton variant="delete" ghost title="Hapus Karyawan" onClick={() => handleDelete(emp)}><Trash2 className="w-4 h-4" /></IconButton>
                  </div>
                  )}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-accent-500 to-accent-600 dark:from-accent-400 dark:to-accent-600 text-white rounded-2xl shadow-[0_4px_12px_rgba(var(--color-accent-500),0.3)] flex items-center justify-center font-heading font-bold text-xl">{emp.name.charAt(0).toUpperCase()}</div>
                    <div>
                      <h4 className="font-heading font-bold text-slate-800 dark:text-slate-100 text-base leading-tight pr-14">{emp.name}</h4>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge size="sm" variant={statusInfo(emp.status).badgeVariant}>{statusInfo(emp.status).label}</Badge>
                        <Badge size="sm" variant={roleInfo(emp.role).badgeVariant}>{roleInfo(emp.role).label}</Badge>
                      </div>
                    </div>
                  </div>
                  {canWage && (
                  <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500 font-medium">Upah/Jam:</span><span className="font-bold text-accent-600 dark:text-accent-400">{formatRupiah(emp.hourlyRate)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 font-medium">Lembur/30m:</span><span className="font-bold text-accent-600 dark:text-accent-400">{formatRupiah(emp.overtimeRate30 || OVERTIME_RATE_PER_30MIN)}</span></div>
                  </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          <SortModal isOpen={isSortOpen} onClose={() => setIsSortOpen(false)} value={sortKey} onChange={setSortKey} options={sortOptions.filter(o => o.key !== 'rate-desc' || canWage)} />
        </div>

      <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} dirty={dirty} sheet size="lg" maxHeight title={form.id ? 'Edit Data Karyawan' : 'Tambah Karyawan Baru'}>
        <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-1 gap-4">
            <Input label="Nama Lengkap" variant="muted" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input label="No. Handphone (WA)" variant="muted" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <Select label="Status Karyawan" variant="muted" value={form.status || 'aktif'} onChange={e => setForm({ ...form, status: e.target.value })}>
              {EMPLOYEE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select label="Role" variant="muted" value={form.role || 'kasir'} onChange={e => setForm({ ...form, role: e.target.value })}>
              {EMPLOYEE_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            {form.status === 'resign' && (
              <Input type="date" label="Tanggal Resign" variant="muted" value={form.resignDate || ''} onChange={e => setForm({ ...form, resignDate: e.target.value })} />
            )}
            <div>
              <Input label="Alamat" variant="muted" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Input label="ID Absensi (opsional)" variant="muted" placeholder="Contoh: EMP-1699999999999" value={form.externalId || ''}
                onChange={e => setForm({ ...form, externalId: e.target.value })} />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Dipakai untuk mencocokkan absensi dari sistem absensi. Terisi otomatis kalau karyawan diimpor dari mamam-global. Kosongkan untuk karyawan baru yang belum punya.</p>
            </div>
            <NominalInput label="Upah per Jam (Rp)" variant="muted"
              value={form.hourlyRate || ''} onChange={e => setForm({ ...form, hourlyRate: e.target.value ? Number(e.target.value) : '' })} />
            <NominalInput label="Bonus Full Time (Rp)" variant="muted"
              value={form.fullTimeBonus || ''} onChange={e => setForm({ ...form, fullTimeBonus: e.target.value ? Number(e.target.value) : '' })} />
            <NominalInput label="Tarif Lembur per 30 Menit (Rp)" variant="muted"
              value={form.overtimeRate30 ?? OVERTIME_RATE_PER_30MIN} onChange={e => setForm({ ...form, overtimeRate30: e.target.value ? Number(e.target.value) : '' })} />
            <Input type="date" label="Mulai Kerja" variant="muted" value={form.startDate || ''} onChange={e => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <Button variant="primary" size="full" onClick={handleSave} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Data Karyawan'}</Button>
        </div>
      </Modal>
    </div>
  );
}
