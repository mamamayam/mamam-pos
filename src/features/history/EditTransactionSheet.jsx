import { useState, useEffect, useMemo } from 'react';
import { Minus, Plus, Trash2, Undo2, Send, Check, Lock, Clock } from 'lucide-react';
import { Modal, Button, Input, NominalInput, Select, Textarea, PillTabs } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { OJOL_PLATFORMS } from '../../lib/ojolPlatforms';
import { showToast } from '../../lib/toast';
import useDirty from '../../hook/useDirty';
import { ubahTransaksi, ajukanUbahTransaksi } from '../../hook/useTransactionEdits';
import { onDutyOnly } from '../employee/employeeOptions';
import {
  ORDER_TYPES, EDIT_METHODS, EDIT_WINDOW_MINUTES, isSplitSale, editWindow, draftFromSale, snapshotFromSale, snapshotFromDraft,
  calcDraft, draftChanges, validateDraft, describeSnapshots,
} from './transactionEditMath';

/**
 * EditTransactionSheet — Ubah transaksi lunas (permintaan pemilik 21 Nov 2026, migrasi 024). Aturan: transactionEditMath.js.
 *  mode 'langsung': staf dalam 30 menit sejak dibayar, atau owner kapan saja -> RPC ubah_transaksi (tercatat di riwayat perubahan).
 *  mode 'ajukan'  : staf setelah 30 menit -> pengajuan ke owner (alasan + nama wajib); transaksi baru berubah setelah owner setuju.
 * Yang bisa diubah: nama, tipe, metode bayar, jumlah item (hanya dikurangi) atau hapus item. Tidak bisa: tambah item, ongkir, diskon;
 * Split Payment hanya nama + tipe. Database menghitung ulang total (tampilan di sini hanya prediksi).
 */
let lastRequester = '';   // dipakai ulang selama aplikasi terbuka (sama dengan DeleteRequestSheet)

const box = 'rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950';

