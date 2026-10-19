import { useState } from 'react';
import { Smartphone, SmartphoneNfc, ChevronRight, ServerCog } from 'lucide-react';
import { Card, Badge, Button, Input, Modal } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { useDevices } from '../../hook/useDevices';
import { getDeviceId } from '../../lib/deviceId';
import { lastSeenLabel } from '../../hook/deviceLogic';
import useDirty from '../../hook/useDirty';
import { showToast } from '../../lib/toast';

/**
 * Pengaturan > Perangkat (khusus owner). HP yang baru membuka app masuk daftar "menunggu" dengan kode pendek;
 * owner memberi nama = mendaftarkan. HP staf yang belum terdaftar terkunci di layar kunci.
 * "Kunci di server" membuat database menolak catatan dari HP yang belum terdaftar (nyalakan setelah semua HP terdaftar).
 */
export default function DeviceSettings({ settings, saveSetting }) {
  const { devices, loading, error, missing, saveName, revoke, remove } = useDevices();
  const { triggerAlert, triggerConfirm } = useAppContext();
  const [editing, setEditing] = useState(null);       // baris perangkat yang namanya sedang diisi
  const myId = getDeviceId();

  const pending = devices.filter((d) => d.status === 'menunggu');
  const others = devices.filter((d) => d.status !== 'menunggu');
  const enforce = settings.device_enforce === true;

  const toggleEnforce = () => triggerConfirm(
    enforce
      ? 'Matikan kunci di server? HP yang belum terdaftar bisa menyimpan transaksi lagi (layar kunci di HP staf tetap aktif).'
      : 'Nyalakan kunci di server? Database akan MENOLAK transaksi dan pengeluaran dari HP yang belum terdaftar, termasuk HP owner. Pastikan semua HP yang dipakai sudah diberi nama.',
    async () => { try { await saveSetting('device_enforce', !enforce); } catch (e) { triggerAlert(e.message); } },
  );

  return (
    <Card className="space-y-4" data-testid="device-settings">
      <div className="flex items-center justify-between gap-2">
        <p className="font-heading font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Smartphone className="w-4 h-4 text-accent-600" /> Perangkat</p>
        <Badge variant="neutral">{devices.filter((d) => d.status === 'terdaftar').length} terdaftar</Badge>
      </div>

      {missing && (
        <p className="text-xs text-amber-800 dark:text-amber-300" data-testid="device-missing">
          Tabel perangkat belum ada. Jalankan migrasi 011 di Supabase (<code>supabase/migrations/011_perangkat.sql</code>), lalu muat ulang.
        </p>
      )}
      {error && !missing && <p className="text-xs text-red-500">Gagal memuat perangkat: {error}</p>}
      {loading && <p className="text-xs text-slate-400">Memuat...</p>}

      {pending.map((d) => (
        <div key={d.id} className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 p-3 flex items-center gap-3" data-testid="device-pending">
          <SmartphoneNfc className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">HP baru menunggu{d.id === myId ? ' (HP ini)' : ''}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 truncate">Kode <span className="font-mono font-bold">{d.code}</span>. {lastSeenLabel(d.last_seen_at || d.created_at)}</p>
          </div>
          <Button size="sm" onClick={() => setEditing(d)}>Beri nama</Button>
        </div>
      ))}

      {others.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {others.map((d) => (
            <button key={d.id} type="button" onClick={() => setEditing(d)} data-testid="device-row"
              className="w-full flex items-center gap-3 p-3 text-left bg-white dark:bg-slate-900 active:bg-slate-50 dark:active:bg-slate-800 transition-colors">
              <Smartphone className="w-5 h-5 text-slate-400 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{d.name || d.code}{d.id === myId ? ' (HP ini)' : ''}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{lastSeenLabel(d.last_seen_at)}</span>
              </span>
              {d.status === 'dicabut' && <Badge variant="danger">Dicabut</Badge>}
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {!loading && !missing && devices.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Belum ada perangkat. HP yang membuka app akan muncul di sini.</p>}

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5"><ServerCog className="w-4 h-4 text-slate-400" /> Kunci di server</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Database menolak catatan dari HP yang belum terdaftar.</p>
        </div>
        <Button variant={enforce ? 'secondary' : 'primary'} size="sm" onClick={toggleEnforce} data-testid="device-enforce">{enforce ? 'Aktif' : 'Nyalakan'}</Button>
      </div>

      {editing && (
        <NameSheet
          key={editing.id} device={editing} isMine={editing.id === myId}
          onClose={() => setEditing(null)}
          onSave={async (name) => { await saveName(editing.id, name); setEditing(null); showToast('Nama perangkat disimpan'); }}
          onRevoke={() => triggerConfirm(`Cabut akses ${editing.name || editing.code}? HP ini terkunci lagi sampai didaftarkan ulang.`, async () => {
            try { await revoke(editing.id); setEditing(null); } catch (e) { triggerAlert(e.message); }
          })}
          onRemove={() => triggerConfirm(`Hapus ${editing.name || editing.code} dari daftar? Catatan lama tetap menyimpan namanya. HP ini muncul lagi sebagai baru kalau membuka app.`, async () => {
            try { await remove(editing.id); setEditing(null); } catch (e) { triggerAlert(e.message); }
          })}
        />
      )}
    </Card>
  );
}

function NameSheet({ device, isMine, onClose, onSave, onRevoke, onRemove }) {
  const [name, setName] = useState(device.name || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = device.status !== 'terdaftar';
  const { dirty } = useDirty(true, [name]);   // nama diubah lalu sheet ditutup = konfirmasi buang isian

  const submit = async () => {
    setBusy(true); setMessage('');
    try { await onSave(name); } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal isOpen onClose={onClose} dirty={dirty} sheet size="md" maxHeight title={isNew ? 'Beri nama perangkat' : 'Ubah nama perangkat'}>
      <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="device-name-sheet">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Kode <span className="font-mono font-bold">{device.code}</span>{isMine ? '. Ini HP yang sedang kamu pakai.' : '. Cocokkan dengan kode di layar HP tersebut.'}
        </p>
        <Input label="Nama perangkat" placeholder="HP Kasir Depan" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-testid="device-name-input" />
        {message && <p role="alert" className="text-sm font-semibold text-red-500">{message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button onClick={submit} loading={busy} data-testid="device-name-save">Simpan</Button>
        </div>
        {!isNew && <Button variant="danger" size="full" onClick={onRevoke}>Cabut akses</Button>}
        {device.status !== 'terdaftar' && <Button variant="secondary" size="full" onClick={onRemove}>Hapus dari daftar</Button>}
      </div>
    </Modal>
  );
}
