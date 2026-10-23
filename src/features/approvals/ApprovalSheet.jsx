import { useState, useEffect } from 'react';
import { Check, X, Trash2, Plus, ClipboardCheck, Receipt } from 'lucide-react';
import { Modal, Button, Input, EmptyState, PillTabs } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { usePendingDeleteRequests, putuskanHapusTransaksi, usePendingExpenseDeleteRequests, putuskanHapusPengeluaran } from '../../hook/useDeleteRequests';
import { usePendingAdditions, decideAddition } from '../../hook/usePendingAdditions';
import { detailSubRows } from '../payroll/additionDetail';

/**
 * ApprovalSheet — menu slide-up "Persetujuan" (owner). Satu tempat untuk semua yang menunggu keputusan:
 *  - Transaksi       : staf mengajukan hapus dari Riwayat (alasan + nama wajib). Setuju = transaksi dihapus
 *                      PERMANEN oleh database (RPC putuskan_hapus_transaksi); Tolak = transaksi tetap.
 *  - Pengeluaran     : sama, untuk catatan di layar Pengeluaran (RPC putuskan_hapus_pengeluaran, migrasi 018).
 *                      Pengeluaran karyawan (potongan) yang dihapus ikut menghapus potongan gajinya.
 *  - Tambahan        : pengajuan Tambahan gaji karyawan dari staf (dulu kartu di Beranda). Setuju = masuk hitungan gaji.
 * Dibuka dari tile Persetujuan di menu slide-up dan dari banner di Beranda. Badge jumlahnya di BottomNav
 * (usePendingApprovals). Keputusan memuat ulang daftar dan memberi sinyal ke layar lain (notifyApprovalsChanged).
 */

