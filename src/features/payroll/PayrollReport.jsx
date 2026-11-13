import { useState, Fragment } from 'react';
import { ChevronRight, ChevronDown, Pencil, Trash2, Share2, Lock } from 'lucide-react';
import { Badge, Button, EditedMark, NominalInput, PillTabs } from '../../components/ui';
import { fmtDay, fmtHM, STATUS_LABEL, STATUS_VARIANT, summaryIncomeLabel } from './payrollReport';
import { detailSubRows } from './additionDetail';

/**
 * PayrollReport — isi detail gaji satu karyawan, untuk periode MINGGUAN dan BULANAN (tampilan sama).
 * Ringkas dulu, rinciannya dibuka sendiri-sendiri (tanpa tab):
 *  - Total Pendapatan, lalu Pengurangan (Kasbon, Potongan). Saldo awal ikut ke sisi yang benar:
 *    toko berutang = "Sisa Bulan Lalu (Kurang Bayar)" di Pendapatan; karyawan berutang = "Hutang Bulan Lalu" di Pengurangan.
 *  - Saldo Awal Bulan (khusus bulanan): pilih JENIS (toko / karyawan berutang) + nominal positif, tanpa tanda minus.
 *  - Rincian Harian: tabel Keterangan | Pemasukan (+) | Pengeluaran (-), dikelompokkan per tanggal beserta jam kerja.
 *    Potongan bisa diubah (membuka form Potongan Catat Cepat) atau dihapus; Tambahan hanya dihapus.
 * Data berasal dari buildPayrollReport (payrollReport.js).
 *
 * BULANAN dengan `onOpenDays` (dipakai PayrollView dan MyPayroll) memakai susunan ringkasan seperti slip PDF
 * (permintaan pemilik 13 Nov 2026): PENDAPATAN, Total Pendapatan, POTONGAN, Total Potongan, Saldo Awal Bulan (bisa dibuka),
 * lalu GAJI BERSIH di PALING BAWAH. Rincian harian TIDAK dibuka di tempat: tombol "Rincian Harian" memanggil `onOpenDays`
 * dan induk membuka DailyDetailSheet (tabel gaya PDF + kolom Bersih per hari). Tanpa `onOpenDays` (mingguan) susunan lama
 * di bawah ini tetap dipakai.
 *
 * `readOnly` = tampilan karyawan (Gaji Saya, MyPayroll): susunan SAMA dengan owner, tapi tanpa tombol ubah/hapus/Bagikan,
 * dan bagian saldo bernama "Sisa Saldo" (+ = toko berutang / belum diambil, - = hutang ke toko).
 */

const COLS = 'grid grid-cols-[1fr_5.25rem_5.25rem] gap-1.5';
// Plus = toko berutang (menambah gaji); Minus = karyawan berutang (mengurangi gaji).
const KINDS = [
  { value: 'toko', label: '+ Plus', testId: 'saldo-toko' },
  { value: 'karyawan', label: '− Minus', testId: 'saldo-karyawan' },
];

function Section({ title, value, valueClass = '', open, onToggle, testId, children }) {
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <button type="button" onClick={onToggle} aria-expanded={open} data-testid={testId}
        className="w-full flex items-center gap-2 py-3.5 text-left active:opacity-70">
        <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        <span className="font-bold text-slate-800 dark:text-slate-100 shrink-0">{title}</span>
        <span className={`ml-auto font-bold shrink-0 ${valueClass}`}>{value}</span>
      </button>
      {open && <div className="pb-3 pl-6">{children}</div>}
    </div>
  );
}

const Row = ({ k, v, dim }) => (
  <div className={`flex justify-between gap-3 py-1 ${dim ? 'opacity-50' : ''}`}>
    <span className="text-slate-500 dark:text-slate-400">{k}</span>
    <span className="font-bold text-slate-800 dark:text-slate-100 shrink-0">{v}</span>
  </div>
);

