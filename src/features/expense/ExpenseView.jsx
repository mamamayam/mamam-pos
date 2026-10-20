import { useState, useMemo } from 'react';
import { TrendingDown, Pencil, Trash2, Plus, Store, User, Send } from 'lucide-react';
import { Button, Badge, EmptyState, DetailModal, BulkSelectBar, FilterBar, SummaryPills } from '../../components/ui';
import ExpenseFormSheet from './ExpenseFormSheet';
import QuickAdjustmentSheet from '../home/QuickAdjustmentSheet';
import DeleteRequestSheet from '../history/DeleteRequestSheet';
import { updateDeduction, fetchDeductionByExpense } from '../../hook/deductionEdit';
import { useExpenseDeleteRequestIndex } from '../../hook/useDeleteRequests';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../auth/AuthContext';
import { useExpenseData } from '../../hook/useExpenseData';
import { useBulkSelect } from '../../hook/useBulkSelect';
import { applySort } from '../../utils/sortUtils';
import { dayHeading, groupByDay, sumByDay } from '../../utils/listFilters';
import { dayOf, filterByPeriod, filterExpenses, sourceStats, sourceOf, isDateSort, SORT_OPTIONS, DEFAULT_SORT, WAGE_MASK, isWageHidden, wageMaskPlan } from './expenseFilter';

/**
 * ExpenseView — Pengeluaran. Form, filter, urutkan, pilih-banyak, dan Kelola Kategori
 * di-port dari mamam-global, dengan BEDA yang disengaja:
 *   - Kasbon & potongan karyawan dicatat lewat "Catat Cepat" di Beranda (jadi pengeluaran karyawan di sini,
 *     angkanya terhubung ke gaji). Mengubahnya membuka form Potongan yang sama dengan Catat Cepat/Penggajian
 *     (RPC ubah_potongan: potongan + pengeluaran satu transaksi), BUKAN form Pengeluaran biasa, supaya angka
 *     gaji dan pengeluaran tidak pernah beda. Menghapusnya ikut menghapus potongannya.
 *   - Form-nya komponen bersama ExpenseFormSheet (dipakai juga tombol Pengeluaran di Beranda)
 *   - HARD DELETE (tanpa RecycleBin)
 *   - Data langsung ke Supabase; kalau gagal, user diberi tahu jelas
 *
 * Tampilan sama dengan Riwayat: kartu FilterBar (cari + chip Periode / Kategori / Urutkan),
 * ringkasan per sumber (Toko / Karyawan, ketuk untuk menyaring), lalu daftar ringkas per hari.
 * Ketuk satu catatan = Detail (di sana ada Edit dan Hapus untuk owner). Staf TIDAK bisa menghapus langsung: di Detail
 * hanya ada "Ajukan Hapus" (alasan + nama wajib, migrasi 018); catatan tetap ada sampai owner menyetujui di sheet
 * Persetujuan. Catatan yang sedang diajukan diberi badge "Menunggu hapus"; yang ditolak menampilkan alasannya di Detail.
 *
 * Tanggal pengeluaran diperlakukan sebagai string "YYYY-MM-DD" apa adanya,
 * TIDAK di-parse jadi Date UTC, supaya tidak bergeser sehari di zona waktu
 * tertentu (bug klasik pada laporan tengah malam).
 */

