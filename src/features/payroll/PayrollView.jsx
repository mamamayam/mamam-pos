import { useState, useMemo } from 'react';
import { Wallet, RefreshCw, Lock } from 'lucide-react';
import { Card, Button, Badge, Modal, EmptyState, PillTabs } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { usePayrollData } from '../../hook/usePayrollData';
import PeriodNav from '../../components/PeriodNav';
import { weekPeriodForDate, shiftWeek, monthPeriod, parseIsoDate, formatIsoDate } from './payrollEngine';
import { toLocalDateString } from '../../utils/formatters';
import AttendanceEditSheet from '../attendance/AttendanceEditSheet';
import { summarizeDay } from '../attendance/dayRules';
import { useAuth } from '../../auth/AuthContext';
import MyPayroll from './MyPayroll';
import PayrollReport from './PayrollReport';
import PayslipShareSheet from './PayslipShareSheet';
import QuickAdjustmentSheet from '../home/QuickAdjustmentSheet';
import { buildPayrollReport, buildClocks, daysInPeriod, openingToForm, openingFromForm, fmtDay, fmtHM } from './payrollReport';
import { buildPayslipPdf } from './payslipPdf';
import { shareOrDownloadFile } from '../../lib/shareFile';

/**
 * PayrollView — Penggajian. Semua angka dihitung payrollEngine (aturan sama
 * dengan mamam-kasir) dari absensi yang DIBACA dari sistem absensi. Layar ini
 * menampilkan gaji, rincian tambahan/potongan (hapus; Potongan juga bisa DIUBAH), dan mencatat saldo awal.
 * Tambahan & Potongan dicatat HANYA lewat Catat Cepat di Beranda (satu tempat, tanpa formulir ganda);
 * mengubah Potongan membuka form Potongan yang sama itu dalam mode ubah (QuickAdjustmentSheet `editing`).
 * Detail gaji (mingguan DAN bulanan) memakai PayrollReport: bagian yang bisa dibuka + slip PDF.
 */

const MON_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const fmtDayYear = (iso) => `${fmtDay(iso)} ${iso.slice(0, 4)}`;

const shiftMonth = (key, delta) => {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + delta, 1));
  return formatIsoDate(d).slice(0, 7);
};

/**
 * Penggajian. Owner: semua karyawan + edit. Staf: layar PIN karyawan, lalu hanya
 * gaji sendiri (MyPayroll). Izin 'penggajian.semua' yang menentukan.
 */
export default function PayrollView() {
  const { can } = useAuth();
  return can('penggajian.semua') ? <OwnerPayroll /> : <MyPayroll />;
}

