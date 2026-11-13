import { useState, Fragment } from 'react';
import { ChevronRight, ChevronDown, Pencil, Trash2, Lock } from 'lucide-react';
import { Modal, EditedMark } from '../../components/ui';
import { fmtDay } from './payrollReport';
import { detailSubRows, fmtNum } from './additionDetail';

/**
 * DailyDetailSheet — Rincian Harian periode BULANAN, dibuka lewat tombol "Rincian Harian" di PayrollReport.
 * Tabelnya sama dengan tabel di slip PDF: Tanggal & Jam | Keterangan | Pemasukan (+) | Pengeluaran (-) | Bersih,
 * ditutup baris "Total harian". Bersih = pemasukan - pengeluaran hari itu (angka dari buildPayrollReport, bukan
 * hitungan baru). Saldo awal bulan bukan transaksi harian, jadi tidak ikut di Bersih/Total harian.
 *
 * Aksi owner (ubah absen, ubah/hapus catatan) tetap ada seperti di tampilan lama; `readOnly` (Gaji Saya) dan periode
 * tertutup menyembunyikannya. Sheet dirender SEJAJAR dengan modal detail (bukan di dalamnya) oleh PayrollView/MyPayroll,
 * supaya swipe-turun dan lapisan Back-nya berdiri sendiri.
 */

// Tanggal & Jam | isi (Keterangan + Pemasukan + Pengeluaran) | Bersih
const OUTER = 'grid grid-cols-[3.4rem_1fr_4rem]';
const INNER = 'grid grid-cols-[1fr_3.7rem_3.7rem]';
const CELL = 'px-1.5 py-1.5 border-l border-slate-100 dark:border-slate-800 first:border-l-0';

// Angka tanpa "Rp" (judul kolom sudah jelas); 0 = strip. Plus hijau, minus merah.
const Amount = ({ n, tone }) => (n
  ? <div className={`${CELL} text-right tabular-nums ${tone}`}>{fmtNum(n)}</div>
  : <div className={`${CELL} text-right text-slate-300 dark:text-slate-600`}>-</div>);

const Net = ({ n, bold = true }) => (
  <div className={`px-1.5 py-1.5 text-right tabular-nums ${bold ? 'font-bold' : ''} ${n < 0 ? 'text-red-500' : n === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-800 dark:text-slate-100'}`}>
    {n === 0 ? '-' : `${n < 0 ? '-' : ''}${fmtNum(Math.abs(n))}`}
  </div>
);