export default function EditTransactionSheet({ isOpen, onClose, sale, mode = 'langsung', isOwner = false, onDone }) {
  const { formatRupiah, triggerAlert } = useAppContext();
  const [draft, setDraft] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [busy, setBusy] = useState(false);
  const { dirty } = useDirty(isOpen, [draft]);
  const ajukan = mode === 'ajukan';
  const split = isSplitSale(sale);
  const now = useMemo(() => Date.now(), [isOpen, sale?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || !sale) return undefined;
    setDraft({ ...draftFromSale(sale), by: ajukan ? lastRequester : '' });
    if (!ajukan) return undefined;
    let cancelled = false;
    supabase.from('employees').select('id, name, status').order('name').then(({ data }) => {
      if (!cancelled) setEmployees(onDutyOnly(data));
    });
    return () => { cancelled = true; };
  }, [isOpen, sale?.id, ajukan]);   // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setItem = (id, patch) => setDraft((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  const calc = useMemo(() => (draft && sale ? calcDraft(draft, sale) : null), [draft, sale]);
  const lines = useMemo(
    () => (draft && sale ? describeSnapshots(snapshotFromSale(sale), snapshotFromDraft(draft, sale), formatRupiah) : []),
    [draft, sale, formatRupiah],
  );
  const problem = draft && sale ? validateDraft(draft, sale) : null;
  const requestProblem = ajukan && draft && !problem
    ? (!draft.by.trim() ? 'Pilih namamu dulu.' : !draft.reason.trim() ? 'Isi alasan perubahan.' : null)
    : null;
  const blocked = Boolean(problem || requestProblem);

  if (!sale || !draft) return <Modal isOpen={false} sheet maxHeight />;

  const win = editWindow(sale, now);
  const liveCount = draft.items.filter((i) => !i.gone).length;
  const received = Number(String(draft.received).replace(/\D/g, '')) || 0;
  const date = new Date(sale.paid_at || sale.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const submit = async () => {
    if (busy || blocked) return;
    setBusy(true);
    try {
      const changes = draftChanges(draft, sale);
      if (ajukan) {
        await ajukanUbahTransaksi(sale.id, changes, { reason: draft.reason, requestedBy: draft.by });
        lastRequester = draft.by.trim();
        onClose();
        onDone?.();
        showToast('Terkirim ke owner. Transaksi baru berubah setelah owner menyetujui.', { duration: 4500 });
      } else {
        await ubahTransaksi(sale.id, changes, { asOwner: isOwner });
        onClose();
        onDone?.();
        showToast('Tersimpan · tercatat di riwayat perubahan');
      }
    } catch (e) {
      triggerAlert(e.message || 'Gagal menyimpan perubahan.');
    } finally { setBusy(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} dirty={dirty} sheet size="lg" maxHeight title={ajukan ? 'Ajukan Ubah Transaksi' : 'Ubah Transaksi'}>
      <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="sheet-ubah-transaksi">
        {/* Banner batas waktu */}
        {ajukan ? (
          <div className="rounded-2xl px-3.5 py-3 bg-amber-50 dark:bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300 flex gap-2" data-testid="banner-ajukan">
            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Sudah lewat {EDIT_WINDOW_MINUTES} menit sejak dibayar, jadi perubahan harus disetujui owner. Transaksi tidak berubah sebelum itu.</p>
          </div>
        ) : isOwner && !win.open ? (
          <div className="rounded-2xl px-3.5 py-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300" data-testid="banner-owner">
            Owner bisa mengubah kapan saja. Setiap perubahan tercatat di riwayat perubahan.
          </div>
        ) : (
          <div className="rounded-2xl px-3.5 py-3 bg-emerald-50 dark:bg-emerald-500/10" data-testid="banner-langsung">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Bisa diubah langsung · sisa {win.minutesLeft} menit</p>
            <div className="h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 mt-2 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((1 - win.fraction) * 100)}%` }} />
            </div>
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          #{sale.display_number} · {date}{sale.device_name ? ` · ${sale.device_name}` : ''}
        </p>

        <Input label="Pelanggan" placeholder="Umum" value={draft.name} onChange={(e) => set({ name: e.target.value })} />

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Tipe pesanan</p>
          <PillTabs size="sm" value={draft.type} onChange={(v) => set({ type: v })} options={ORDER_TYPES.map((t) => ({ value: t, label: t }))} />
          {draft.type === 'Delivery' && Number(sale.delivery_fee) === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">Ongkir tidak bisa ditambah lewat Ubah.</p>
          )}
        </div>

        {/* Metode bayar */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Metode bayar</p>
          {split ? (
            <div className={`${box} px-3.5 py-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2`} data-testid="split-terkunci">
              <Lock className="w-4 h-4 shrink-0" />
              <p>Split Payment tidak bisa diubah metode dan itemnya. Hanya nama dan tipe pesanan.</p>
            </div>
          ) : (
            <PillTabs size="sm" value={draft.method} onChange={(v) => set({ method: v })} options={EDIT_METHODS.map((m) => ({ value: m, label: m }))} />
          )}
        </div>

        {!split && draft.method === 'Ojol' && (
          <div className={`${box} p-3.5 space-y-3`}>
            <Select label="Aplikasi Ojol" value={draft.platform} onChange={(e) => set({ platform: e.target.value })}>
              <option value="">Pilih aplikasi</option>
              {OJOL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Input label="Nomor order" placeholder="Nomor order ojol" value={draft.orderNo} onChange={(e) => set({ orderNo: e.target.value })} />
          </div>
        )}

        {!split && draft.method === 'Tunai' && calc && (
          <div className={`${box} p-3.5 space-y-2`}>
            <NominalInput label="Uang diterima" title="Uang diterima" value={draft.received} onChange={(e) => set({ received: e.target.value })}
              sheetHint={(n) => (n >= calc.total ? `Kembalian ${formatRupiah(n - calc.total)}` : `Kurang ${formatRupiah(calc.total - n)}`)} />
            {draft.received !== '' && (
              <p className={`text-xs font-bold ${received >= calc.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`} data-testid="kembalian">
                {received >= calc.total ? `Kembalian ${formatRupiah(received - calc.total)}` : `Uang kurang ${formatRupiah(calc.total - received)}`}
              </p>
            )}
          </div>
        )}

        {/* Item */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Item ({liveCount})</p>
          <div className={`${box} divide-y divide-slate-100 dark:divide-slate-800`}>
            {draft.items.map((it) => (
              <div key={it.id} className={`flex items-center gap-3 p-3 ${it.gone ? 'opacity-50' : ''}`} data-testid="item-ubah">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold text-slate-700 dark:text-slate-200 truncate ${it.gone ? 'line-through' : ''}`}>{it.name}{it.variant ? ` (${it.variant})` : ''}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatRupiah(it.price)} · {it.gone ? 'dihapus' : `${formatRupiah(it.price * it.qty)}`}</p>
                </div>
                {split ? (
                  <span className="text-xs font-bold text-slate-500">{it.qty}x</span>
                ) : it.gone ? (
                  <Button variant="secondary" size="sm" icon={<Undo2 className="w-4 h-4" />} onClick={() => setItem(it.id, { gone: false })}>Batalkan</Button>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" aria-label={`Kurangi ${it.name}`} disabled={it.qty <= 1} onClick={() => setItem(it.id, { qty: it.qty - 1 })}
                      className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 disabled:opacity-30 active:scale-95"><Minus className="w-4 h-4" /></button>
                    <span className="w-6 text-center text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{it.qty}</span>
                    <button type="button" aria-label={`Tambah ${it.name}`} disabled={it.qty >= it.origQty} onClick={() => setItem(it.id, { qty: it.qty + 1 })}
                      className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 disabled:opacity-30 active:scale-95"><Plus className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Hapus ${it.name}`} disabled={liveCount <= 1} onClick={() => setItem(it.id, { gone: true })}
                      className="w-8 h-8 rounded-xl text-red-500 flex items-center justify-center disabled:opacity-30 active:scale-95"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!split && <p className="text-xs text-slate-400 dark:text-slate-500">Jumlah hanya bisa dikurangi. Untuk menambah item, buat transaksi baru.</p>}
        </div>

        {/* Total */}
        {calc && (
          <div className={`${box} px-4 py-3 space-y-1.5 text-xs`} data-testid="total-ubah">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Subtotal</span><span className="font-bold text-slate-700 dark:text-slate-200">{formatRupiah(calc.subtotal)}</span></div>
            {Number(sale.voucher_discount) > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Diskon voucher</span><span className="font-bold text-slate-700 dark:text-slate-200">-{formatRupiah(sale.voucher_discount)}</span></div>}
            {Number(sale.manual_discount_amount) > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Diskon tetap</span><span className="font-bold text-slate-700 dark:text-slate-200">-{formatRupiah(sale.manual_discount_amount)}</span></div>}
            {calc.fee > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Ongkir</span><span className="font-bold text-slate-700 dark:text-slate-200">{formatRupiah(calc.fee)}</span></div>}
            <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-700 dark:text-slate-200">Total</span>
              <span className="flex items-baseline gap-2">
                {calc.total !== Number(sale.total) && <span className="text-slate-400 line-through">{formatRupiah(sale.total)}</span>}
                <span className="font-heading font-bold text-base text-slate-800 dark:text-slate-100">{formatRupiah(calc.total)}</span>
              </span>
            </div>
          </div>
        )}

        {/* Ringkasan perubahan */}
        {lines.length > 0 && (
          <div className="rounded-2xl bg-accent-50 dark:bg-accent-500/10 px-4 py-3" data-testid="ringkasan-perubahan">
            <p className="text-xs font-bold text-accent-700 dark:text-accent-400 mb-1.5">Ringkasan perubahan</p>
            <ul className="space-y-1">
              {lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 text-xs text-slate-700 dark:text-slate-200">
                  <span className="min-w-0 break-words">{l.label}</span>
                  <span className="shrink-0 text-right"><span className="text-slate-400 line-through">{l.from}</span> → <span className="font-bold">{l.to}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ajukan && (
          <div className="space-y-3">
            <Select label="Diajukan oleh" value={draft.by} onChange={(e) => set({ by: e.target.value })}>
              <option value="">Pilih namamu</option>
              {employees.map((emp) => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
            </Select>
            <Textarea label="Alasan" rows={3} placeholder="Mis. salah pilih metode bayar, pelanggan batal satu menu" value={draft.reason} onChange={(e) => set({ reason: e.target.value })} />
          </div>
        )}

        {(problem || requestProblem) && draft && lines.length > 0 && (
          <p className="text-xs text-red-500" data-testid="masalah-ubah">{problem || requestProblem}</p>
        )}

        <Button size="full" onClick={submit} disabled={busy || blocked} icon={ajukan ? <Send className="w-4 h-4" /> : <Check className="w-4 h-4" />} data-testid="simpan-ubah">
          {busy ? 'Menyimpan...' : ajukan ? 'Kirim Pengajuan' : 'Simpan Perubahan'}
        </Button>
      </div>
    </Modal>
  );
}
