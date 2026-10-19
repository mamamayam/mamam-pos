import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Modal, Button, Input } from '../../components/ui';
import { saveOverride, deleteOverride } from '../../hook/attendanceOverrides';
import { validateEdit } from './dayRules';
import useDirty from '../../hook/useDirty';
import { showToast } from '../../lib/toast';

/**
 * AttendanceEditSheet — owner mengoreksi jam absen satu karyawan pada satu hari.
 * Hasilnya disimpan di aplikasi ini dan MENGGANTIKAN absensi hari itu saat
 * dihitung; sistem absensi tidak diubah. "Kembalikan" menghapus koreksi.
 *
 * initial: { masuk, pulang, bolongs:[{from,to}], libur } — nilai yang sedang tampil.
 *
 * Setelah simpan: toast lalu sheet menutup (koreksi satu hari = satu kali jalan). Menutup sheet yang isiannya
 * sudah diubah memunculkan konfirmasi buang isian (Modal `dirty`).
 */
export default function AttendanceEditSheet({ isOpen, onClose, employee, date, initial, hasOverride, onSaved }) {
  const [libur, setLibur] = useState(false);
  const [masuk, setMasuk] = useState('');
  const [pulang, setPulang] = useState('');
  const [bolongs, setBolongs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { dirty } = useDirty(isOpen, [libur, masuk, pulang, bolongs]);

  useEffect(() => {
    if (!isOpen) return;
    setLibur(!!initial?.libur); setMasuk(initial?.masuk || ''); setPulang(initial?.pulang || '');
    setBolongs((initial?.bolongs || []).map(b => ({ from: b.from || '', to: b.to || '' })));
    setError(''); setBusy(false);
  }, [isOpen, employee?.id, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const setBolong = (i, patch) => setBolongs(prev => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const run = async (fn, okMessage) => {
    setBusy(true); setError('');
    try { await fn(); await onSaved?.(); showToast(okMessage); onClose(); } catch (e) { setError(e.message || 'Terjadi kesalahan.'); setBusy(false); }
  };

  const handleSave = () => {
    const err = validateEdit({ libur, masuk, pulang, bolongs });
    if (err) { setError(err); return; }
    run(() => saveOverride({ employeeId: employee.id, date, libur, masuk, pulang, bolongs }), 'Koreksi absen tersimpan');
  };
  const stuckIdx = libur ? -1 : bolongs.findIndex(b => b.from && !b.to);
  const stuck = stuckIdx >= 0 ? bolongs[stuckIdx] : null;
  const makeStuckThePulang = () => { setPulang(stuck.from); setBolongs(prev => prev.filter((_, i) => i !== stuckIdx)); setError(''); };

  const handleRestore = () => run(() => deleteOverride(employee.id, date), 'Koreksi absen dikembalikan');

  const label = date ? new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} dirty={dirty} sheet size="md" maxHeight title="Edit Absen">
      <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="att-edit-sheet">
        <div>
          <p className="font-heading font-bold text-slate-800 dark:text-slate-100">{employee?.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>

        <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={libur} onChange={e => setLibur(e.target.checked)} className="w-4 h-4 accent-orange-500" data-testid="edit-libur" />
          Libur (tidak masuk kerja)
        </label>

        {!libur && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input type="time" label="Masuk" variant="muted" value={masuk} onChange={e => setMasuk(e.target.value)} data-testid="edit-masuk" />
              <Input type="time" label="Pulang" variant="muted" value={pulang} onChange={e => setPulang(e.target.value)} data-testid="edit-pulang" />
            </div>

            {stuck && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2" data-testid="edit-stuck">
                <p className="text-xs text-amber-800 dark:text-amber-300">Bolong jam <b>{stuck.from}</b> belum ada masuk-lagi. Kalau karyawan sebenarnya kembali, isi "Masuk lagi" di bawah. Kalau dia memang tidak kembali, jadikan jam bolong itu jam pulang.</p>
                <Button variant="secondary" size="xs" onClick={makeStuckThePulang} data-testid="edit-jadikan-pulang">Jadikan {stuck.from} sebagai jam pulang</Button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Bolong</p>
              {bolongs.map((b, i) => (
                <div key={i} className="flex items-end gap-2" data-testid="edit-bolong-row">
                  <Input type="time" label={i === 0 ? 'Mulai' : undefined} variant="muted" value={b.from} onChange={e => setBolong(i, { from: e.target.value })} />
                  <Input type="time" label={i === 0 ? 'Masuk lagi' : undefined} variant="muted" value={b.to} onChange={e => setBolong(i, { to: e.target.value })} />
                  <button type="button" aria-label="Hapus bolong" onClick={() => setBolongs(prev => prev.filter((_, idx) => idx !== i))} className="p-2.5 mb-0.5 rounded-xl text-slate-400 hover:text-red-500 active:scale-90"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <Button variant="secondary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setBolongs(prev => [...prev, { from: '', to: '' }])} data-testid="edit-add-bolong">Tambah bolong</Button>
            </div>
          </>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500">Koreksi ini menggantikan seluruh absen karyawan ini di hari tersebut dan hanya tersimpan di aplikasi ini. Data di sistem absensi tidak berubah.</p>

        {error && <p className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-xl p-3" data-testid="edit-error">{error}</p>}

        <div className="flex flex-col gap-2">
          <Button variant="primary" size="full" onClick={handleSave} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Koreksi'}</Button>
          {hasOverride && <Button variant="secondary" size="full" onClick={handleRestore} disabled={busy}>Kembalikan ke data absensi</Button>}
        </div>
      </div>
    </Modal>
  );
}
