import { useState, useMemo } from 'react';
import { RefreshCw, Trash2, Receipt, ShoppingBag, Utensils, Truck, Bike, Send, Share2 } from 'lucide-react';
import { Card, EmptyState, DetailModal, Button, Badge, BulkSelectBar, FilterBar, SummaryPills } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../auth/AuthContext';
import { useReportData } from '../../hook/useReportData';
import { useBulkSelect } from '../../hook/useBulkSelect';
import { periodRange, localDateOf } from '../reports/reportsMath';
import { dayHeading, groupByDay, sumByDay } from '../../utils/listFilters';
import { deviceOptionsFromRows } from '../../hook/deviceLogic';
import { useDeleteRequestIndex } from '../../hook/useDeleteRequests';
import DeleteRequestSheet from './DeleteRequestSheet';
import { receiptFromSale } from '../pos/receiptModel';
import { shareReceiptWithAlert } from '../pos/shareReceipt';
import { filterSales, paymentStats, sortSales, methodOf, splitPartsOf, isTimeSort, SORT_OPTIONS, DEFAULT_SORT } from './riwayatFilter';

/**
 * RiwayatView — Riwayat transaksi lunas, layar tersendiri (dulu tab di Laporan).
 * Kontrol: kartu FilterBar (cari + chip Periode / Tipe order / Urutkan, dua baris),
 * ringkasan per metode bayar (ketuk untuk menyaring), lalu daftar transaksi ringkas
 * per hari. Ketuk satu transaksi = Detail (di sana ada Hapus).
 *
 * BEDA dari A (sengaja):
 *  - Struk: tombol Bagikan di Detail membuat struk GAMBAR (pos/receiptImage.js) dan membukanya di menu share HP. Belum ada cetak ke printer.
 *  - Hapus = permanen dan hanya Owner (izin laporan.hapusTransaksi). Staf yang membuka Riwayat hanya bisa
 *    MENGAJUKAN hapus per transaksi (alasan + nama wajib); owner memutuskan di sheet Persetujuan.
 *    Transaksi yang sedang diajukan diberi badge "Menunggu hapus"; yang ditolak menampilkan alasan penolakan di Detail.
 *  - Online-first: data dibaca langsung dari Supabase; "Perbarui" = muat ulang.
 */
const PAGE = 100;
const TYPE_OPTIONS = [
  { key: 'Takeaway', label: 'Takeaway', icon: <ShoppingBag className="w-4 h-4 opacity-50" /> },
  { key: 'Dine-in', label: 'Dine-in', icon: <Utensils className="w-4 h-4 opacity-50" /> },
  { key: 'Delivery', label: 'Delivery', icon: <Truck className="w-4 h-4 opacity-50" /> },
  { key: 'Ojol', label: 'Ojol', icon: <Bike className="w-4 h-4 opacity-50" /> },
];
const TYPE_ICON = { Takeaway: ShoppingBag, 'Dine-in': Utensils, Delivery: Truck, Ojol: Bike };

