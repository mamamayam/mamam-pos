import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Modal, Button, Select, Textarea } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { ajukanHapusTransaksi } from '../../hook/useDeleteRequests';
import useDirty from '../../hook/useDirty';
import { showToast } from '../../lib/toast';

/**
 * DeleteRequestSheet — staf mengajukan hapus satu transaksi (bottom sheet dari Detail di Riwayat).
 * Transaksi TIDAK dihapus di sini: pengajuan masuk ke owner (sheet Persetujuan), owner yang memutuskan.
 * Alasan dan "Diajukan oleh" wajib (login hanya membawa peran, jadi nama dipilih seperti "Dicatat oleh" pada Tambahan).
 */
let lastRequester = '';   // dipakai ulang selama aplikasi terbuka, supaya staf tidak memilih nama tiap kali

export default function DeleteRequestSheet({ isOpen, onClose, sale, onSubmitted }) {
  const { triggerAlert, formatRupiah } = useAppContext();
  const [employees, setEmployees] = useState([]);
  const [requestedBy, setRequestedBy] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { dirty } = useDirty(isOpen, [requestedBy, reason]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setReason(''); setRequestedBy(lastRequester);
    let cancelled = false;
    supabase.from('employees').select('id, name, status').order('name').then(({ data }) => {
      if (!cancelled) setEmployees((data || []).filter(e => e.status !== 'resign'));
    });
    return () => { cancelled = true; };
  }, [isOpen, sale?.id]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ajukanHapusTransaksi(sale.id, { reason, requestedBy });
      lastRequester = requestedBy;
      onClose();
      onSubmitted?.();
      showToast('Terkirim ke owner. Transaksi baru dihapus setelah owner menyetujui.', { duration: 4500 });
    } catch (e) {
      triggerAlert(e.message || 'Gagal mengajukan hapus.');
    } finally { setBusy(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} dirty={dirty} sheet size="lg" maxHeight title="Ajukan Hapus Transaksi">
      <div className="p-5 pt-2 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="sheet-ajukan-hapus">
        {sale && (
          <div className="bg-slate-50 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-sm">
            <p className="font-bold text-slate-800 dark:text-slate-100">#{sale.display_number} · {sale.customer_name || 'Umum'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{sale.order_type} • {sale.payment_method} • {formatRupiah(sale.total)}</p>
          </div>
        )}
        <Select label="Diajukan oleh" value={requestedBy} onChange={e => setRequestedBy(e.target.value)}>
          <option value="">Pilih namamu</option>
          {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
        </Select>
        <Textarea label="Alasan" rows={3} placeholder="Mis. salah input menu, dobel catat, pelanggan batal" value={reason} onChange={e => setReason(e.target.value)} />
        <p className="text-xs text-slate-400 dark:text-slate-500">Owner akan diberi tahu. Transaksi tetap ada sampai owner menyetujui.</p>
        <Button size="full" onClick={submit} disabled={busy} icon={<Send className="w-4 h-4" />}>{busy ? 'Mengirim...' : 'Kirim Pengajuan'}</Button>
      </div>
    </Modal>
  );
}