// Bagian Saldo Awal Bulan (bulanan): owner mengisi JENIS + nominal; periode tertutup / karyawan hanya melihat.
function SaldoSection({ report, readOnly, formatRupiah, open, onToggle, canEditOpening, openingForm, onOpeningChange, onSaveOpening, busy }) {
  const { opening } = report;
  const openingValue = opening.kind ? `${opening.kind === 'toko' ? '+' : '-'}${formatRupiah(opening.amount)}` : formatRupiah(0);
  return (
    <Section title={readOnly ? 'Sisa Saldo' : 'Saldo Awal Bulan'} value={openingValue} valueClass={opening.kind === 'toko' ? 'text-emerald-600' : opening.kind === 'karyawan' ? 'text-red-500' : ''}
      open={open} onToggle={onToggle} testId="sec-saldo">
      {canEditOpening ? (
        <div className="space-y-2.5 pt-1">
          <PillTabs size="sm" value={openingForm.kind} onChange={(kind) => onOpeningChange({ ...openingForm, kind })} options={KINDS} />
          <div className="flex gap-2">
            <div className="flex-1"><NominalInput title="Saldo Awal Bulan" placeholder="0" value={openingForm.amount} onChange={(e) => onOpeningChange({ ...openingForm, amount: e.target.value })} /></div>
            <Button variant="secondary" onClick={onSaveOpening} disabled={busy}>Simpan</Button>
          </div>
        </div>
      ) : (
        <div className="text-sm"><Row k={opening.kind === 'toko' ? (readOnly ? 'Toko berutang (belum diambil)' : 'Toko berutang') : opening.kind === 'karyawan' ? (readOnly ? 'Hutang ke toko' : 'Karyawan berutang') : (readOnly ? 'Tidak ada saldo' : 'Tidak ada saldo awal')} v={opening.kind ? formatRupiah(opening.amount) : formatRupiah(0)} dim={!opening.kind} /></div>
      )}
    </Section>
  );
}

// Satu blok ringkasan (PENDAPATAN / POTONGAN): judul kecil huruf kapital yang bisa dilipat, baris nama + nominal.
function SummaryBlock({ title, open, onToggle, testId, children }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} data-testid={testId} className="w-full flex items-center gap-1.5 pt-3 pb-1.5 text-left active:opacity-70">
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        <span className="text-[11px] font-bold tracking-wide text-slate-400 dark:text-slate-500">{title}</span>
      </button>
      {open && <div className="text-sm pl-5">{children}</div>}
    </div>
  );
}

const TotalRow = ({ label, value, testId }) => (
  <div className="flex justify-between gap-3 border-t border-slate-200 dark:border-slate-700 mt-1.5 pt-2.5 pb-1 font-bold text-slate-800 dark:text-slate-100" data-testid={testId}>
    <span>{label}</span><span>{value}</span>
  </div>
);

/** Ringkasan BULANAN gaya slip PDF. Baris bernilai 0 disembunyikan (kecuali Upah), sama dengan PDF. */
function MonthlySummary({
  report, formatRupiah, readOnly, notice, onOpenDays, onShare,
  canEditOpening, openingForm, onOpeningChange, onSaveOpening, busy,
}) {
  const [open, setOpen] = useState({ pend: true, cut: true, sal: false });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const incomeRows = report.income.filter((r, i) => r.amount !== 0 || i === 0);
  const cutRows = report.cuts.filter((r) => r.amount !== 0);
  return (
    <div className="space-y-1" data-testid="monthly-summary">
      {notice}
      <SummaryBlock title="PENDAPATAN" open={open.pend} onToggle={() => toggle('pend')} testId="sec-pendapatan">
        {incomeRows.map((r) => <Row key={r.key} k={summaryIncomeLabel(report, r)} v={formatRupiah(r.amount)} />)}
      </SummaryBlock>
      <TotalRow label="Total Pendapatan" value={formatRupiah(report.totalIncome)} testId="total-pendapatan" />

      <SummaryBlock title="POTONGAN" open={open.cut} onToggle={() => toggle('cut')} testId="sec-pengurangan">
        {cutRows.length === 0
          ? <Row k="Tidak ada potongan" v={formatRupiah(0)} dim />
          : cutRows.map((r) => <Row key={r.key} k={r.label} v={formatRupiah(-r.amount)} />)}
      </SummaryBlock>
      <TotalRow label="Total Potongan" value={formatRupiah(-report.totalDeductions)} testId="total-potongan" />

      <SaldoSection report={report} readOnly={readOnly} formatRupiah={formatRupiah} open={open.sal} onToggle={() => toggle('sal')}
        canEditOpening={canEditOpening} openingForm={openingForm} onOpeningChange={onOpeningChange} onSaveOpening={onSaveOpening} busy={busy} />

      <div className="flex justify-between items-baseline gap-3 border-t-2 border-slate-800 dark:border-slate-200 pt-3 !mt-2" data-testid="gaji-bersih">
        <span className="font-bold text-base text-slate-800 dark:text-slate-100 tracking-wide">GAJI BERSIH</span>
        <span className={`font-heading font-bold text-xl ${report.net < 0 ? 'text-red-500' : 'text-accent-600 dark:text-accent-400'}`}>{formatRupiah(report.net)}</span>
      </div>

      <div className="flex gap-2 pt-3">
        <Button variant="secondary" size="full" onClick={onOpenDays} data-testid="open-days">Rincian Harian</Button>
        {!readOnly && <Button variant="secondary" size="full" icon={<Share2 className="w-4 h-4" />} onClick={onShare} data-testid="share-pdf">Bagikan PDF</Button>}
      </div>
    </div>
  );
}