const saleDay = (s) => localDateOf(s.paid_at || s.created_at);
const saleClock = (s) => new Date(s.paid_at || s.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export default function RiwayatView() {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();
  const { can } = useAuth();
  const canDelete = can('laporan.hapusTransaksi');
  const canRequest = !canDelete;   // tanpa izin hapus langsung = mengajukan hapus ke owner
  const { index: requests, reload: reloadRequests } = useDeleteRequestIndex();
  const [requestFor, setRequestFor] = useState(null);   // transaksi yang sedang diajukan hapus

  const [period, setPeriod] = useState({ mode: 'hari-ini', start: '', end: '' });
  const [typeFilter, setTypeFilter] = useState('semua');
  const [sortKey, setSortKey] = useState(DEFAULT_SORT);
  const [query, setQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('semua');
  const [deviceFilter, setDeviceFilter] = useState('semua');
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => periodRange(period.mode, { start: period.start, end: period.end }), [period]);
  const { sales, loading, error, updatedAt, reload, deleteTransaction, bulkDeleteTransactions } =
    useReportData({ ...range, withExpenses: false });

  // Tipe order bawaan kasir + tipe lain yang kebetulan ada di data (mis. tipe lama).
  const typeOptions = useMemo(() => {
    const known = new Set(TYPE_OPTIONS.map(o => o.key));
    const extra = [...new Set(sales.map(s => s.order_type).filter(t => t && !known.has(t)))].sort().map(t => ({ key: t, label: t }));
    return [...TYPE_OPTIONS, ...extra];
  }, [sales]);

  // Pilihan perangkat dari transaksi yang sedang tampil (periode ini); pilihan yang hilang setelah ganti periode dianggap Semua.
  const deviceOptions = useMemo(() => deviceOptionsFromRows(sales), [sales]);
  const activeDevice = deviceFilter === 'semua' || deviceOptions.some(o => o.key === deviceFilter) ? deviceFilter : 'semua';

  const resetPaging = () => setLimit(PAGE);
  const isDirty = period.mode !== 'hari-ini' || typeFilter !== 'semua' || sortKey !== DEFAULT_SORT || query.trim() !== '' || methodFilter !== 'semua' || activeDevice !== 'semua';

  // Daftar setelah tipe order + pencarian (BELUM metode bayar) — dasar ringkasan per metode.
  const base = useMemo(() => filterSales(sales, { type: typeFilter, query, device: activeDevice }), [sales, typeFilter, query, activeDevice]);
  const methodStats = useMemo(() => paymentStats(base), [base]);
  const grandTotal = useMemo(() => base.reduce((sum, s) => sum + (Number(s.total) || 0), 0), [base]);

  // Metode yang dipilih bisa hilang setelah filter lain berubah -> anggap Semua.
  const activeMethod = methodStats.some(m => m.key === methodFilter) ? methodFilter : 'semua';

  const visible = useMemo(() => {
    const list = activeMethod === 'semua' ? base : base.filter(s => methodOf(s) === activeMethod);
    return sortSales(list, sortKey);
  }, [base, activeMethod, sortKey]);

  const { selectedIds, allSelected, toggleOne, toggleAll, reset, count } = useBulkSelect(visible);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); } finally { setBusy(false); }
  };

  const handleDelete = (s) => {
    triggerConfirm(`Hapus transaksi #${s.display_number} (${formatRupiah(s.total)}) PERMANEN? Angka dompet dan laba rugi ikut berubah.`, () =>
      run(async () => { await deleteTransaction(s.id); setDetail(null); }));
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    triggerConfirm(`Hapus ${ids.length} transaksi terpilih PERMANEN? Angka dompet dan laba rugi ikut berubah.`, () =>
      run(async () => { await bulkDeleteTransactions(ids); reset(); setIsSelecting(false); }));
  };

  const toggleSelecting = () => { if (isSelecting) reset(); setIsSelecting(v => !v); };
  const updatedLabel = updatedAt ? updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Memuat...';

  const shown = visible.slice(0, limit);
  const byDay = isTimeSort(sortKey);
  const groups = byDay ? groupByDay(shown, saleDay) : [{ day: null, items: shown }];
  const dayTotals = useMemo(() => sumByDay(visible, saleDay, s => s.total), [visible]);
  const showHeads = byDay && groups.length > 1;

  const detailRequest = detail ? requests.get(detail.id) : null;

  const renderRow = (s) => {
    const Icon = TYPE_ICON[s.order_type] || ShoppingBag;
    const isOjol = s.payment_method === 'Ojol';
    const selected = selectedIds.has(s.id);
    return (
      <div key={s.id} data-testid="hist-row"
        className={`flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border shadow-sm transition-all duration-300 ${selected ? 'border-orange-500 ring-1 ring-orange-500' : 'border-slate-100 dark:border-slate-800'}`}>
        {isSelecting && (
          <input type="checkbox" checked={selected} onChange={() => toggleOne(s.id)} aria-label={`Pilih #${s.display_number}`} className="w-5 h-5 rounded accent-[#ea580c] cursor-pointer shrink-0" />
        )}
        <button type="button" onClick={() => (isSelecting ? toggleOne(s.id) : setDetail(s))} className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition-all duration-300">
          <span className="w-10 h-10 rounded-2xl bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{s.customer_name || 'Umum'}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{saleClock(s)} • #{s.display_number} • {s.order_type}</span>
          </span>
          <span className="flex flex-col items-end gap-1 shrink-0 max-w-[45%]">
            <span className="font-heading font-bold text-sm text-slate-800 dark:text-slate-100 truncate max-w-full">{formatRupiah(s.total)}</span>
            <Badge variant={isOjol ? 'orange' : 'success'}>{methodOf(s)}{isOjol && s.ojol_platform ? ` (${s.ojol_platform})` : ''}</Badge>
            {requests.get(s.id)?.status === 'menunggu' && <Badge variant="warning" dot>Menunggu hapus</Badge>}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      <div className="max-w-3xl w-full space-y-4 pb-10">

        <FilterBar
          query={query} onQueryChange={(v) => { setQuery(v); resetPaging(); }} placeholder="Cari order, nama, perangkat..."
          period={period} onPeriodChange={(p) => { setPeriod(p); setMethodFilter('semua'); resetPaging(); }}
          typeValue={typeFilter} onTypeChange={(v) => { setTypeFilter(v); resetPaging(); }} typeOptions={typeOptions}
          typeAllLabel="Semua Tipe Order" typeChipLabel="Semua Tipe" typeTitle="Tipe Order"
          sortValue={sortKey} sortDefault={DEFAULT_SORT} onSortChange={setSortKey} sortOptions={SORT_OPTIONS}
          deviceValue={activeDevice} onDeviceChange={(v) => { setDeviceFilter(v); setMethodFilter('semua'); resetPaging(); }} deviceOptions={deviceOptions}
        />

        {error && (
          <Card className="text-center space-y-2">
            <p className="text-sm font-semibold text-red-500">Gagal memuat riwayat</p>
            <p className="text-xs text-slate-400">{error}</p>
            <Button onClick={reload}>Coba Lagi</Button>
          </Card>
        )}

        {/* Ringkasan per metode bayar: ketuk untuk menyaring (Semua = total periode ini) */}
        {!error && !loading && (
          <SummaryPills
            items={methodStats.map(m => ({ key: m.key, label: `${m.key.toUpperCase()} · ${m.count}X`, total: m.total }))}
            allTotal={grandTotal} value={activeMethod} testIdPrefix="method"
            onChange={(k) => { setMethodFilter(k); resetPaging(); }}
          />
        )}

        {loading && !error && <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">Memuat riwayat...</div>}

        {!loading && !error && (
          <>
            {isSelecting && visible.length > 0 && (
              <BulkSelectBar count={count} total={visible.length} allSelected={allSelected} onToggleAll={toggleAll} onDeleteSelected={handleBulkDelete} />
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-xs text-slate-500 dark:text-slate-400"><span data-testid="hist-count">{visible.length}</span> transaksi</p>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {canDelete && visible.length > 0 && (
                  <button
                    onClick={toggleSelecting} data-testid="riwayat-pilih"
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-300 active:scale-95 shrink-0 ${isSelecting ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'text-slate-500 dark:text-slate-400 hover:text-accent-600 dark:hover:text-accent-400'}`}
                  >
                    {isSelecting ? 'Batal' : 'Pilih Banyak'}
                  </button>
                )}
                <div className="flex items-center gap-0.5 shrink-0 text-xs text-slate-400 dark:text-slate-500" title="Terakhir diperbarui">
                  <span data-testid="riwayat-updated">{updatedLabel}</span>
                  <button onClick={() => { reload(); reloadRequests(); }} aria-label="Perbarui" disabled={loading} className="p-1.5 rounded-full text-accent-600 dark:text-accent-400 active:scale-90 transition-all disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="w-12 h-12" />}
                title={isDirty ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi pada periode ini.'}
                className="animate-in fade-in duration-300"
              />
            ) : (
              <div className="space-y-4">
                {groups.map((g, gi) => (
                  <div key={g.day || gi} className="space-y-2">
                    {showHeads && (
                      <div className="flex items-baseline justify-between gap-3 px-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{dayHeading(g.day)}</p>
                        <p className="font-heading font-bold text-xs text-slate-500 dark:text-slate-400">{formatRupiah(dayTotals.get(g.day))}</p>
                      </div>
                    )}
                    {g.items.map(renderRow)}
                  </div>
                ))}
                {visible.length > limit && <Button variant="secondary" size="full" onClick={() => setLimit(limit + PAGE)}>Tampilkan lebih banyak ({visible.length - limit} lagi)</Button>}
              </div>
            )}
          </>
        )}
      </div>

      <DetailModal
        isOpen={!!detail} onClose={() => setDetail(null)}
        icon={<Receipt className="w-4 h-4 text-accent-500 dark:text-accent-400" />}
        title={detail && `#${detail.display_number}`}
        subtitle={detail && new Date(detail.paid_at || detail.created_at).toLocaleString('id-ID')}
        badges={detail ? [{ label: detail.payment_method === 'Ojol' ? `Ojol (${detail.ojol_platform || ''})` : detail.payment_method, variant: detail.payment_method === 'Ojol' ? 'orange' : 'success' }, { label: detail.order_type, variant: 'neutral' }] : []}
        sections={[{ rows: [{ label: 'Pelanggan', value: detail?.customer_name || 'Umum' }, ...(detail?.ojol_order_number ? [{ label: 'No. Order Ojol', value: detail.ojol_order_number }] : []), ...(detail?.device_name ? [{ label: 'Dicatat dari', value: detail.device_name }] : []),
          ...(detailRequest?.status === 'menunggu' ? [{ label: 'Pengajuan hapus', value: `Menunggu owner · diajukan ${detailRequest.requestedBy}: ${detailRequest.reason}` }] : []),
          ...(detailRequest?.status === 'ditolak' ? [{ label: 'Pengajuan hapus ditolak', value: detailRequest.rejectReason || 'Owner menolak pengajuan hapus ini.' }] : [])] }]}
        items={detail?.items?.map(it => ({ name: it.name, note: [it.variant_name, it.note].filter(Boolean).join(' • '), qty: it.qty, price: it.price }))}
        summaryRows={[
          { label: 'Subtotal', value: detail?.subtotal, type: 'currency' },
          { label: 'Diskon Voucher', value: detail?.voucher_discount ? -detail.voucher_discount : 0, type: 'currency' },
          { label: 'Diskon Manual', value: detail?.manual_discount_amount ? -detail.manual_discount_amount : 0, type: 'currency' },
          { label: 'Ongkir', value: detail?.delivery_fee, type: 'currency' },
        ]}
        highlight={{ label: 'Total Tagihan', value: detail?.total }}
        afterHighlight={(detail?.amount_paid != null || splitPartsOf(detail).length > 0) && (
          <div data-testid="riwayat-cash" className="mt-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 space-y-1.5 text-xs">
            {splitPartsOf(detail).map((p, i) => (
              <div key={i} className="flex justify-between gap-3" data-testid="riwayat-split">
                <span className="text-slate-500 dark:text-slate-400">Split {i + 1} · {p.method}</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{formatRupiah(p.amount)}</span>
              </div>
            ))}
            {detail.amount_paid != null && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">{detail.payment_method === 'Tunai' ? 'Uang diterima' : 'Dibayar'}</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{formatRupiah(detail.amount_paid)}</span>
              </div>
            )}
            {detail.amount_paid != null && detail.change_amount != null && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Kembalian</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{formatRupiah(detail.change_amount)}</span>
              </div>
            )}
          </div>
        )}
        actions={detail ? [
          { label: 'Bagikan', icon: <Share2 className="w-4 h-4" />, onClick: () => shareReceiptWithAlert(receiptFromSale(detail), { formatRupiah, triggerAlert }) },
          ...(canDelete ? [{ label: 'Hapus Transaksi', icon: <Trash2 className="w-4 h-4" />, variant: 'danger', onClick: () => handleDelete(detail) }]
            : canRequest && detailRequest?.status !== 'menunggu' ? [{ label: 'Ajukan Hapus', icon: <Send className="w-4 h-4" />, variant: 'danger', onClick: () => { setRequestFor(detail); setDetail(null); } }] : []),
        ] : []}
      />

      <DeleteRequestSheet isOpen={!!requestFor} onClose={() => setRequestFor(null)} sale={requestFor} onSubmitted={reloadRequests} />
    </div>
  );
}
