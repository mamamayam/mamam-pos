import { useState, useMemo } from 'react';
import { Plus, Minus, ShoppingBag, Users, Clock, Wallet, Pencil, ChevronRight } from 'lucide-react';
import { Badge, Button, EmptyState, PillTabs } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../auth/AuthContext';
import { useQuickEntries } from '../../hook/useQuickEntries';
import { useExpenseData } from '../../hook/useExpenseData';
import ExpenseFormSheet from '../expense/ExpenseFormSheet';
import QuickAdjustmentSheet from './QuickAdjustmentSheet';
import { filterFeed } from './quickEntryMath';
import { usePendingApprovals } from '../../hook/usePendingApprovals';

/**
 * QuickEntrySection — "Catat Cepat" di Beranda (menggantikan daftar Riwayat Pesanan Hari Ini).
 *
 *  Operasional toko : Pengeluaran  -> form Pengeluaran yang sama dengan menu Pengeluaran
 *  Karyawan         : Tambah, Potongan -> isian yang sama dengan form di Penggajian
 *
 * Hanya Tambah dari staf yang butuh persetujuan owner; keputusannya di sheet Persetujuan (features/approvals),
 * Beranda hanya menampilkan banner jumlahnya. Potongan & pengeluaran langsung dicatat
 * (potongan otomatis jadi pengeluaran karyawan; tunai mengurangi saldo Dompet).
 * Nominal Tambah/Potongan disamarkan untuk yang tidak boleh melihat upah (izin 'karyawan.upah').
 *
 * Owner (izin 'catatan.ubah') bisa mengetuk satu baris "Catatan Hari Ini" untuk MENGUBAHNYA, dengan form yang
 * SAMA dengan saat mencatat: Pengeluaran toko = ExpenseFormSheet, Tambah/Potongan = QuickAdjustmentSheet (mode ubah).
 * Potongan = pengeluaran karyawan, jadi mengubahnya lewat RPC ubah_potongan (potongan + pengeluaran satu transaksi).
 */

const GROUP = 'text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2';
const CARD = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800';
const MASK = 'Rp •••••';

