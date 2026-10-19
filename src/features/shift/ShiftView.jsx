import { useState, useMemo } from 'react';
import { Clock, FileText, AlertTriangle, Users } from 'lucide-react';
import { Button, Card, Input, NominalInput, Select, PillTabs, EmptyState, Badge, Modal } from '../../components/ui';
import useDirty from '../../hook/useDirty';
import { showToast } from '../../lib/toast';
import { useAppContext } from '../../context/AppContext';
import { useShiftData } from '../../hook/useShiftData';
import { toLocalDateString } from '../../utils/formatters';

/**
 * ShiftView — Dompet (buka/tutup kas). Tampilan mengikuti mamam-global
 * (kartu Buka Dompet, kartu Dompet Terbuka + Saldo Aktual, laporan tutup,
 * tab Riwayat), dengan perbedaan yang DISENGAJA:
 *   - tidak ada "Catat Perpindahan Uang" / ledger; uang yang masih di kurir
 *     saat tutup hanya jadi SNAPSHOT di laporan
 *   - tidak ada tab Log Transaksi
 *   - riwayat shift tidak bisa dihapus / diedit (tanpa auth admin dulu)
 *   - laporan tutup hanya tampil di layar (tanpa Cetak/Bagikan)
 */

const money = (fn, n) => fn(n ?? 0);
const diffLabel = (d) => (d < 0 ? 'SELISIH MINUS' : d > 0 ? 'SELISIH LEBIH' : 'BALANCE (PAS)');
const diffColor = (d) =>
  d < 0 ? 'text-accent-500 dark:text-accent-400' : d > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100';

// ── Laporan tutup dompet (hanya layar) ────────────────────────────────
function ClosedReport({ shift, formatRupiah, onClose }) {
  const st = shift.stats_json || {};
  const couriers = Array.isArray(shift.courier_snapshot_json) ? shift.courier_snapshot_json : [];
  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto items-center animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 p-6 w-full max-w-sm rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800">
        <div className="text-center border-b-2 border-dashed border-slate-300 dark:border-slate-600 pb-4 mb-4">
          <h2 className="text-xl font-bold uppercase tracking-widest text-slate-800 dark:text-slate-100 mb-1">DOMPET</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">LAPORAN TUTUP DOMPET</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">ID: {shift.code}</p>
        </div>

        <div className="space-y-1 text-xs mb-4">
          <div className="flex justify-between"><span>Buka:</span> <span>{new Date(shift.opened_at).toLocaleString('id-ID')}</span></div>
          <div className="flex justify-between"><span>Tutup:</span> <span>{new Date(shift.closed_at).toLocaleString('id-ID')}</span></div>
          {shift.opened_by_employee_name && (
            <div className="flex justify-between"><span>Kasir:</span> <span className="font-bold">{shift.opened_by_employee_name}</span></div>
          )}
        </div>

        <div className="border-b-2 border-dashed border-slate-300 dark:border-slate-600 pb-4 mb-4 text-xs space-y-1.5">
          <div className="flex justify-between"><span>Saldo Awal (Modal)</span> <span>{formatRupiah(st.initialCash)}</span></div>
          <div className="flex justify-between"><span>Penjualan Tunai</span> <span>{formatRupiah(st.cashSales)}</span></div>
          <div className="flex justify-between"><span>Pemasukan Lain</span> <span>{formatRupiah(st.cashIncomes)}</span></div>
          <div className="flex justify-between text-accent-500 dark:text-accent-400"><span>Pengeluaran Kasir</span> <span>-{formatRupiah(st.cashExpensesKasir)}</span></div>
          {st.cashExpensesKurir > 0 && (
            <div className="flex justify-between text-accent-500 dark:text-accent-400"><span>Pengeluaran Kurir</span> <span>-{formatRupiah(st.cashExpensesKurir)}</span></div>
          )}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between font-bold"><span>Total Seharusnya di Dompet</span> <span>{formatRupiah(shift.expected_cash)}</span></div>
          <div className="flex justify-between font-bold"><span>Saldo Aktual</span> <span>{formatRupiah(shift.closing_balance)}</span></div>
          <div className={`flex justify-between font-bold pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 ${diffColor(shift.difference)}`}>
            <span>{diffLabel(shift.difference)}</span>
            <span>{formatRupiah(shift.difference)}</span>
          </div>
        </div>

        {couriers.length > 0 && (
          <div className="border-t-2 border-dashed border-slate-300 dark:border-slate-600 mt-4 pt-4 text-xs space-y-1.5">
            <p className="font-bold uppercase tracking-wide text-xs text-slate-500 dark:text-slate-400 mb-1">Uang Masih di Kurir (saat tutup)</p>
            {couriers.map(c => (
              <div key={c.employeeId} className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{c.employeeName}</span>
                <span>{formatRupiah(c.balance)}</span>
              </div>
            ))}
            <p className="text-slate-400 dark:text-slate-500 italic pt-1">Hanya catatan. Dompet berikutnya mulai dari nol.</p>
          </div>
        )}

        <div className="text-center mt-8 text-xs text-slate-500 dark:text-slate-400"><p>-- Akhir Laporan --</p></div>
      </div>

      <div className="mt-6 w-full max-w-sm">
        <Button variant="secondary" size="full" onClick={onClose}>Tutup</Button>
      </div>
    </div>
  );
}