const when = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function ApprovalSheet({ isOpen, onClose }) {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();
  const del = usePendingDeleteRequests(isOpen);
  const exp = usePendingExpenseDeleteRequests(isOpen);
  const add = usePendingAdditions(isOpen);

  const [pickedTab, setPickedTab] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!isOpen) { setPickedTab(null); setRejectingId(null); setRejectReason(''); } }, [isOpen]);

  // Tab awal: yang ada isinya (urutan: transaksi, pengeluaran, tambahan; kalau semua kosong, transaksi).
  const tab = pickedTab ?? (del.list.length ? 'hapus' : exp.list.length ? 'pengeluaran' : add.list.length ? 'tambahan' : 'hapus');

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
    finally { await Promise.all([del.reload(), exp.reload(), add.reload()]); setRejectingId(null); setRejectReason(''); setBusy(false); }
  };

  const startReject = (id) => { setRejectingId(id); setRejectReason(''); };
  const cancelReject = () => { setRejectingId(null); setRejectReason(''); };

  const approveDelete = (r) => triggerConfirm(
    `Hapus transaksi #${r.number} (${formatRupiah(r.total)}) PERMANEN? Angka dompet dan laba rugi ikut berubah.`,
    () => run(() => putuskanHapusTransaksi(r.id, true)),
  );
  const rejectDelete = (r) => run(() => putuskanHapusTransaksi(r.id, false, rejectReason));
  const approveExpense = (r) => triggerConfirm(
    `Hapus pengeluaran ${r.category} (${formatRupiah(r.amount)}) PERMANEN?${r.employeeId ? ' Potongan gaji karyawan yang tertaut ikut terhapus.' : ' Angka dompet dan laba rugi ikut berubah.'}`,
    () => run(() => putuskanHapusPengeluaran(r.id, true)),
  );
  const rejectExpense = (r) => run(() => putuskanHapusPengeluaran(r.id, false, rejectReason));
  const approveAddition = (r) => run(() => decideAddition(r.id, true));
  const rejectAddition = (r) => run(() => decideAddition(r.id, false, rejectReason));

  const rejectBox = (onSend) => (   // dipanggil sebagai fungsi (bukan komponen) supaya kolom alasan tidak kehilangan fokus tiap ketik
    <div className="mt-2.5 space-y-2">
      <Input placeholder="Alasan penolakan (opsional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={cancelReject}>Batal</Button>
        <Button variant="danger" size="sm" disabled={busy} onClick={onSend} icon={<X className="w-4 h-4" />}>Kirim Penolakan</Button>
      </div>
    </div>
  );

  const tabs = [
    { value: 'hapus', label: `Transaksi${del.list.length ? ` (${del.list.length})` : ''}`, testId: 'tab-persetujuan-hapus' },
    { value: 'pengeluaran', label: `Pengeluaran${exp.list.length ? ` (${exp.list.length})` : ''}`, testId: 'tab-persetujuan-pengeluaran' },
    { value: 'tambahan', label: `Tambahan${add.list.length ? ` (${add.list.length})` : ''}`, testId: 'tab-persetujuan-tambahan' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} sheet size="lg" maxHeight title="Persetujuan">
      <div className="p-5 pt-2 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="sheet-persetujuan">
        <PillTabs size="sm" value={tab} onChange={(v) => { setPickedTab(v); cancelReject(); }} options={tabs} />

        {tab === 'hapus' && (
          <div className="space-y-2" data-testid="daftar-hapus">
            {del.error && <p className="text-xs text-red-500 text-center">{del.error}</p>}
            {del.list.length === 0 && !del.error && (
              <EmptyState icon={<ClipboardCheck className="w-10 h-10" />} title="Tidak ada pengajuan hapus transaksi." className="py-8" />
            )}
            {del.list.map(r => (
              <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3" data-testid="pengajuan-hapus">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100">#{r.number} <span className="font-medium text-slate-500 dark:text-slate-400">· {r.customer || 'Umum'}</span></p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{[r.orderType, r.paymentMethod, when(r.at)].filter(Boolean).join(' • ')}</p>
                    {r.items && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 break-words">{r.items}</p>}
                  </div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-100 shrink-0">{formatRupiah(r.total)}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2 mt-2.5">
                  <p className="text-xs text-amber-800 dark:text-amber-300 break-words"><span className="font-bold">Alasan:</span> {r.reason}</p>
                  <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70 mt-0.5">Diajukan {r.requestedBy} · {when(r.createdAt)}</p>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Kalau disetujui, transaksi ini dihapus permanen dan angka dompet serta laba rugi ikut berubah.</p>
                {rejectingId === r.id ? rejectBox(() => rejectDelete(r)) : (
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => startReject(r.id)} icon={<X className="w-4 h-4" />}>Tolak</Button>
                    <Button variant="danger" size="sm" disabled={busy} onClick={() => approveDelete(r)} icon={<Trash2 className="w-4 h-4" />}>Setujui & Hapus</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'pengeluaran' && (
          <div className="space-y-2" data-testid="daftar-hapus-pengeluaran">
            {exp.error && <p className="text-xs text-red-500 text-center">{exp.error}</p>}
            {exp.list.length === 0 && !exp.error && (
              <EmptyState icon={<Receipt className="w-10 h-10" />} title="Tidak ada pengajuan hapus pengeluaran." className="py-8" />
            )}
            {exp.list.map(r => (
              <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3" data-testid="pengajuan-hapus-pengeluaran">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{r.category}{r.employeeName && <span className="font-medium text-slate-500 dark:text-slate-400"> · {r.employeeName}</span>}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{[r.supplier, r.paymentMethod === 'Non-Tunai' ? 'Bank' : 'Tunai', r.date].filter(Boolean).join(' • ')}</p>
                    {r.detail && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 break-words whitespace-pre-line">{r.detail}</p>}
                  </div>
                  <p className="font-bold text-sm text-red-600 dark:text-red-400 shrink-0">-{formatRupiah(r.amount)}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2 mt-2.5">
                  <p className="text-xs text-amber-800 dark:text-amber-300 break-words"><span className="font-bold">Alasan:</span> {r.reason}</p>
                  <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70 mt-0.5">Diajukan {r.requestedBy} · {when(r.createdAt)}</p>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  {r.employeeId
                    ? `Kalau disetujui, pengeluaran ini dihapus permanen beserta potongan gaji ${r.employeeName || 'karyawan'} yang tertaut.`
                    : 'Kalau disetujui, pengeluaran ini dihapus permanen dan angka dompet serta laba rugi ikut berubah.'}
                </p>
                {rejectingId === r.id ? rejectBox(() => rejectExpense(r)) : (
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => startReject(r.id)} icon={<X className="w-4 h-4" />}>Tolak</Button>
                    <Button variant="danger" size="sm" disabled={busy} onClick={() => approveExpense(r)} icon={<Trash2 className="w-4 h-4" />}>Setujui & Hapus</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'tambahan' && (
          <div className="space-y-2" data-testid="daftar-tambahan">
            {add.list.length === 0 && (
              <EmptyState icon={<Plus className="w-10 h-10" />} title="Tidak ada pengajuan Tambahan." className="py-8" />
            )}
            {add.list.map(r => (
              <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3" data-testid="pengajuan">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{r.employeeName} <span className="font-medium text-slate-500 dark:text-slate-400">· {r.category}</span></p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{r.label}</p>
                    {r.detail && (
                      <ul className="mt-1 space-y-0.5" data-testid="pengajuan-detail">
                        {detailSubRows(r.detail).map((d, i) => (
                          <li key={i} className="flex justify-between gap-3 text-[11px] text-slate-400 dark:text-slate-500"><span className="min-w-0 truncate">{d.text}</span><span className="shrink-0 tabular-nums">{formatRupiah(d.amount)}</span></li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Dicatat {r.requestedBy || 'staf'} · untuk {r.date}{r.editedAt && <span className="font-bold text-sky-600 dark:text-sky-400" data-testid="pengajuan-diedit"> · Diedit owner</span>}</p>
                  </div>
                  <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400 shrink-0">+{formatRupiah(r.amount)}</p>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950 rounded-lg px-2.5 py-1.5 mt-2">Setelah disetujui, masuk hitungan gaji {r.employeeName}.</p>
                {rejectingId === r.id ? rejectBox(() => rejectAddition(r)) : (
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => startReject(r.id)} icon={<X className="w-4 h-4" />}>Tolak</Button>
                    <Button size="sm" disabled={busy} onClick={() => approveAddition(r)} icon={<Check className="w-4 h-4" />}>Setujui</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
