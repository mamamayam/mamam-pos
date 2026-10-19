import { useState } from 'react';
import { UserCheck, Shuffle, RefreshCw } from 'lucide-react';
import { Card, Badge, Button, Input, Select, Modal, SegmentedControl, EmptyState } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { useEmployeePins } from '../../hook/useEmployeePins';
import { VIEW_MINUTES_CHOICES } from '../../hook/useAppSettings';
import { generatePin } from '../../auth/pinHash';
import useDirty from '../../hook/useDirty';
import { showToast } from '../../lib/toast';

/**
 * Pengaturan PIN karyawan: staf yang membuka Penggajian memilih nama karyawan lalu
 * memasukkan PIN-nya untuk melihat gaji sendiri (mingguan/bulanan).
 */
export default function EmployeePinSettings({ settings, saveSetting }) {
  const { triggerAlert, triggerConfirm } = useAppContext();
  const { people, loading, error, reload, setPin, clearPin } = useEmployeePins();
  const [editing, setEditing] = useState(null);     // karyawan yang PIN-nya sedang diatur

  const guard = async (fn) => { try { await fn(); } catch (e) { triggerAlert(e.message); } };

  return (
    <Card className="space-y-4" data-testid="employee-pin-settings">
      <p className="font-heading font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><UserCheck className="w-4 h-4 text-accent-600" /> PIN Karyawan</p>

      <SegmentedControl value={settings.employee_pin_enabled ? 'on' : 'off'}
        onChange={(v) => guard(() => saveSetting('employee_pin_enabled', v === 'on'))}
        options={[{ value: 'on', label: 'Aktif', tone: 'green' }, { value: 'off', label: 'Mati', tone: 'red' }]} />

      <Select label="Tutup otomatis jika tidak disentuh" value={String(settings.employee_pin_view_minutes)}
        onChange={(e) => guard(() => saveSetting('employee_pin_view_minutes', Number(e.target.value)))}>
        {VIEW_MINUTES_CHOICES.map((m) => <option key={m} value={m}>{m} menit</option>)}
      </Select>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">PIN per karyawan</p>
        {loading && <p className="text-sm text-slate-400 py-3 text-center">Memuat...</p>}
        {error && (
          <div className="text-center space-y-2 py-2">
            <p className="text-xs text-red-500">{error}</p>
            <Button size="sm" onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Coba Lagi</Button>
          </div>
        )}
        {!loading && !error && people.length === 0 && <EmptyState title="Belum ada karyawan aktif." />}
        {people.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950 rounded-xl p-3" data-testid={`pin-row-${p.name}`}>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
              <Badge size="sm" variant={p.hasPin ? 'success' : 'neutral'}>{p.hasPin ? 'PIN sudah diatur' : 'Belum ada PIN'}</Badge>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setEditing(p)} data-testid={`atur-pin-${p.name}`}>{p.hasPin ? 'Ubah PIN' : 'Atur PIN'}</Button>
          </div>
        ))}
      </div>

      {editing && (
        <PinEditSheet person={editing} onClose={() => setEditing(null)}
          onSave={(pin) => guard(async () => { await setPin(editing.id, pin); setEditing(null); showToast(`PIN ${editing.name} disimpan. Beri tahu karyawannya.`, { duration: 4000 }); })}
          onClear={() => triggerConfirm(`Hapus PIN ${editing.name}? Dia tidak bisa lagi melihat gajinya di mode staf sampai PIN baru dibuat.`,
            () => guard(async () => { await clearPin(editing.id); setEditing(null); }))} />
      )}
    </Card>
  );
}

function PinEditSheet({ person, onClose, onSave, onClear }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = /^\d{4}$/.test(pin);
  const { dirty } = useDirty(true, [pin]);   // PIN sudah diketik lalu sheet ditutup = konfirmasi buang isian
  const save = async () => { setBusy(true); try { await onSave(pin); } finally { setBusy(false); } };
  return (
    <Modal isOpen onClose={onClose} dirty={dirty} sheet size="md" maxHeight title={`PIN ${person.name}`}>
      <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="pin-edit-sheet">
        <Input label="PIN baru (4 angka)" inputMode="numeric" maxLength={4} autoComplete="off" placeholder="0000" value={pin} data-testid="pin-input"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          hint="PIN terlihat di layar ini supaya bisa kamu sampaikan ke karyawan. Setelah disimpan, PIN tidak bisa dilihat lagi (hanya bisa diganti)." />
        <Button variant="secondary" size="full" icon={<Shuffle className="w-4 h-4" />} onClick={() => setPin(generatePin())} data-testid="pin-acak">Buat PIN acak</Button>
        <Button size="full" onClick={save} disabled={!ok || busy} data-testid="pin-simpan">{busy ? 'Menyimpan...' : 'Simpan PIN'}</Button>
        {person.hasPin && <Button size="full" variant="danger" onClick={onClear}>Hapus PIN</Button>}
      </div>
    </Modal>
  );
}
