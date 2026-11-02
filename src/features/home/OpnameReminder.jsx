import { useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { useOpnameReminder } from '../../hook/useOpname';
import { businessDate } from '../stock/stockMath';
import { showToast } from '../../lib/toast';

/**
 * OpnameReminder — pengingat stok opname untuk OWNER (izin `stok.kelola`), muncul di Beranda SETIAP kali aplikasi dibuka pada
 * H-1 ("Besok stok opname") dan hari H ("Hari ini stok opname"), H = hari terakhir bulan (hari bisnis). Tombol "Aktifkan stok opname"
 * menyalakan mode opname (semua item stok wajib diisi staf). Berhenti sendiri kalau mode sudah menyala atau hari itu sudah punya
 * hitungan penuh. "Nanti" menutup sampai aplikasi dibuka lagi. Aturan tanggalnya di `opnameMath.js` (`reminderFor`).
 */
let dismissedDay = '';   // hari bisnis yang pengingatnya ditutup "Nanti" selama aplikasi terbuka (hilang saat aplikasi dimuat ulang)

export const reminderCopy = (phase) => (phase === 'h1'
  ? { title: 'Besok stok opname', body: 'Jangan lupa besok stok opname. Aktifkan mode stok opname supaya semua item wajib dihitung staf.', later: 'Ingatkan lagi nanti' }
  : { title: 'Hari ini stok opname', body: 'Waktunya stok opname. Aktifkan mode stok opname supaya semua item wajib dihitung staf.', later: 'Nanti' });

export function ReminderBody({ phase, busy, onActivate, onLater }) {
  const c = reminderCopy(phase);
  return (
    <div className="p-5 space-y-4" data-testid="opname-reminder">
      <div className="w-11 h-11 rounded-2xl bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400 flex items-center justify-center"><ScanSearch className="w-5 h-5" /></div>
      <div>
        <p className="font-heading text-base font-bold text-slate-900 dark:text-slate-50">{c.title}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{c.body}</p>
      </div>
      <div className="space-y-2">
        <Button size="full" onClick={onActivate} disabled={busy} data-testid="opname-aktifkan">{busy ? 'Menyalakan...' : 'Aktifkan stok opname'}</Button>
        <Button variant="secondary" size="full" onClick={onLater} disabled={busy} data-testid="opname-nanti">{c.later}</Button>
      </div>
    </div>
  );
}

export default function OpnameReminder() {
  const { can } = useAuth();
  const owner = can('stok.kelola');
  const today = businessDate();
  const { phase, activate } = useOpnameReminder(owner, today);
  const [hidden, setHidden] = useState(dismissedDay === today);
  const [busy, setBusy] = useState(false);

  if (!owner || !phase || hidden) return null;
  const later = () => { dismissedDay = today; setHidden(true); };
  const go = async () => {
    setBusy(true);
    try { await activate(); showToast('Mode stok opname aktif. Semua item wajib diisi staf.'); }
    catch (e) { showToast(e?.message || 'Gagal menyalakan stok opname', { type: 'error' }); setBusy(false); }
  };
  return (
    <Modal isOpen onClose={later} size="sm">
      <ReminderBody phase={phase} busy={busy} onActivate={go} onLater={later} />
    </Modal>
  );
}