export default function PayrollReport({
  report, isLocked, formatRupiah, dayFlags, notice,
  onEditDay, onEditDeduction, onDeleteItem,
  canEditOpening, openingForm, onOpeningChange, onSaveOpening, busy, onShare, readOnly = false,
  onOpenDays,         // bulanan: membuka DailyDetailSheet (induk yang merender sheet-nya); tanpa ini susunan lama dipakai
  initialOpen = {},   // bagian yang terbuka sejak awal (default semua tertutup; dipakai tes)
}) {
  const [open, setOpen] = useState({ pend: false, cut: false, sal: false, hari: false, ...initialOpen });
  const [openDetail, setOpenDetail] = useState(() => new Set());   // baris Tambahan (Ongkir / Potong Ayam) yang rinciannya terbuka
  const toggleDetail = (key) => setOpenDetail((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const money = (n, tone) => (n
    ? <span className={`text-right font-medium ${tone}`}>{formatRupiah(n)}</span>
    : <span className="text-right text-slate-300 dark:text-slate-600">-</span>);

  if (report.withOpening && onOpenDays) {
    return (
      <MonthlySummary report={report} formatRupiah={formatRupiah} readOnly={readOnly} notice={notice} onOpenDays={onOpenDays} onShare={onShare}
        canEditOpening={canEditOpening} openingForm={openingForm} onOpeningChange={onOpeningChange} onSaveOpening={onSaveOpening} busy={busy} />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-baseline gap-3" data-testid="gaji-bersih">
        <span className="font-bold text-base text-slate-800 dark:text-slate-100">Gaji Bersih</span>
        <span className={`font-heading font-bold text-xl ${report.net < 0 ? 'text-red-500' : 'text-accent-600 dark:text-accent-400'}`}>{formatRupiah(report.net)}</span>
      </div>

      {notice}

      <div>
        <Section title="Total Pendapatan" value={formatRupiah(report.totalIncome)} open={open.pend} onToggle={() => toggle('pend')} testId="sec-pendapatan">
          <div className="text-sm">{report.income.map((r) => <Row key={r.key} k={r.label} v={formatRupiah(r.amount)} dim={r.amount === 0} />)}</div>
        </Section>

        <Section title="Pengurangan" value={formatRupiah(-report.totalDeductions)} valueClass={report.totalDeductions > 0 ? 'text-red-500' : ''}
          open={open.cut} onToggle={() => toggle('cut')} testId="sec-pengurangan">
          <div className="text-sm">{report.cuts.map((r) => <Row key={r.key} k={r.label} v={formatRupiah(-r.amount)} dim={r.amount === 0} />)}</div>
        </Section>

        {report.withOpening && (
          <SaldoSection report={report} readOnly={readOnly} formatRupiah={formatRupiah} open={open.sal} onToggle={() => toggle('sal')}
            canEditOpening={canEditOpening} openingForm={openingForm} onOpeningChange={onOpeningChange} onSaveOpening={onSaveOpening} busy={busy} />
        )}

        <Section title="Rincian Harian" value={fmtHM(report.workedMinutes)} open={open.hari} onToggle={() => toggle('hari')} testId="sec-harian">
          {report.days.length === 0 ? <p className="text-xs text-slate-400 py-1">Tidak ada absensi pada periode ini.</p> : (
            <div className="text-xs">
              <div className={`${COLS} px-2 py-1.5 rounded-t-lg bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-400`}>
                <span>Keterangan</span><span className="text-right">Pemasukan (+)</span><span className="text-right">Pengeluaran (-)</span>
              </div>
              {report.days.map((d) => {
                const flags = d.row ? dayFlags(d.date) : { auto: false, edited: false };
                return (
                  <div key={d.date} data-testid="day-row" className="border-t border-slate-100 dark:border-slate-800 pb-1.5">
                    <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                      <b className="text-slate-700 dark:text-slate-200">{fmtDay(d.date)}</b>
                      {d.timeRange && <span className="text-slate-400">{d.timeRange}</span>}
                      {flags.auto && <span className="text-slate-400">otomatis</span>}
                      {flags.edited && <EditedMark size="sm" label="Diedit owner" data-testid="day-diedit" />}
                      {d.row?.effectiveFromBolong && <span className="text-amber-600">bolong dianggap pulang</span>}
                      {d.row && <Badge size="sm" variant={STATUS_VARIANT[d.row.status]}>{STATUS_LABEL[d.row.status]}</Badge>}
                      {d.row && !isLocked && !readOnly && (
                        <button type="button" aria-label={`Edit absen ${fmtDay(d.date)}`} data-testid="edit-day" onClick={() => onEditDay(d.date)} className="ml-auto p-1 text-slate-400 hover:text-accent-600"><Pencil className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    {d.lines.map((l) => {
                      const subs = detailSubRows(l.item?.detail);
                      const expanded = subs.length > 0 && openDetail.has(l.key);
                      return (
                        <Fragment key={l.key}>
                          <div data-testid={l.item ? 'adj-row' : undefined} className={`${COLS} px-2 py-0.5 items-center`}>
                            <span className="min-w-0 text-slate-500 dark:text-slate-400">
                              {subs.length > 0 ? (
                                <button type="button" aria-expanded={expanded} data-testid="detail-toggle" onClick={() => toggleDetail(l.key)}
                                  className="inline-flex items-center gap-1 text-left align-middle">
                                  {expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-accent-600" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-accent-600" />}
                                  <span>{l.label}</span>
                                </button>
                              ) : l.label}
                              {l.item && !isLocked && !readOnly && l.item.kind === 'potongan' && (
                                <button type="button" aria-label="Ubah potongan" data-testid="edit-potongan" onClick={() => onEditDeduction(l.item)} className="ml-1 p-0.5 align-middle text-slate-400 hover:text-accent-600"><Pencil className="w-3 h-3" /></button>
                              )}
                              {l.item && !isLocked && !readOnly && (
                                <button type="button" aria-label="Hapus" onClick={() => onDeleteItem(l.item.kind, l.item)} className="p-0.5 align-middle text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                              )}
                            </span>
                            {money(l.plus, 'text-emerald-600')}
                            {money(l.minus, 'text-red-500')}
                          </div>
                          {expanded && subs.map((r, i) => (
                            <div key={i} data-testid="detail-row" className={`${COLS} pl-6 pr-2 text-[11px] text-slate-400 dark:text-slate-500`}>
                              <span className="min-w-0 truncate">{r.text}</span>
                              <span className="text-right tabular-nums">{formatRupiah(r.amount)}</span>
                              <span />
                            </div>
                          ))}
                        </Fragment>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {isLocked && !readOnly && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 mt-2 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 shrink-0" /> Periode ditutup, jadi tambahan dan potongan tidak bisa diubah.</p>
          )}
        </Section>
      </div>

      {!readOnly && <Button variant="secondary" size="full" icon={<Share2 className="w-4 h-4" />} onClick={onShare} data-testid="share-pdf">Bagikan PDF</Button>}
    </div>
  );
}