function OwnerPayroll() {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();

  const today = toLocalDateString();
  const [mode, setMode] = useState('minggu');
  const [anchor, setAnchor] = useState(today);          // tanggal di dalam minggu yang dilihat
  const [month, setMonth] = useState(today.slice(0, 7));
  const period = useMemo(() => (mode === 'minggu' ? weekPeriodForDate(anchor) : monthPeriod(month)), [mode, anchor, month]);

  const data = usePayrollData({ period });
  const { loading, error, attendance, status, isLocked, closing, closeBlockers, results, totals } = data;

  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openingForm, setOpeningForm] = useState({ kind: null, amount: '' });   // saldo awal: jenis (toko/karyawan berutang) + nominal positif
  const [editDate, setEditDate] = useState(null);   // tanggal yang sedang dikoreksi (karyawan = selected)
  const [editDeduction, setEditDeduction] = useState(null);   // potongan yang sedang diubah (form Potongan Catat Cepat, mode ubah)
  const [shareOpen, setShareOpen] = useState(false);          // pilihan bagikan slip gaji PDF (periode bulanan)

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
    finally { setBusy(false); }
  };

  const goPrev = () => (mode === 'minggu' ? setAnchor(shiftWeek(period, -7).start) : setMonth(shiftMonth(month, -1)));
  const goNext = () => (mode === 'minggu' ? setAnchor(shiftWeek(period, 7).start) : setMonth(shiftMonth(month, 1)));
  const goToday = () => { setAnchor(today); setMonth(today.slice(0, 7)); };
  const label = mode === 'minggu'
    ? `${fmtDay(period.start)} – ${fmtDayYear(period.end)}`
    : `${MON_FULL[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

  // Pilihan periode (sheet): minggu = 26 minggu ke belakang + 1 ke depan; bulan = 24 bulan ke belakang + 1 ke depan. Terbaru di atas.
  const isCurrentPeriod = mode === 'minggu' ? (today >= period.start && today <= period.end) : month === today.slice(0, 7);
  const periodOptions = (() => {
    if (mode === 'minggu') {
      const cur = weekPeriodForDate(today);
      return Array.from({ length: 28 }, (_, i) => 1 - i).map((n) => {
        const w = shiftWeek(cur, n * 7);
        return { value: w.start, label: `${fmtDay(w.start)} – ${fmtDayYear(w.end)}`, tag: n === 0 ? 'Minggu ini' : undefined };
      });
    }
    const curKey = today.slice(0, 7);
    return Array.from({ length: 26 }, (_, i) => 1 - i).map((n) => {
      const key = shiftMonth(curKey, n);
      return { value: key, label: `${MON_FULL[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`, tag: n === 0 ? 'Bulan ini' : undefined };
    });
  })();

  const selected = results.find(r => r.employee.id === selectedId) || null;
  // Penanda per hari: ada log otomatis (pulang/libur) atau hasil koreksi owner.
  const hasPulang = (employeeId, date) => (data.prepared?.logs || []).some(l => l.employeeId === employeeId && l.date === date && l.type === 'pulang');
  const dayFlags = (employeeId, date) => {
    const ls = (data.prepared?.logs || []).filter(l => l.employeeId === employeeId && l.date === date);
    return { auto: ls.some(l => l.auto), edited: ls.some(l => l.edited) };
  };
  const openDetail = (r) => {
    setSelectedId(r.employee.id);
    setOpeningForm(openingToForm(r.payroll.openingBalance));
  };

  const handleDeleteItem = (kind, item) => {
    triggerConfirm(`Hapus "${item.label}" (${formatRupiah(item.amount)})?`, () =>
      run(() => (kind === 'tambahan' ? data.deleteAddition(item.id) : data.deleteDeduction(item.id))));
  };

  // Susunan laporan satu karyawan; Saldo awal hanya ada di periode bulanan. Jam masuk/pulang dibaca dari log absensi
  // (periode tertutup tidak membaca absensi lagi, jadi jam tidak tampil).
  const reportOf = (r) => buildPayrollReport(r.payroll, {
    formatRupiah, withOpening: !!period.monthKey, periodDays: daysInPeriod(period),
    clocks: buildClocks(data.prepared?.logs || [], r.employee.id),
  });

  // Ubah potongan: membuka form Potongan yang sama dengan Catat Cepat (Beranda), terisi data potongan.
  const handleEditDeduction = (it) => run(async () => {
    const paymentMethod = await data.getDeductionPayment(it.id);   // null = potongan lama tanpa pengeluaran terhubung
    setEditDeduction({
      item: { id: it.id, employeeId: it.employeeId, employeeName: selected.employee.name, category: it.category, label: it.label, amount: it.amount, date: it.date, paymentMethod },
      onSave: data.updateDeduction,
    });
  });

  // Slip gaji PDF dibuat di perangkat, lalu dibagikan lewat menu share (atau diunduh kalau tidak ada menu share).
  const handleSharePdf = async ({ withDays, withAttachment }) => {
    try {
      const report = reportOf(selected);
      const bytes = buildPayslipPdf({ employeeName: selected.employee.name, role: selected.employee.role, periodLabel: label, rates: selected.rates, report, withDays, withAttachment, formatRupiah });
      const safeName = selected.employee.name.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'karyawan';
      const result = await shareOrDownloadFile(bytes, `Slip-Gaji-${safeName}-${period.monthKey || period.start}.pdf`, { title: `Slip Gaji ${selected.employee.name} ${label}` });
      if (result === 'downloaded') triggerAlert('PDF tersimpan di perangkat ini (menu share tidak tersedia).');
      return result;
    } catch (e) {
      triggerAlert(e.message || 'Gagal membuat PDF.');
      return 'error';
    }
  };

  const handleSaveOpening = () => run(async () => {
    await data.setOpeningBalance(selected.employee.id, openingFromForm(openingForm));   // toko berutang = negatif, karyawan berutang = positif
    triggerAlert('Saldo awal disimpan.');
  });

  const handleClose = () => {
    triggerConfirm(`Tutup periode ${label}? Angka gaji ${results.length} karyawan (total ${formatRupiah(totals.net)}) dibekukan: perubahan upah atau absensi setelah ini tidak mengubahnya, dan tambahan/potongan di periode ini jadi terkunci. Bisa dibuka kembali kalau perlu koreksi.`,
      () => run(async () => { await data.closePeriod(); triggerAlert('Periode ditutup. Angka gaji sudah dibekukan.'); }));
  };
  const handleReopen = () => {
    triggerConfirm(`Buka kembali periode ${label}? Angka beku dihapus dan gaji dihitung ulang dari data terbaru (tarif karyawan sekarang). Pakai ini hanya untuk koreksi.`,
      () => run(async () => { setSelectedId(null); await data.reopenPeriod(); }));
  };

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      <div className="max-w-3xl w-full space-y-4 pb-10">

        <Card className="space-y-3">
          <PillTabs value={mode} onChange={setMode} options={[{ value: 'minggu', label: 'Mingguan' }, { value: 'bulan', label: 'Bulanan' }]} />
          <PeriodNav
            label={label} labelTestId="period-label"
            onPrev={goPrev} onNext={goNext} onToday={goToday} isCurrent={isCurrentPeriod}
            todayLabel={mode === 'minggu' ? 'Ke minggu ini' : 'Ke bulan ini'}
            picker={{
              type: 'list', title: mode === 'minggu' ? 'Pilih Minggu' : 'Pilih Bulan',
              value: mode === 'minggu' ? period.start : month,
              onChange: mode === 'minggu' ? setAnchor : setMonth,
              options: periodOptions,
            }}
          />
        </Card>

        {loading && <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">Memuat gaji...</div>}
        {error && (
          <Card className="text-center space-y-2">
            <p className="text-sm font-semibold text-red-500">Gagal memuat data</p><p className="text-xs text-slate-400 max-w-xs mx-auto">{error}</p>
            <Button onClick={data.reload} icon={<RefreshCw className="w-4 h-4" />}>Coba Lagi</Button>
          </Card>
        )}
        {status === 'error' && (
          <Card className="text-center space-y-2 border-2 border-red-200 dark:border-red-500/30">
            <p className="text-sm font-semibold text-red-500">Absensi gagal dibaca</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">{attendance.error}</p>
            <p className="text-xs text-slate-400">Gaji tidak ditampilkan supaya tidak ada angka Rp 0 yang menyesatkan.</p>
            <Button onClick={data.reload} icon={<RefreshCw className="w-4 h-4" />}>Coba Lagi</Button>
          </Card>
        )}
        {status === 'loading' && !loading && <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-6">Membaca absensi...</div>}

        {(status === 'ready' || status === 'closed') && (
          <>
            {isLocked && (
              <Card className="space-y-2 border-2 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5">
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5"><Lock className="w-4 h-4" /> Periode ini sudah ditutup</p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80" data-testid="closed-info">Ditutup {new Date(closing.closed_at).toLocaleString('id-ID')}. Angka di bawah dibekukan: mengubah upah karyawan atau data absensi tidak mengubahnya, dan tambahan/potongan di periode ini terkunci.</p>
                <Button variant="secondary" size="sm" onClick={handleReopen} disabled={busy}>Buka Kembali</Button>
              </Card>
            )}
            {results.length === 0 ? (
              <EmptyState icon={<Wallet className="w-12 h-12" />} title="Belum ada karyawan. Tambah atau impor di menu Karyawan." />
            ) : results.map(r => {
              const a = r.payroll.attendance;
              return (
                <button key={r.employee.id} onClick={() => openDetail(r)} data-testid={`emp-${r.employee.name}`}
                  className={`w-full text-left bg-white dark:bg-slate-900 rounded-2xl border p-4 active:scale-[0.99] transition-all ${r.needsClarification.length ? 'border-red-300 dark:border-red-500/40' : 'border-slate-100 dark:border-slate-800'}`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-slate-800 dark:text-slate-100 truncate">{r.employee.name}</p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <Badge size="sm" variant="neutral">{a.hadirDays} hari hadir</Badge>
                        {a.liburDays > 0 && <Badge size="sm" variant="neutral">{a.liburDays} libur</Badge>}
                        <Badge size="sm" variant="info">{fmtHM(a.totalWorkedMinutes)}</Badge>
                        {a.overtimeBlocks30Min > 0 && <Badge size="sm" variant="warning">lembur {a.overtimeBlocks30Min} blok</Badge>}
                        {r.needsClarification.length > 0 && <Badge size="sm" variant="danger">perlu klarifikasi</Badge>}
                      </div>
                    </div>
                    <p className={`font-heading font-bold text-base shrink-0 ${r.payroll.netPay < 0 ? 'text-red-500' : 'text-accent-600 dark:text-accent-400'}`}>{formatRupiah(r.payroll.netPay)}</p>
                  </div>
                </button>
              );
            })}

            {status === 'ready' && (closeBlockers.length > 0 ? (
              <Card className="space-y-1.5" data-testid="close-blockers">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Belum bisa ditutup</p>
                {closeBlockers.map((b, i) => <p key={i} className="text-xs text-slate-500 dark:text-slate-400">• {b}</p>)}
              </Card>
            ) : (
              <Button size="full" icon={<Lock className="w-4 h-4" />} onClick={handleClose} disabled={busy}>Tutup Periode &amp; Bekukan Angka</Button>
            ))}
          </>
        )}
      </div>

      <Modal isOpen={!!selected} onClose={() => { setSelectedId(null); setShareOpen(false); setEditDeduction(null); }} sheet size="lg" maxHeight title={selected ? selected.employee.name : ''}>
        {selected && (
          <div className="p-5 text-sm">
            <PayrollReport
              report={reportOf(selected)}
              isLocked={isLocked} formatRupiah={formatRupiah}
              notice={selected.needsClarification.length > 0 && (
                <div className="rounded-xl bg-red-50 dark:bg-red-500/10 p-3 space-y-2" data-testid="klarifikasi-box">
                  <p className="text-xs font-bold text-red-600 dark:text-red-400">Perlu klarifikasi — hari ini belum dibayar sampai diputuskan:</p>
                  {selected.needsClarification.map(d => (
                    <div key={d.date} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700 dark:text-slate-200 min-w-0"><b>{fmtDay(d.date)}</b> bolong jam {d.stuckBolongTime}, belum ada masuk-lagi{hasPulang(selected.employee.id, d.date) ? ' tapi sudah ada jam pulang' : ''}</span>
                      {!isLocked && <Button size="xs" className="shrink-0" onClick={() => setEditDate(d.date)} data-testid="selesaikan">Selesaikan</Button>}
                    </div>
                  ))}
                  <p className="text-xs text-slate-500 dark:text-slate-400">Bolong tanpa masuk-lagi otomatis jadi jam pulang setelah jam 21:00. Kalau sudah ada jam pulang padahal bolong belum kembali, harus diputuskan lewat Selesaikan.</p>
                </div>
              )}
              dayFlags={(date) => dayFlags(selected.employee.id, date)}
              onEditDay={setEditDate} onEditDeduction={handleEditDeduction} onDeleteItem={handleDeleteItem}
              canEditOpening={!!period.monthKey && !isLocked} openingForm={openingForm} onOpeningChange={setOpeningForm} onSaveOpening={handleSaveOpening}
              busy={busy} onShare={() => setShareOpen(true)}
            />
          </div>
        )}
      </Modal>

      {selected && editDate && (
        <AttendanceEditSheet
          isOpen onClose={() => setEditDate(null)} employee={selected.employee} date={editDate}
          initial={summarizeDay((data.prepared?.logs || []).filter(l => l.employeeId === selected.employee.id && l.date === editDate))}
          hasOverride={data.overrideKeys.has(`${selected.employee.id}|${editDate}`)} onSaved={data.reload}
        />
      )}

      {selected && editDeduction && (
        <QuickAdjustmentSheet isOpen kind="potongan" canApprove editing={editDeduction} onClose={() => setEditDeduction(null)} />
      )}

      <PayslipShareSheet isOpen={!!selected && shareOpen} onClose={() => setShareOpen(false)} onShare={handleSharePdf}
        hasAttachment={Boolean(selected && reportOf(selected).attachments)} />
    </div>
  );
}