const PAGE = 100;
// Detail disimpan sebagai teks, satu poin per baris. Catatan lama (satu baris) = satu poin.
const noteLines = (note) => String(note || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
const showDate = (v) => {
  const [y, m, d] = dayOf(v).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID');
};

const ExpenseView = () => {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();
  const { can } = useAuth();
  const canChange = can('pengeluaran.ubah');   // edit & hapus LANGSUNG; mencatat baru boleh semua peran
  const canRequest = !canChange;               // tanpa izin hapus langsung = mengajukan hapus ke owner
  const canWage = can('karyawan.upah');        // boleh melihat nominal pengeluaran karyawan (gaji, kasbon); staf: disensor seperti di Beranda
  const expenseData = useExpenseData();
  const { expenses, categories, employees, loading, error, reload, deleteExpense, bulkDeleteExpenses } = expenseData;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);   // catatan yang sedang diedit; null = catatan baru
  const [period, setPeriod] = useState({ mode: 'hari-ini', start: '', end: '' });
  const [category, setCategory] = useState('semua');
  const [sourceFilter, setSourceFilter] = useState('semua');
  const [sortKey, setSortKey] = useState(DEFAULT_SORT);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState(null);
  const [requestFor, setRequestFor] = useState(null);   // pengeluaran yang sedang diajukan hapus (sheet Ajukan Hapus)
  const { index: requests, reload: reloadRequests } = useExpenseDeleteRequestIndex();
  const detailRequest = detail ? requests.get(detail.id) : null;
  const [editDeduction, setEditDeduction] = useState(null);   // { item, onSave } potongan (pengeluaran karyawan) yang diubah
  const [isSelecting, setIsSelecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
    finally { setBusy(false); }
  };

  const resetPaging = () => setLimit(PAGE);
  const isDirty = period.mode !== 'hari-ini' || category !== 'semua' || sourceFilter !== 'semua' || sortKey !== DEFAULT_SORT || query.trim() !== '';

  const employeeNames = useMemo(() => new Map((employees || []).map(e => [e.id, e.name])), [employees]);
  const employeeName = (e) => (e.employeeId ? employeeNames.get(e.employeeId) || '' : '');

  // Kategori untuk filter: daftar kategori + kategori yang muncul di data (mis. Kasbon dari potongan).
  const categoryOptions = useMemo(() => {
    const names = [...(categories || [])];
    for (const e of expenses) if (e.category && !names.includes(e.category)) names.push(e.category);
    return names.map(n => ({ key: n, label: n }));
  }, [categories, expenses]);

  // Periode + kategori + pencarian (BELUM sumber) — dasar ringkasan per sumber.
  const base = useMemo(() => {
    const inRange = filterByPeriod(expenses, period.mode, { start: period.start, end: period.end });
    return filterExpenses(inRange, { category, query, employeeName });
  }, [expenses, period, category, query, employeeNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = useMemo(() => sourceStats(base), [base]);
  const baseTotal = useMemo(() => base.reduce((s, e) => s + (Number(e.amount) || 0), 0), [base]);
  // Sumber yang dipilih bisa hilang setelah filter lain berubah -> anggap Semua.
  const activeSource = sources.some(s => s.key === sourceFilter) ? sourceFilter : 'semua';

  const sortedExpenses = useMemo(() => {
    const list = activeSource === 'semua' ? base : base.filter(e => sourceOf(e) === activeSource);
    return applySort(list, sortKey, {
      date: e => dayOf(e.date),
      category: e => e.category || '',
      amount: e => Number(e.amount) || 0,
    });
  }, [base, activeSource, sortKey]);

  const { selectedIds, allSelected, toggleOne, toggleAll, reset: resetSelection, count } = useBulkSelect(sortedExpenses);

  const shown = sortedExpenses.slice(0, limit);
  const byDay = isDateSort(sortKey);
  const groups = byDay ? groupByDay(shown, e => dayOf(e.date)) : [{ day: null, items: shown }];
  const dayTotals = useMemo(() => sumByDay(sortedExpenses, e => dayOf(e.date), e => e.amount), [sortedExpenses]);
  // Sensor untuk staf: nominal karyawan + semua total yang mencampurnya (pil Karyawan/Semua, total harian).
  const pillMask = useMemo(() => wageMaskPlan(base, canWage).pillKeys, [base, canWage]);
  const maskedDays = useMemo(() => wageMaskPlan(sortedExpenses, canWage).days, [sortedExpenses, canWage]);
  const showHeads = byDay && groups.length > 1;

  const openNew = () => { setEditing(null); setIsFormOpen(true); };
  const closeForm = () => { setIsFormOpen(false); setEditing(null); };

  const handleEditClick = (exp) => {
    if (!exp.employeeId) { setDetail(null); setEditing(exp); setIsFormOpen(true); return; }
    // Pengeluaran karyawan = potongan gaji: diubah lewat form Potongan (RPC ubah_potongan), bukan form Pengeluaran biasa.
    run(async () => {
      const ded = await fetchDeductionByExpense(exp.id);
      setDetail(null);
      if (!ded) { setEditing(exp); setIsFormOpen(true); return; }   // tidak tertaut ke potongan mana pun: aman diubah sebagai pengeluaran biasa
      setEditDeduction({
        item: { id: ded.id, type: 'potongan', employeeId: exp.employeeId, employeeName: employeeName(exp), category: exp.category, label: ded.label, amount: exp.amount, date: dayOf(exp.date), paymentMethod: exp.paymentMethod === 'Non-Tunai' ? 'Non-Tunai' : 'Tunai' },
        onSave: async (id, form) => { await updateDeduction(id, form); await reload(); },
      });
    });
  };

  const handleDelete = (exp) => {
    triggerConfirm('Yakin ingin menghapus catatan pengeluaran ini? Data akan hilang permanen.', () =>
      run(async () => { await deleteExpense(exp.id); setDetail(null); if (editing?.id === exp.id) closeForm(); }));
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    triggerConfirm(`Yakin ingin menghapus ${ids.length} catatan terpilih? Data akan hilang permanen.`, () =>
      run(async () => { await bulkDeleteExpenses(ids); resetSelection(); }));
  };

  if (loading) return <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">Memuat pengeluaran...</div>;
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <p className="text-sm font-semibold text-red-500">Gagal memuat pengeluaran</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">{error}</p>
        <Button onClick={reload}>Coba Lagi</Button>
      </div>
    );
  }

  const renderRow = (exp) => {
    const lines = noteLines(exp.note);
    const selected = selectedIds.has(exp.id);
    const Icon = exp.employeeId ? User : Store;
    let sub = exp.supplier || lines[0] || 'Tanpa catatan';
    if (exp.supplier && lines[0]) sub = `${exp.supplier} • ${lines[0]}${lines.length > 1 ? ` +${lines.length - 1}` : ''}`;
    if (!byDay) sub = `${showDate(exp.date)} • ${sub}`;
    return (
      <div key={exp.id} data-testid="exp-row"
        className={`flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border shadow-sm transition-all duration-300 ${selected ? 'border-red-400 ring-1 ring-red-400' : 'border-slate-100 dark:border-slate-800'}`}>
        {isSelecting && (
          <input type="checkbox" checked={selected} onChange={() => toggleOne(exp.id)} aria-label={`Pilih ${exp.category}`} className="w-4 h-4 rounded accent-[#dc2626] cursor-pointer shrink-0" />
        )}
        <button type="button" onClick={() => (isSelecting ? toggleOne(exp.id) : setDetail(exp))} className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition-all duration-300">
          <span className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{exp.category}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{sub}</span>
          </span>
          <span className="flex flex-col items-end gap-1 shrink-0 max-w-[45%]">
            {isWageHidden(exp, canWage)
              ? <span className="font-heading font-bold text-sm text-slate-400 truncate max-w-full">{WAGE_MASK}</span>
              : <span className="font-heading font-bold text-sm text-red-600 dark:text-red-400 truncate max-w-full">-{formatRupiah(exp.amount)}</span>}
            {(exp.employeeId || exp.paymentMethod === 'Non-Tunai' || exp.cashHolderName) && (
              <span className="flex flex-wrap justify-end gap-1">
                {exp.employeeId && <Badge variant="orange">Karyawan</Badge>}
                {exp.paymentMethod === 'Non-Tunai' && <Badge variant="info">Bank</Badge>}
                {exp.cashHolderName && <Badge variant="warning">💰 {exp.cashHolderName}</Badge>}
              </span>
            )}
            {requests.get(exp.id)?.status === 'menunggu' && <Badge variant="warning" dot>Menunggu hapus</Badge>}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      <div className="flex flex-col gap-4 w-full min-w-0 flex-1">

        <FilterBar
          query={query} onQueryChange={(v) => { setQuery(v); resetPaging(); }} placeholder="Cari kategori, toko, catatan..."
          period={period} onPeriodChange={(p) => { setPeriod(p); setSourceFilter('semua'); resetPaging(); }}
          typeValue={category} onTypeChange={(v) => { setCategory(v); setSourceFilter('semua'); resetPaging(); }} typeOptions={categoryOptions}
          typeAllLabel="Semua Kategori" typeChipLabel="Kategori" typeTitle="Kategori Pengeluaran"
          sortValue={sortKey} sortDefault={DEFAULT_SORT} onSortChange={setSortKey} sortOptions={SORT_OPTIONS}
        />

        {/* Ringkasan per sumber: ketuk untuk menyaring (Semua = total periode ini) */}
        <SummaryPills
          tone="red" negative testIdPrefix="source"
          items={sources.map(s => ({ key: s.key, label: `${s.key.toUpperCase()} · ${s.count}X`, total: s.total }))}
          allTotal={baseTotal} value={activeSource} maskKeys={pillMask}
          onChange={(k) => { setSourceFilter(k); resetPaging(); }}
        />

        {isSelecting && sortedExpenses.length > 0 && (
          <BulkSelectBar count={count} total={sortedExpenses.length} allSelected={allSelected} onToggleAll={toggleAll} onDeleteSelected={handleBulkDelete} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400"><span data-testid="exp-count">{sortedExpenses.length}</span> catatan</p>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {canChange && sortedExpenses.length > 0 && (
              <button onClick={() => { if (isSelecting) resetSelection(); setIsSelecting(v => !v); }}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-300 active:scale-95 shrink-0 ${isSelecting ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'text-slate-500 dark:text-slate-400 hover:text-accent-600 dark:hover:text-accent-400'}`}>
                {isSelecting ? 'Batal' : 'Pilih'}
              </button>
            )}
          </div>
        </div>

        {sortedExpenses.length === 0 ? (
          <EmptyState
            icon={<TrendingDown className="w-12 h-12" />}
            title={isDirty ? 'Tidak ada pengeluaran yang cocok.' : 'Belum ada pengeluaran pada periode ini.'}
            className="animate-in fade-in duration-300"
          />
        ) : (
          <div className="space-y-4">
            {groups.map((g, gi) => (
              <div key={g.day || gi} className="space-y-2">
                {showHeads && (
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{dayHeading(g.day)}</p>
                    {maskedDays.has(g.day)
                      ? <p className="font-heading font-bold text-xs text-slate-400">{WAGE_MASK}</p>
                      : <p className="font-heading font-bold text-xs text-red-600 dark:text-red-400">-{formatRupiah(dayTotals.get(g.day))}</p>}
                  </div>
                )}
                {g.items.map(renderRow)}
              </div>
            ))}
            {sortedExpenses.length > limit && <Button variant="secondary" size="full" onClick={() => setLimit(limit + PAGE)}>Tampilkan lebih banyak ({sortedExpenses.length - limit} lagi)</Button>}
          </div>
        )}

        {/* Menempel di atas navbar (sticky), jadi tidak perlu scroll ke bawah walau datanya ribuan.
            mt-auto: kalau daftarnya pendek, tombol tetap di dasar layar.
            Tanpa latar: pembungkus tidak menangkap sentuhan (pointer-events-none), hanya tombolnya. */}
        <div className="sticky bottom-0 z-10 mt-auto pt-3 pb-4 md:pb-6 flex flex-col pointer-events-none">
          <Button onClick={openNew} icon={<Plus className="w-4 h-4" />} className="pointer-events-auto w-full sm:w-auto sm:self-end">
            Tambah Pengeluaran
          </Button>
        </div>
      </div>

      <ExpenseFormSheet isOpen={isFormOpen} onClose={closeForm} editing={editing} data={expenseData} />

      {editDeduction && (
        <QuickAdjustmentSheet isOpen kind="potongan" canApprove editing={editDeduction} onClose={() => setEditDeduction(null)} />
      )}

      <DetailModal
        isOpen={!!detail} onClose={() => setDetail(null)}
        icon={detail?.employeeId ? <User className="w-4 h-4 text-accent-500 dark:text-accent-400" /> : <Store className="w-4 h-4 text-accent-500 dark:text-accent-400" />}
        title={detail?.category}
        subtitle={detail && showDate(detail.date)}
        badges={detail ? [
          { label: detail.employeeId ? 'Karyawan' : 'Toko', variant: detail.employeeId ? 'orange' : 'neutral' },
          { label: detail.paymentMethod === 'Non-Tunai' ? 'Bank' : 'Tunai', variant: detail.paymentMethod === 'Non-Tunai' ? 'info' : 'success' },
        ] : []}
        sections={[{ rows: [
          { label: 'Toko / Supplier', value: detail?.supplier },
          { label: 'Karyawan', value: detail ? employeeName(detail) : '' },
          { label: 'Pemegang Kas', value: detail?.cashHolderName },
          { label: 'Dicatat dari', value: detail?.deviceName },
          { label: 'Catatan', value: detail ? noteLines(detail.note).join('\n') : '', type: 'multiline' },
          ...(detailRequest?.status === 'menunggu' ? [{ label: 'Pengajuan hapus', value: `Menunggu keputusan owner (diajukan ${detailRequest.requestedBy})` }] : []),
          ...(detailRequest?.status === 'ditolak' ? [{ label: 'Pengajuan hapus ditolak', value: detailRequest.rejectReason || 'Owner menolak pengajuan hapus ini.' }] : []),
        ] }]}
        highlight={isWageHidden(detail, canWage)
          ? { label: 'Nominal', value: WAGE_MASK, type: 'text', tone: 'danger' }
          : { label: 'Nominal', value: detail?.amount, tone: 'danger' }}
        actions={detail && canChange ? [
          // Pengeluaran karyawan (dari potongan) juga bisa diubah: membuka form Potongan yang sama (lihat handleEditClick).
          { label: 'Edit', icon: <Pencil className="w-4 h-4" />, variant: 'secondary', onClick: () => handleEditClick(detail) },
          { label: 'Hapus', icon: <Trash2 className="w-4 h-4" />, variant: 'danger', onClick: () => handleDelete(detail) },
        ] : detail && canRequest && detailRequest?.status !== 'menunggu' ? [
          { label: 'Ajukan Hapus', icon: <Send className="w-4 h-4" />, variant: 'danger', onClick: () => { setRequestFor(detail); setDetail(null); } },
        ] : []}
      />

      <DeleteRequestSheet
        isOpen={!!requestFor} onClose={() => setRequestFor(null)} expense={requestFor}
        hideAmount={isWageHidden(requestFor, canWage)} employeeName={requestFor ? employeeName(requestFor) : ''}
        onSubmitted={reloadRequests}
      />
    </div>
  );
};

export default ExpenseView;