const ShiftView = () => {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();
  const { currentShift, stats, history, employees, loading, error, reload, openShift, closeShift } = useShiftData();

  const [activeTab, setActiveTab] = useState('aktif');
  const [isOpenSheet, setIsOpenSheet] = useState(false);    // sheet Buka Dompet
  const [isCloseSheet, setIsCloseSheet] = useState(false);  // sheet Tutup Dompet
  const [initialCashInput, setInitialCashInput] = useState('');
  const [openedBy, setOpenedBy] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [report, setReport] = useState(null);       // laporan yang sedang dilihat
  const [busy, setBusy] = useState(false);         // cegah dobel-klik
  // Menutup sheet yang sudah terisi = konfirmasi buang isian (Modal `dirty`).
  const openDirty = useDirty(isOpenSheet, [initialCashInput, openedBy]).dirty;
  const closeDirty = useDirty(isCloseSheet, [actualCashInput]).dirty;
  const [filterMode, setFilterMode] = useState('hari-ini');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const isCarriedOver = useMemo(() => {
    if (!currentShift) return false;
    return new Date(currentShift.opened_at).toDateString() !== new Date().toDateString();
  }, [currentShift]);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { return await fn(); }
    catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
    finally { setBusy(false); }
  };

  const handleOpen = () => run(async () => {
    await openShift({ initialCash: initialCashInput, openedByEmployeeId: openedBy });
    setInitialCashInput(''); setOpenedBy('');
    setIsOpenSheet(false);
    showToast('Dompet berhasil dibuka');
  });

  const handleClose = () => {
    if (actualCashInput === '' || Number(actualCashInput) < 0) return triggerAlert('Masukkan uang aktual yang ada di dompet');
    triggerConfirm('Apakah Anda yakin ingin menutup dompet ini? Semua transaksi selanjutnya tidak akan terekap di dompet ini.', () =>
      run(async () => {
        const closed = await closeShift({ actualCash: actualCashInput });
        setActualCashInput('');
        setIsCloseSheet(false);
        setReport(closed);
      }));
  };

  // ── Riwayat: filter + rekap ────────────────────────────────────────
  const filtered = useMemo(() => {
    const today = toLocalDateString();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = toLocalDateString(y);
    const month = today.slice(0, 7);
    return history.filter(s => {
      const day = toLocalDateString(s.closed_at);
      if (filterMode === 'hari-ini') return day === today;
      if (filterMode === 'kemarin') return day === yesterday;
      if (filterMode === 'bulan-ini') return day.startsWith(month);
      if (filterMode === 'tanggal-terpilih') return (!startDate || day >= startDate) && (!endDate || day <= endDate);
      return true;
    });
  }, [history, filterMode, startDate, endDate]);

  const rekap = useMemo(() => filtered.reduce((a, s) => ({
    sales: a.sales + (s.stats_json?.cashSales || 0),
    expected: a.expected + (s.expected_cash || 0),
    diff: a.diff + (s.difference || 0),
  }), { sales: 0, expected: 0, diff: 0 }), [filtered]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">Memuat dompet...</div>;
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <p className="text-sm font-semibold text-red-500">Gagal memuat dompet</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">{error}</p>
        <Button onClick={reload}>Coba Lagi</Button>
      </div>
    );
  }
  if (report) return <ClosedReport shift={report} formatRupiah={formatRupiah} onClose={() => setReport(null)} />;

  const activeEmployees = employees.filter(e => e.status !== 'resign');
  const couriers = stats?.couriers || [];
  const saldoAkhir = (stats?.expectedCash ?? 0) + (stats?.totalHeldByCouriers ?? 0);

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out custom-scrollbar relative">
      {/* Tab: Aktif / Riwayat */}
      <PillTabs
        className="mb-6 shrink-0 max-w-md"
        value={activeTab}
        onChange={setActiveTab}
        options={[{ value: 'aktif', label: 'Aktif' }, { value: 'riwayat', label: 'Riwayat' }]}
      />

      {activeTab === 'aktif' && currentShift && isCarriedOver && (
        <div className="max-w-4xl mb-6 shrink-0">
          <div className="bg-red-50 dark:bg-red-500/10 border-2 border-red-100 dark:border-red-500/20 text-red-700 dark:text-red-400 p-4 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-sm text-red-700 dark:text-red-300">Dompet Belum Ditutup dari Hari Sebelumnya!</p>
              <p className="text-xs text-red-600/90 dark:text-red-400/80 mt-0.5">
                Dibuka sejak {new Date(currentShift.opened_at).toLocaleString('id-ID')}.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'aktif' && (!currentShift ? (
        <Card variant="elevated" className="max-w-md mx-auto text-center mt-4 mb-8 shrink-0">
          <div className="w-16 h-16 bg-gradient-to-br from-accent-50 to-accent-100 dark:from-accent-500/10 dark:to-accent-500/15 text-accent-500 dark:text-accent-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <h3 className="font-heading text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 mb-2">Dompet Belom Dibuka</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Masukkan jumlah uang tunai yang ada di dalam dompet saat ini sebagai modal harian.</p>

          <Button size="full" onClick={() => setIsOpenSheet(true)}>Buka Dompet</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mb-8 shrink-0 w-full min-w-0">
          <Card variant="elevated" className="flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 dark:opacity-10"><FileText className="w-32 h-32" /></div>

            <div className="relative z-10">
              <Badge variant="info" className="uppercase tracking-wider">Dompet Terbuka</Badge>
              <h3 className="font-heading text-2xl font-bold text-slate-800 dark:text-slate-100 mt-4 mb-1">{currentShift.code}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Waktu Buka: {new Date(currentShift.opened_at).toLocaleString('id-ID')}</p>
              {currentShift.opened_by_employee_name && (
                <p className="text-sm font-semibold text-accent-600 dark:text-accent-400 mt-1 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {currentShift.opened_by_employee_name}
                </p>
              )}
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase mt-2">Khusus Transaksi Tunai</p>
            </div>

            <div className="mt-8 space-y-4 relative z-10">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Uang Kas Awal</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{money(formatRupiah, stats?.initialCash)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Penjualan</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">+{money(formatRupiah, stats?.cashSales)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Pemasukan Non-Penjualan</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">+{money(formatRupiah, stats?.cashIncomes)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Pengeluaran Kasir</span>
                <span className="font-bold text-accent-600 dark:text-accent-400">-{money(formatRupiah, stats?.cashExpensesKasir)}</span>
              </div>
              {stats?.cashExpensesKurir > 0 && (
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Pengeluaran Kurir</span>
                  <span className="font-bold text-accent-600 dark:text-accent-400">-{money(formatRupiah, stats?.cashExpensesKurir)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Saldo Akhir</span>
                <span className="font-bold text-2xl text-slate-800 dark:text-slate-100">{formatRupiah(saldoAkhir)}</span>
              </div>

              <div className="mt-2 pt-4 border-t border-dashed border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Rincian Posisi Uang</p>
                <div className="space-y-1.5">
                  <BreakdownRow label="Kasir (Dompet)" value={stats?.expectedCash ?? 0} colorClass="bg-slate-400" formatRupiah={formatRupiah} />
                  {couriers.map(c => (
                    <BreakdownRow key={c.employeeId} label={c.employeeName} value={c.balance} colorClass="bg-sky-400" isDebt={c.balance < 0} formatRupiah={formatRupiah} />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card variant="elevated" className="flex flex-col justify-center">
            <h3 className="font-heading text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 text-center">Saldo Aktual</h3>
            <Button size="full" onClick={() => setIsCloseSheet(true)}>Hitung &amp; Tutup Dompet</Button>
          </Card>
        </div>
      ))}

      {activeTab === 'riwayat' && (
        <div className="pb-12">
          <div className="flex justify-start mb-6">
            <div className="flex items-center gap-2">
              <Select title="Periode" value={filterMode} onChange={e => setFilterMode(e.target.value)} className="py-1.5 px-3 text-xs font-bold">
                <option value="hari-ini">Hari Ini</option>
                <option value="kemarin">Kemarin</option>
                <option value="bulan-ini">Bulan Ini</option>
                <option value="semua">Semua</option>
                <option value="tanggal-terpilih">Tanggal Terpilih</option>
              </Select>
              {filterMode === 'tanggal-terpilih' && (
                <div className="flex items-center gap-1">
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate || undefined} className="py-1.5 px-2 text-xs font-bold" />
                  <span className="text-xs text-slate-400">-</span>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate || undefined} className="py-1.5 px-2 text-xs font-bold" />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card padding="sm" className="flex flex-col justify-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">Total Dompet Dibuka</p>
              <h4 className="font-heading text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">{filtered.length} Kali</h4>
            </Card>
            <Card padding="sm" className="flex flex-col justify-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">Total Pendapatan Tunai</p>
              <h4 className="font-heading text-base md:text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatRupiah(rekap.sales)}</h4>
            </Card>
            <Card padding="sm" className="flex flex-col justify-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">Total Kas Seharusnya</p>
              <h4 className="font-heading text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">{formatRupiah(rekap.expected)}</h4>
            </Card>
            <Card padding="sm" className="flex flex-col justify-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">Total Selisih</p>
              <h4 className={`font-heading text-base md:text-lg font-bold ${diffColor(rekap.diff)}`}>{formatRupiah(rekap.diff)}</h4>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <h4 className="font-heading font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider">Daftar Penutupan Dompet</h4>
              <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold">{filtered.length} data ditemukan</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[400px] overflow-y-auto custom-scrollbar">
              {filtered.length === 0 ? (
                <EmptyState size="sm" icon={<Clock className="w-10 h-10 opacity-30" />} title="Tidak ada riwayat penutupan dompet pada periode ini" />
              ) : filtered.map(s => {
                const badgeVariant = s.difference < 0 ? 'danger' : s.difference > 0 ? 'success' : 'neutral';
                const statusLabel = s.difference < 0 ? 'Minus' : s.difference > 0 ? 'Lebih' : 'Pas (Balance)';
                return (
                  <button key={s.id} onClick={() => setReport(s)} className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{s.code}</span>
                        <Badge variant={badgeVariant}><span className="uppercase tracking-wider text-xs">{statusLabel}</span></Badge>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        Buka: {new Date(s.opened_at).toLocaleString('id-ID')} | Tutup: {new Date(s.closed_at).toLocaleString('id-ID')}
                      </p>
                      {s.opened_by_employee_name && <p className="text-xs text-accent-600 dark:text-accent-400 font-semibold">Kasir: {s.opened_by_employee_name}</p>}
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Saldo Awal: {formatRupiah(s.stats_json?.initialCash)} | Penjualan Tunai: {formatRupiah(s.stats_json?.cashSales)} | Target Uang: {formatRupiah(s.expected_cash)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-0 pt-2 md:pt-0">
                      <div className="text-left md:text-right">
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Uang Aktual</p>
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{formatRupiah(s.closing_balance)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Selisih</p>
                        <p className={`font-bold text-sm ${diffColor(s.difference)}`}>{s.difference > 0 ? '+' : ''}{formatRupiah(s.difference)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <Modal isOpen={isOpenSheet} onClose={() => setIsOpenSheet(false)} dirty={openDirty} sheet size="lg" maxHeight title="Buka Dompet">
        <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-slate-500 dark:text-slate-400">Masukkan jumlah uang tunai yang ada di dalam dompet saat ini sebagai modal harian.</p>
          <NominalInput label="Saldo Awal" value={initialCashInput}
            onChange={e => setInitialCashInput(e.target.value)} placeholder="0" className="text-lg font-bold" />
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Dibuka Oleh (Opsional)</label>
            <Select title="Dibuka Oleh" value={openedBy} onChange={e => setOpenedBy(e.target.value)}>
              <option value="">-- Pilih Karyawan --</option>
              {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <Button size="full" onClick={handleOpen} disabled={busy}>{busy ? 'Memproses...' : 'Buka Dompet'}</Button>
        </div>
      </Modal>

      <Modal isOpen={isCloseSheet} onClose={() => setIsCloseSheet(false)} dirty={closeDirty} sheet size="lg" maxHeight title="Saldo Aktual">
        <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <NominalInput title="Saldo Aktual"
            value={actualCashInput} onChange={e => setActualCashInput(e.target.value)} placeholder="0"
            className="text-xl font-bold py-4 border-2 focus:border-accent-600" />
          <Button size="full" onClick={handleClose} disabled={busy}>{busy ? 'Memproses...' : 'Tutup Dompet'}</Button>
        </div>
      </Modal>
    </div>
  );
};

// Baris "Rincian Posisi Uang"
function BreakdownRow({ label, value, colorClass, isDebt, formatRupiah }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
        <span className={`w-2 h-2 rounded-full ${colorClass}`} />
        {label}{isDebt && <span className="text-xs text-red-500 dark:text-red-400 font-bold">(bisnis berutang)</span>}
      </span>
      <span className={`font-bold ${isDebt ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>{formatRupiah(value)}</span>
    </div>
  );
}

export default ShiftView;