export default function DailyDetailSheet({
  isOpen, onClose, subtitle, report, isLocked, readOnly = false,
  dayFlags = () => ({}), onEditDay, onEditDeduction, onDeleteItem,
}) {
  const [openDetail, setOpenDetail] = useState(() => new Set());   // baris Tambahan (Ongkir / Potong Ayam) yang rinciannya terbuka
  const toggleDetail = (key) => setOpenDetail((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const canEdit = !isLocked && !readOnly;

  return (
    <Modal isOpen={isOpen} onClose={onClose} sheet size="lg" maxHeight title="Rincian Harian">
      {report && (
        <div className="px-3 pb-6 text-xs" data-testid="daily-sheet">
          {subtitle && <p className="px-2 pb-2 text-slate-500 dark:text-slate-400">{subtitle}</p>}
          {report.days.length === 0 ? (
            <p className="px-2 py-6 text-center text-slate-400">Tidak ada absensi pada periode ini.</p>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className={`${OUTER} bg-slate-50 dark:bg-slate-800/60 text-[10px] leading-tight font-semibold text-slate-500 dark:text-slate-400`}>
                <div className="px-1.5 py-1.5">Tanggal &amp; Jam</div>
                <div className={`${INNER}`}>
                  <div className="px-1.5 py-1.5">Keterangan</div>
                  <div className={`${CELL} text-right`}>Pemasukan (+)</div>
                  <div className={`${CELL} text-right`}>Pengeluaran (-)</div>
                </div>
                <div className="px-1.5 py-1.5 text-right">Bersih</div>
              </div>

              {report.days.map((d) => {
                const flags = d.row ? dayFlags(d.date) : { auto: false, edited: false };
                return (
                  <div key={d.date} data-testid="day-row" className={`${OUTER} border-t border-slate-200 dark:border-slate-700`}>
                    <div className="px-1.5 py-1.5 min-w-0">
                      <b className="text-slate-800 dark:text-slate-100">{fmtDay(d.date)}</b>
                      {d.timeRange && <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{d.timeRange}</p>}
                      {flags.auto && <p className="text-[10px] text-slate-400 leading-tight">otomatis</p>}
                      {flags.edited && <EditedMark size="sm" label="Diedit owner" data-testid="day-diedit" />}
                      {d.row?.effectiveFromBolong && <p className="text-[10px] text-amber-600 leading-tight">bolong dianggap pulang</p>}
                      {d.row && canEdit && (
                        <button type="button" aria-label={`Edit absen ${fmtDay(d.date)}`} data-testid="edit-day" onClick={() => onEditDay(d.date)}
                          className="mt-0.5 p-0.5 text-slate-400 hover:text-accent-600"><Pencil className="w-3 h-3" /></button>
                      )}
                    </div>

                    <div>
                      {d.lines.map((l, i) => {
                        const subs = detailSubRows(l.item?.detail);
                        const expanded = subs.length > 0 && openDetail.has(l.key);
                        return (
                          <Fragment key={l.key}>
                            <div data-testid={l.item ? 'adj-row' : undefined} className={`${INNER} ${i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''} border-l border-slate-100 dark:border-slate-800`}>
                              <div className="px-1.5 py-1.5 min-w-0 text-slate-600 dark:text-slate-300">
                                {subs.length > 0 ? (
                                  <button type="button" aria-expanded={expanded} data-testid="detail-toggle" onClick={() => toggleDetail(l.key)}
                                    className="inline-flex items-start gap-0.5 text-left">
                                    {expanded ? <ChevronDown className="w-3.5 h-3.5 mt-px shrink-0 text-accent-600" /> : <ChevronRight className="w-3.5 h-3.5 mt-px shrink-0 text-accent-600" />}
                                    <span>{l.label}</span>
                                  </button>
                                ) : l.label}
                                {l.item && canEdit && l.item.kind === 'potongan' && (
                                  <button type="button" aria-label="Ubah potongan" data-testid="edit-potongan" onClick={() => onEditDeduction(l.item)} className="ml-1 p-0.5 align-middle text-slate-400 hover:text-accent-600"><Pencil className="w-3 h-3" /></button>
                                )}
                                {l.item && canEdit && (
                                  <button type="button" aria-label="Hapus" onClick={() => onDeleteItem(l.item.kind, l.item)} className="p-0.5 align-middle text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                )}
                              </div>
                              <Amount n={l.plus} tone="text-emerald-600" />
                              <Amount n={l.minus} tone="text-red-500" />
                            </div>
                            {expanded && subs.map((r, k) => (
                              <div key={k} data-testid="detail-row" className={`${INNER} border-l border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500`}>
                                <span className="min-w-0 truncate pl-5 pr-1.5 py-0.5">{r.text}</span>
                                <span className="text-right tabular-nums px-1.5 py-0.5">{fmtNum(r.amount)}</span>
                                <span />
                              </div>
                            ))}
                          </Fragment>
                        );
                      })}
                    </div>

                    <div className="border-l border-slate-100 dark:border-slate-800" data-testid="day-net"><Net n={d.net} /></div>
                  </div>
                );
              })}

              <div className={`${OUTER} border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-bold`} data-testid="day-total">
                <div className="px-1.5 py-1.5 col-span-1" />
                <div className={INNER}>
                  <div className="px-1.5 py-1.5">Total harian</div>
                  <Amount n={report.dayTotals.plus} tone="text-emerald-600" />
                  <Amount n={report.dayTotals.minus} tone="text-red-500" />
                </div>
                <Net n={report.dayTotals.net} />
              </div>
            </div>
          )}
          <p className="px-2 pt-2 text-[10px] text-slate-400">Angka dalam rupiah. Bersih = pemasukan − pengeluaran hari itu. Saldo awal bulan tidak ikut di sini.</p>
          {isLocked && !readOnly && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 mt-2 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 shrink-0" /> Periode ditutup, jadi tambahan dan potongan tidak bisa diubah.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
