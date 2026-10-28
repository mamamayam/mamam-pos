import { useState, useMemo, useEffect } from 'react';
import { Wallet, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';
import { Button, Card, NominalInput, Select, EmptyState, Badge, Modal } from '../../components/ui';
import PeriodNav from '../../components/PeriodNav';
import useDirty from '../../hook/useDirty';
import { showToast } from '../../lib/toast';
import { useAppContext } from '../../context/AppContext';
import { useShiftData } from '../../hook/useShiftData';
import { toLocalDateString } from '../../utils/formatters';
import { dayLabel, dayOptions, shiftDate } from '../reports/reportsMath';
import { closedOnDay, diffTone, walletRows, courierRows, dayTotalCash } from './shiftMath';
import { onDutyOnly } from '../employee/employeeOptions';

/**
 * ShiftView — Dompet (buka/tutup kas). SATU halaman, bergaya Absensi (navigasi hari), tanpa tab Riwayat:
 *   - Kartu status Dompet di atas, dengan SAKLAR buka/tutup (ketuk = sheet Buka/Tutup Dompet yang sama seperti
 *     sebelumnya; saklar baru bergeser setelah berhasil).
 *   - Navigasi hari `‹ [Sab, 24 Okt 2026 ▾] ›` + "Ke hari ini" + "Diperbarui / Perbarui" (PeriodNav, pola Absensi).
 *   - Isi hari yang dipilih: hari ini + dompet terbuka = kartu UANG DI DOMPET (kasir, angka utama; rincian dilipat),
 *     kartu UANG DI KURIR (warna sekunder), dan TOTAL CASH (dompet + kurir). Penutupan pada hari itu tampil langsung
 *     dengan gaya yang sama (isi laporan tutup); tanpa penutupan = keterangan kosong.
 * Aturan uang TIDAK berubah (shiftMath): Uang di Dompet = expectedCash, kurir terpisah, Total Cash = totalCashBisnis.
 * Perbedaan yang DISENGAJA dari mamam-global:
 *   - tidak ada "Catat Perpindahan Uang" / ledger; uang yang masih di kurir
 *     saat tutup hanya jadi SNAPSHOT di laporan
 *   - tidak ada tab Log Transaksi
 *   - riwayat shift tidak bisa dihapus / diedit (tanpa auth admin dulu)
 *   - laporan tutup hanya tampil di layar (tanpa Cetak/Bagikan)
 */

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

// ── Potongan tampilan (hanya presentasi; angka dari shiftMath/useShiftData) ───

// Saklar Dompet: ketuk membuka sheet Buka/Tutup (isian di sana butuh nominal), jadi saklar tidak berubah sendiri.
function WalletSwitch({ on, onToggle, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={on ? 'Tutup dompet' : 'Buka dompet'} onClick={onToggle} disabled={disabled}
      data-testid="dompet-saklar"
      className={`relative h-8 w-14 shrink-0 rounded-full transition-all duration-300 active:scale-95 disabled:opacity-60 ${on ? 'bg-gradient-to-r from-accent-600 to-accent-500 dark:from-accent-500 dark:to-accent-600 shadow-[0_4px_14px_rgba(var(--color-accent-500),0.3)]' : 'bg-slate-200 dark:bg-slate-700'}`}>
      <span className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 ${on ? 'translate-x-6' : ''}`} />
    </button>
  );
}

// Satu baris rincian di dalam kartu utama. `total` = baris jumlah (tebal, diberi garis di atasnya).
const Ledger = ({ l, v, sign, total, line, formatRupiah }) => (
  <div className={`flex justify-between items-center text-xs gap-3 ${total ? `border-t ${line} pt-1.5 mt-1.5 text-[13px]` : ''}`}>
    <span className="flex items-center gap-2 min-w-0"><span className="w-3 text-center opacity-70">{sign}</span><span className={`truncate ${total ? 'font-bold' : ''}`}>{l}</span></span>
    <span className="font-bold tabular-nums">{formatRupiah(v)}</span>
  </div>
);

// Dompet = oranye tema penuh (teks putih). Kurir = oranye tema yang muda/lembut (teks gelap), bukan biru.
const HERO_TONE = {
  accent: {
    card: 'text-white bg-gradient-to-br from-accent-600 to-accent-500 dark:from-accent-500 dark:to-accent-600 shadow-[0_8px_24px_rgba(var(--color-accent-500),0.25)]',
    btn: 'bg-white/15', panel: 'bg-white/10', line: 'border-white/25',
  },
  soft: {
    card: 'text-accent-900 dark:text-accent-100 bg-accent-100 dark:bg-accent-500/15 border border-accent-200 dark:border-accent-500/25',
    btn: 'bg-accent-200/70 dark:bg-accent-500/20', panel: 'bg-accent-200/40 dark:bg-accent-500/10', line: 'border-accent-300/70 dark:border-accent-500/30',
  },
};

// Kartu utama: nominal besar + Rincian yang dilipat. Dompet dan kurir memakai komponen yang SAMA, beda `tone`.
function Hero({ label, hint, amount, badge, rows, formatRupiah, testId, tone = 'accent' }) {
  const [openRows, setOpenRows] = useState(false);
  const t = HERO_TONE[tone];
  return (
    <div data-testid={testId} className={`rounded-3xl p-5 ${t.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wider uppercase opacity-80">{label}</p>
          <p className="font-heading font-bold text-4xl mt-1 tracking-tight">{formatRupiah(amount)}</p>
          {hint && <p className="text-xs opacity-80 mt-1">{hint}</p>}
        </div>
        {badge}
      </div>
      <button type="button" onClick={() => setOpenRows(v => !v)} aria-expanded={openRows}
        className={`mt-4 w-full flex items-center justify-between rounded-xl ${t.btn} px-3 py-2 text-xs font-bold active:scale-[0.98] transition-all`}>
        <span>Rincian</span><ChevronDown className={`w-4 h-4 transition-transform duration-300 ${openRows ? 'rotate-180' : ''}`} />
      </button>
      {openRows && (
        <div className={`mt-2 rounded-xl ${t.panel} px-3 py-2.5 space-y-1.5 animate-in fade-in duration-300`}>
          {rows.map(r => <Ledger key={r.l} {...r} line={t.line} formatRupiah={formatRupiah} />)}
        </div>
      )}
    </div>
  );
}

// Uang yang dipegang kurir: kartu yang sama dengan dompet, oranye muda. Saldo bisa negatif (kurir nombokin).
function CourierCard({ couriers, cashExpensesKurir, formatRupiah }) {
  const total = couriers.reduce((a, c) => a + (Number(c.balance) || 0), 0);
  const names = couriers.map(c => c.employeeName || c.name || 'Kurir').join(', ');
  return (
    <Hero tone="soft" testId="kartu-kurir" label="Uang di Kurir" hint={names} amount={total} formatRupiah={formatRupiah}
      rows={courierRows(couriers, cashExpensesKurir)} />
  );
}

function TotalCash({ wallet, courier, total, formatRupiah }) {
  return (
    <div data-testid="total-cash" className="rounded-2xl px-4 py-3.5 bg-slate-800 dark:bg-slate-900 border border-transparent dark:border-slate-700 text-white flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-wider uppercase text-slate-300">Total Cash</p>
        <p className="text-xs text-slate-400 truncate">{formatRupiah(wallet)} + {formatRupiah(courier)}</p>
      </div>
      <p className="font-heading font-bold text-xl shrink-0">{formatRupiah(total)}</p>
    </div>
  );
}

// Penutupan dompet pada hari yang dilihat: isi laporan tutup, tampil langsung.
function ClosedSection({ shift, formatRupiah }) {
  const st = shift.stats_json || {};
  const couriers = Array.isArray(shift.courier_snapshot_json) ? shift.courier_snapshot_json : [];
  const tone = diffTone(shift.difference);
  const d = Number(shift.difference) || 0;
  const badgeText = tone === 'pas' ? 'Pas' : tone === 'minus' ? `Minus ${formatRupiah(d)}` : `Lebih +${formatRupiah(d)}`;
  const time = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-3" data-testid="penutupan">
      <div className="flex items-center gap-2 px-1 min-w-0">
        <p className="font-heading font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{shift.code}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{time(shift.opened_at)} – {time(shift.closed_at)}{shift.opened_by_employee_name ? ` • ${shift.opened_by_employee_name}` : ''}</p>
      </div>
      <Hero
        label="Uang di Dompet saat Tutup" hint={`Seharusnya ${formatRupiah(shift.expected_cash)}`} amount={shift.closing_balance} formatRupiah={formatRupiah}
        badge={<span data-testid="selisih" className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold bg-white ${tone === 'minus' ? 'text-red-600' : tone === 'lebih' ? 'text-emerald-600' : 'text-accent-600'}`}>{badgeText}</span>}
        rows={walletRows(st, 'Saldo Awal (Modal)')}
      />
      {couriers.length > 0 && (
        <CourierCard couriers={couriers} cashExpensesKurir={st.cashExpensesKurir} formatRupiah={formatRupiah} />
      )}
    </div>
  );
}

const ShiftView = () => {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();
  const { currentShift, stats, history, employees, loading, error, reload, openShift, closeShift } = useShiftData();

  const today = toLocalDateString();
  const [day, setDay] = useState(today);               // hari yang sedang dilihat ('YYYY-MM-DD' lokal)
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isOpenSheet, setIsOpenSheet] = useState(false);    // sheet Buka Dompet
  const [isCloseSheet, setIsCloseSheet] = useState(false);  // sheet Tutup Dompet
  const [initialCashInput, setInitialCashInput] = useState('');
  const [openedBy, setOpenedBy] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [report, setReport] = useState(null);       // laporan yang baru ditutup
  const [busy, setBusy] = useState(false);         // cegah dobel-klik
  // Menutup sheet yang sudah terisi = konfirmasi buang isian (Modal `dirty`).
  const openDirty = useDirty(isOpenSheet, [initialCashInput, openedBy]).dirty;
  const closeDirty = useDirty(isCloseSheet, [actualCashInput]).dirty;

  useEffect(() => { if (!loading && !updatedAt) setUpdatedAt(new Date()); }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await reload(); setUpdatedAt(new Date()); } finally { setRefreshing(false); }
  };

  const handleOpen = () => run(async () => {
    await openShift({ initialCash: initialCashInput, openedByEmployeeId: openedBy });
    setInitialCashInput(''); setOpenedBy('');
    setIsOpenSheet(false);
    setDay(toLocalDateString());
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

  const closedToday = useMemo(() => closedOnDay(history, day, toLocalDateString), [history, day]);

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

  const activeEmployees = onDutyOnly(employees);
  const couriers = stats?.couriers || [];
  const isToday = day === today;
  const showLive = isToday && !!currentShift;
  const toggleShift = () => (currentShift ? setIsCloseSheet(true) : setIsOpenSheet(true));
  const dayCash = dayTotalCash({ live: showLive, stats, closed: closedToday });

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out custom-scrollbar relative">
      <div className="max-w-3xl w-full space-y-4 pb-10">
        {currentShift && isCarriedOver && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-700 dark:text-red-400 p-3.5 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-sm text-red-700 dark:text-red-300">Dompet belum ditutup dari hari sebelumnya!</p>
              <p className="text-xs text-red-600/90 dark:text-red-400/80 mt-0.5">Dibuka sejak {new Date(currentShift.opened_at).toLocaleString('id-ID')}.</p>
            </div>
          </div>
        )}

        {/* Status dompet SAAT INI: selalu terlihat, hari apa pun yang sedang dilihat */}
        <Card padding="sm" data-testid="status-dompet">
          <div className="flex items-center gap-3">
            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${currentShift ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}><Wallet className="w-5 h-5" /></span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-heading font-bold text-sm text-slate-800 dark:text-slate-100">Dompet</p>
                <Badge variant={currentShift ? 'success' : 'neutral'} dot>{currentShift ? 'Terbuka' : 'Belum dibuka'}</Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {currentShift
                  ? `${currentShift.code} • sejak ${new Date(currentShift.opened_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}${currentShift.opened_by_employee_name ? ` • ${currentShift.opened_by_employee_name}` : ''}`
                  : 'Ketuk saklar untuk membuka dompet'}
              </p>
            </div>
            <WalletSwitch on={!!currentShift} onToggle={toggleShift} disabled={busy} />
          </div>
        </Card>

        <Card className="space-y-2">
          <PeriodNav
            label={dayLabel(day)} labelTestId="dompet-hari"
            onPrev={() => setDay(shiftDate(day, -1))} onNext={() => setDay(shiftDate(day, 1))} nextDisabled={isToday}
            prevLabel="Hari sebelumnya" nextLabel="Hari berikutnya"
            onToday={() => setDay(today)} isCurrent={isToday}
            picker={{
              title: 'Pilih Hari', value: day, onChange: setDay, options: dayOptions(today),
              dateInput: { value: day, max: today, onChange: setDay },
            }}
          />
          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
            <span data-testid="dompet-updated">{updatedAt ? `Diperbarui ${updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Memuat...'}</span>
            <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1 font-bold text-accent-600 dark:text-accent-400 disabled:opacity-60"><RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Perbarui</button>
          </div>
        </Card>

        {showLive && (
          <div className="space-y-3" data-testid="dompet-live">
            <Hero
              testId="uang-di-dompet" label="Uang di Dompet" hint="Kasir • khusus transaksi tunai" amount={stats?.expectedCash ?? 0} formatRupiah={formatRupiah}
              rows={walletRows(stats)}
            />
            {couriers.length > 0 && (
              <CourierCard couriers={couriers} cashExpensesKurir={stats?.cashExpensesKurir} formatRupiah={formatRupiah} />
            )}
            <TotalCash wallet={stats?.expectedCash ?? 0} courier={stats?.totalHeldByCouriers ?? 0} total={stats?.totalCashBisnis ?? 0} formatRupiah={formatRupiah} />
          </div>
        )}

        {closedToday.map(s => <ClosedSection key={s.id} shift={s} formatRupiah={formatRupiah} />)}

        {!showLive && closedToday.length === 0 && (
          <EmptyState icon={<Wallet className="w-12 h-12" />} title={isToday ? 'Dompet hari ini belum dibuka.' : 'Tidak ada penutupan dompet pada hari ini.'} className="animate-in fade-in duration-300" />
        )}

        {/* Total Cash hari yang dilihat (dompet + kurir), satu baris abu-abu, paling bawah.
            Hari ini + dompet terbuka sudah punya kartu Total Cash hitam (angka sama), jadi tidak diulang. */}
        {dayCash !== null && !showLive && (
          <div data-testid="total-cash-hari" className="rounded-2xl px-4 py-3 bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-between gap-3">
            <span className="text-xs font-bold tracking-wider uppercase">Total Cash{isToday ? ' Hari Ini' : ''}</span>
            <span className="font-heading font-bold text-lg shrink-0">{formatRupiah(dayCash)}</span>
          </div>
        )}
      </div>

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

export default ShiftView;