const KIND_ICON = {
  tambah: { Icon: Plus, cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', amt: 'text-emerald-600 dark:text-emerald-400', sign: '+' },
  potongan: { Icon: Minus, cls: 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400', amt: 'text-red-600 dark:text-red-400', sign: '-' },
  pengeluaran: { Icon: ShoppingBag, cls: 'bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400', amt: 'text-accent-600 dark:text-accent-400', sign: '-' },
};
const STATUS_BADGE = { menunggu: ['warning', 'Menunggu'], disetujui: ['success', 'Disetujui'], ditolak: ['danger', 'Ditolak'] };

const TABS = [{ value: 'semua', label: 'Semua' }, { value: 'karyawan', label: 'Karyawan' }, { value: 'toko', label: 'Toko' }];

export default function QuickEntrySection({ onChanged }) {
  const { can } = useAuth();
  const { formatRupiah, triggerAlert, triggerConfirm, openApprovals } = useAppContext();
  const pendingCount = usePendingApprovals();   // Tambahan + hapus transaksi yang menunggu (diputuskan di sheet Persetujuan)
  const canApprove = can('tambahan.setujui');
  const canWage = can('karyawan.upah');            // boleh melihat nominal catatan karyawan
  const canEdit = can('catatan.ubah');             // ketuk baris catatan = ubah (owner)

  const quick = useQuickEntries({ canApprove, onChanged });
  const expenseData = useExpenseData({ withExpenses: false });

  const [sheet, setSheet] = useState(null);        // null | 'pengeluaran' | 'tambahan' | 'potongan'
  const [editExpense, setEditExpense] = useState(null);   // pengeluaran toko yang sedang diubah; null = catatan baru
  const [editAdj, setEditAdj] = useState(null);     // { item, onSave } Tambah/Potongan yang sedang diubah
  const [tab, setTab] = useState('semua');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
    finally { setBusy(false); }
  };

  const feed = useMemo(() => filterFeed(quick.feed, tab), [quick.feed, tab]);
  const money = (n, masked) => (masked ? MASK : formatRupiah(n));

  const openNewExpense = () => { setEditExpense(null); setSheet('pengeluaran'); };
  const closeExpenseSheet = () => { setSheet(null); setEditExpense(null); };

  // Ketuk baris catatan -> buka form yang sama dalam mode ubah, terisi data catatan itu.
  const openEdit = (item) => run(async () => {
    const s = item.source;
    if (item.kind === 'pengeluaran') {
      setEditExpense({ id: s.id, amount: s.amount, category: s.category, supplier: s.supplier, note: s.note, date: s.date, paymentMethod: s.paymentMethod, cashHolderEmployeeId: s.cashHolderEmployeeId });
      setSheet('pengeluaran');
    } else if (item.kind === 'potongan') {
      const paymentMethod = await quick.deductionPayment(s);   // null = potongan lama tanpa pengeluaran terhubung
      setEditAdj({
        item: { id: s.id, type: 'potongan', employeeId: s.employeeId, employeeName: s.employeeName, category: s.category, label: s.label, amount: s.amount, date: s.date, paymentMethod },
        onSave: quick.updateDeduction,
      });
    } else {
      setEditAdj({
        item: { id: s.id, type: 'tambahan', employeeId: s.employeeId, employeeName: s.employeeName, category: s.category, label: s.label, amount: s.amount, date: s.date, detail: s.detail },
        onSave: (id, form) => quick.updateAddition(id, form, !!s.detail),
      });
    }
  });

  const cancel = (item) => triggerConfirm(`Batalkan pengajuan ${item.tag} untuk ${item.title}?`, () => run(() => quick.cancelRequest(item.id)));

  return (
    <section className="mb-4" aria-label="Catat Cepat" data-testid="catat-cepat">
      <h3 className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">Catat Cepat</h3>

      {/* Standar tombol (lihat Button.jsx): Pengeluaran = aksi utama (primary), Tambah/Potongan = pendukung (secondary). */}
      <p className={GROUP}>Operasional toko</p>
      <Button size="full" className="mb-4" icon={<ShoppingBag className="w-4 h-4" />} onClick={openNewExpense} data-testid="tile-pengeluaran">
        Pengeluaran
      </Button>

      <p className={GROUP}>Karyawan</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Button variant="secondary" size="full" icon={<Plus className="w-4 h-4" />} onClick={() => setSheet('tambahan')} data-testid="tile-tambah">
          Tambah
        </Button>
        <Button variant="secondary" size="full" icon={<Minus className="w-4 h-4" />} onClick={() => setSheet('potongan')} data-testid="tile-potongan">
          Potongan
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className={`${CARD} p-4`} data-testid="kartu-pengeluaran-karyawan">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-500 dark:text-purple-400 flex items-center justify-center shrink-0"><Users className="w-4 h-4" /></div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">Pengeluaran Karyawan</p>
          </div>
          <p className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100">{quick.loading ? '...' : money(quick.totals.karyawan, !canWage)}</p>
        </div>
        <div className={`${CARD} p-4`} data-testid="kartu-pengeluaran-toko">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-accent-50 dark:bg-accent-500/10 text-accent-500 dark:text-accent-400 flex items-center justify-center shrink-0"><ShoppingBag className="w-4 h-4" /></div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">Pengeluaran Toko</p>
          </div>
          <p className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100">{quick.loading ? '...' : formatRupiah(quick.totals.toko)}</p>
        </div>
      </div>

      {quick.error && (
        <div className={`${CARD} p-4 mb-4 text-center space-y-2`}>
          <p className="text-sm font-semibold text-red-500">Catat Cepat gagal dimuat</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{quick.error}</p>
          <Button size="sm" onClick={quick.reload}>Coba Lagi</Button>
        </div>
      )}

      {canApprove && pendingCount > 0 && (
        <button type="button" onClick={openApprovals} data-testid="menunggu-persetujuan"
          className="w-full flex items-center gap-2 text-left bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-3 mb-4 active:scale-[0.99] transition-transform">
          <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
          <span className="flex-1 text-xs font-bold text-amber-700 dark:text-amber-400">Menunggu persetujuan</span>
          <span className="bg-amber-600 dark:bg-amber-400 text-white dark:text-slate-900 rounded-full px-2 text-xs font-bold">{pendingCount}</span>
          <ChevronRight className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
        </button>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-4 pt-3 pb-2 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Catatan Hari Ini</p>
          <PillTabs size="sm" value={tab} onChange={setTab} options={TABS} />
        </div>
        {feed.length === 0 ? (
          <EmptyState icon={<Wallet className="w-10 h-10" />} title="Belum ada catatan hari ini." className="py-8" />
        ) : feed.map(item => {
          const { Icon, cls, amt, sign } = KIND_ICON[item.kind];
          const masked = item.kind !== 'pengeluaran' && !canWage;
          const badge = item.kind === 'tambah' ? STATUS_BADGE[item.status] : null;
          const rejected = item.kind === 'tambah' && item.status === 'ditolak';
          return (
            <div key={item.key} data-testid="catatan"
              {...(canEdit ? { role: 'button', tabIndex: 0, 'aria-label': `Ubah catatan ${item.title}`, onClick: () => openEdit(item), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(item); } } } : {})}
              className={`flex gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 ${canEdit ? 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors' : ''}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cls}`}><Icon className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{item.title}{item.tag && <span className="font-medium text-slate-500 dark:text-slate-400"> · {item.tag}</span>}</p>
                {item.note && <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{item.note}</p>}
                <p className="text-xs text-slate-400 dark:text-slate-500">{item.time}{item.by ? ` · dicatat ${item.by}` : ''}</p>
                {item.status === 'ditolak' && item.reason && <p className="text-xs text-red-500 mt-0.5">Alasan: {item.reason}</p>}
                {item.kind === 'tambah' && item.status === 'menunggu' && !canApprove && (
                  <button type="button" onClick={() => cancel(item)} className="text-xs font-bold text-slate-500 dark:text-slate-400 underline mt-1">Batalkan pengajuan</button>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {/* Pengajuan ditolak tidak menambah apa pun: nominalnya 0, bukan angka yang diajukan. */}
                {rejected
                  ? <p className="font-bold text-sm text-slate-400 dark:text-slate-500" data-testid="nominal-ditolak">{`${sign}${formatRupiah(0)}`}</p>
                  : <p className={`font-bold text-sm ${masked ? 'text-slate-400' : amt}`}>{masked ? MASK : `${sign}${formatRupiah(item.amount)}`}</p>}
                {badge && <Badge variant={badge[0]} dot>{badge[1]}</Badge>}
                {item.kind === 'tambah' && item.edited && <span data-testid="badge-diedit"><Badge variant="info">Diedit</Badge></span>}
                {canEdit && <Pencil className="w-3 h-3 text-slate-300 dark:text-slate-600" aria-hidden="true" />}
              </div>
            </div>
          );
        })}
      </div>

      <ExpenseFormSheet isOpen={sheet === 'pengeluaran'} onClose={closeExpenseSheet} editing={editExpense} data={expenseData} onSaved={quick.afterExpenseSaved} />
      <QuickAdjustmentSheet isOpen={sheet === 'tambahan' || sheet === 'potongan'} kind={sheet === 'potongan' ? 'potongan' : 'tambahan'}
        onClose={() => setSheet(null)} quick={quick} canApprove={canApprove} />
      {editAdj && (
        <QuickAdjustmentSheet isOpen kind={editAdj.item.type} editing={editAdj} onClose={() => setEditAdj(null)} quick={quick} canApprove={canApprove} />
      )}
    </section>
  );
}
