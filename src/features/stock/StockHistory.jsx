import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, CalendarDays, AlertTriangle, ShoppingCart } from 'lucide-react';
import { Card, Badge, Alert, Button, EmptyState, Modal } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { useStockHistory } from '../../hook/useStockData';
import { useOpnameHistory } from '../../hook/useOpname';
import { showToast } from '../../lib/toast';
import { shiftMonthKey, monthLabel, dayLabel as fullDayLabel } from '../reports/reportsMath';
import { daySummary, dayItems, filterDayGroups, dayLabel, formatQty, businessDate, STATUS_META } from './stockMath';
import { calendarCells, monthOf, opnameGroups, opnameValue, itemsWithoutPrice } from './opnameMath';
import Switch from './Switch';
import { useShopping, ShopCheck, ShopExtras, ShopBar } from './ShoppingList';

const time = (iso) => { try { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.'); } catch { return ''; } };
const LBL = 'text-slate-400 dark:text-slate-500';
const SECTION = 'text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500 mb-2';

/** Isi satu hari: tiap item beserta jumlah dan statusnya, dikelompokkan per kategori. Hanya baca. */
const FILTERS = [
  { key: 'semua', label: 'semua', variant: 'neutral' },
  { key: 'habis', label: 'habis', variant: 'danger' },
  { key: 'menipis', label: 'menipis', variant: 'warning' },
  { key: 'aman', label: 'aman', variant: 'success' },
];

/** `counts` = isian hari itu ([{ item_id, qty }]); null = masih dimuat. */
function DaySheet({ day, counts, master, onClose }) {
  const [filter, setFilter] = useState('semua');   // DaySheet dipasang ulang (key) tiap hari dibuka, jadi selalu mulai dari Semua
  const { groups: all, kosong } = useMemo(() => (day && counts ? dayItems(master, counts) : { groups: [], kosong: 0 }), [day, counts, master]);
  const summary = useMemo(() => (counts ? daySummary(master, counts) : { habis: 0, menipis: 0, aman: 0 }), [counts, master]);
  const groups = useMemo(() => filterDayGroups(all, filter), [all, filter]);
  const shop = useShopping(all, dayLabel(businessDate()));   // daftar belanja dicentang langsung di daftar ini (tanpa popup baru)
  return (
    <Modal isOpen={!!day} onClose={onClose} sheet size="lg" maxHeight title={day ? fullDayLabel(day.day) : ''} dirty={shop.dirty}>
      {day && (
        <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="stok-riwayat-detail">
          <p className="text-xs text-slate-500 dark:text-slate-400">Disimpan {day.saved_by ? `oleh ${day.saved_by} ` : ''}pukul {time(day.saved_at)}</p>
          {!counts && <p className="text-center text-sm text-slate-400 py-6">Memuat...</p>}
          {counts && (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring menurut status">
                {FILTERS.map((f) => {
                  const n = f.key === 'semua' ? summary.habis + summary.menipis + summary.aman : summary[f.key];
                  const active = filter === f.key;
                  return (
                    <button key={f.key} type="button" aria-pressed={active} data-testid={`stok-filter-${f.key}`} onClick={() => setFilter(f.key)} className="rounded-full active:scale-95 transition-transform">
                      <Badge variant={f.variant} size="md" className={active ? 'ring-2 ring-current' : 'opacity-60'}>{n} {f.label}</Badge>
                    </button>
                  );
                })}
              </div>
              {!shop.on && all.length > 0 && (
                <Button variant="secondary" size="full" onClick={shop.start} icon={<ShoppingCart className="w-4 h-4" />} data-testid="stok-buat-belanja">Buat daftar belanja</Button>
              )}
              {shop.on && (
                <div className="flex items-center justify-between gap-3" data-testid="belanja-mode">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Centang yang mau dibeli. Sisa stoknya ikut ke teks WhatsApp.</p>
                  <Button variant="secondary" size="xs" onClick={shop.stop} data-testid="belanja-selesai">Selesai</Button>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.category.id}>
                  <p className="text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">{g.category.name.toUpperCase()}</p>
                  <Card padding="none" className="divide-y divide-slate-100 dark:divide-slate-800">
                    {g.rows.map((r) => (
                      <div key={r.item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          {shop.on && <ShopCheck checked={shop.isOn(r.item.id)} onToggle={() => shop.toggle(r.item.id)} label={`Beli ${r.item.name}`} testId={`belanja-cek-${r.item.id}`} />}
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0 truncate">{r.item.name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{formatQty(r.qty)}<span className="text-xs font-semibold text-slate-400 dark:text-slate-500"> {r.item.unit}</span></p>
                          <Badge variant={STATUS_META[r.status].badge}>{STATUS_META[r.status].label}</Badge>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              ))}
              {groups.length === 0 && <p className="text-center text-sm text-slate-400 py-6">{filter === 'semua' ? 'Tidak ada angka yang tersimpan pada hari ini.' : `Tidak ada item yang ${FILTERS.find((f) => f.key === filter).label} pada hari ini.`}</p>}
              {filter === 'semua' && kosong > 0 && groups.length > 0 && <p className="text-xs text-center text-slate-400 dark:text-slate-500">{kosong} item lain tidak diisi hari itu.</p>}
              {shop.on && <ShopExtras shop={shop} />}
              {shop.on && <ShopBar shop={shop} />}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/** "Pilih hari lain": kalender bulanan, titik = ada hasil tersimpan. Hanya hari yang punya hasil yang bisa diketuk. */
function PickDaySheet({ open, onClose, days, onPick }) {
  const saved = useMemo(() => new Set(days.map((d) => d.day)), [days]);
  const [ym, setYm] = useState(() => monthOf(days[0]?.day || businessDate()));
  const cells = useMemo(() => calendarCells(ym), [ym]);
  const oldest = days.length ? monthOf(days[days.length - 1].day) : ym;
  const newest = monthOf(businessDate());
  return (
    <Modal isOpen={open} onClose={onClose} sheet size="md" maxHeight title="Pilih hari">
      <div className="p-5 pt-1 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="stok-pilih-hari">
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Bulan sebelumnya" disabled={ym <= oldest} onClick={() => setYm(shiftMonthKey(ym, -1))} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50">{monthLabel(ym)}</p>
          <button type="button" aria-label="Bulan berikutnya" disabled={ym >= newest} onClick={() => setYm(shiftMonthKey(ym, 1))} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((h) => <span key={h} className={`text-[10px] font-bold ${LBL}`}>{h}</span>)}
          {cells.map((d, i) => (d === null ? <span key={`k${i}`} /> : (
            <button
              key={d} type="button" disabled={!saved.has(d)} onClick={() => onPick(d)} data-testid={`stok-hari-${d}`}
              className={`relative aspect-square rounded-xl text-sm font-semibold ${saved.has(d) ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 active:scale-95' : 'text-slate-300 dark:text-slate-600'}`}
            >
              {Number(d.slice(8))}
              {saved.has(d) && <span className="absolute bottom-1 left-1/2 -ml-0.5 w-1 h-1 rounded-full bg-accent-500" />}
            </button>
          )))}
        </div>
        <p className={`text-xs ${LBL}`}>Titik = ada hasil stok yang tersimpan. Ketuk tanggal untuk melihat isinya.</p>
      </div>
    </Modal>
  );
}

/** Detail satu hitungan penuh: nilai total, lalu tiap item (jumlah × harga) per kategori. */
function OpnameSheet({ month, master, items, loadDetail, onClose }) {
  const [counts, setCounts] = useState(null);
  const [err, setErr] = useState('');
  const day = month?.row?.day;
  useEffect(() => {
    if (!day) return undefined;
    let alive = true;
    setCounts(null); setErr('');
    loadDetail(day).then((c) => { if (alive) setCounts(c); }, (e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [day, loadDetail]);
  const { total, missing } = useMemo(() => (counts ? opnameValue(counts, items) : { total: 0, missing: 0 }), [counts, items]);
  const groups = useMemo(() => (counts ? opnameGroups(master, counts) : []), [counts, master]);
  return (
    <Modal isOpen={!!month} onClose={onClose} sheet size="lg" maxHeight title={month ? `Stok Opname ${monthLabel(month.ym)}` : ''}>
      {month && (
        <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="stok-opname-detail">
          {err && <Alert type="banner" variant="error">{err}</Alert>}
          {!counts && !err && <p className="text-center text-sm text-slate-400 py-6">Memuat...</p>}
          {counts && (
            <>
              <Card padding="md">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Nilai stok akhir</span>
                  <span className="font-heading text-lg font-bold text-slate-900 dark:text-slate-50" data-testid="opname-total">Rp {total.toLocaleString('id-ID')}</span>
                </div>
                <p className={`text-xs mt-1 ${LBL}`}>Dihitung {fullDayLabel(month.row.day)}{month.row.saved_by ? ` · oleh ${month.row.saved_by}` : ''} · jadi stok awal {monthLabel(shiftMonthKey(month.ym, 1))}</p>
              </Card>
              {missing > 0 && <Alert type="banner" variant="warning" className="!text-left !font-medium">{missing} item punya stok tapi belum ada harga modal, jadi dihitung Rp 0. Isi di tab Kelola &gt; Harga modal.</Alert>}
              {groups.map((g) => (
                <div key={g.category.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500">{g.category.name.toUpperCase()}</p>
                    <p className={`text-xs font-semibold ${LBL}`}>Rp {g.subtotal.toLocaleString('id-ID')}</p>
                  </div>
                  <Card padding="none" className="divide-y divide-slate-100 dark:divide-slate-800">
                    {g.rows.map((r) => (
                      <div key={r.item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.item.name}</p>
                          <p className={`text-xs ${LBL}`}>{formatQty(r.qty)} {r.item.unit}{r.price !== null ? ` × Rp ${r.price.toLocaleString('id-ID')}` : ''}</p>
                        </div>
                        {r.price === null && r.qty > 0
                          ? <Badge variant="danger">Belum ada harga</Badge>
                          : <p className="text-sm font-bold text-slate-900 dark:text-slate-50 shrink-0">Rp {r.value.toLocaleString('id-ID')}</p>}
                      </div>
                    ))}
                  </Card>
                </div>
              ))}
              <p className={`text-xs text-center ${LBL}`}>Harga yang dipakai = harga modal saat dihitung; item yang belum punya harga saat itu mengikuti harga sekarang.</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

const toastError = (e) => showToast(e?.message || 'Terjadi kesalahan', { type: 'error' });

/** Bagian Stok Opname: saklar mode opname + 3 bulan terakhir + pilih bulan lain. */
function OpnameSection({ stock, master }) {
  const { triggerConfirm } = useAppContext();
  const items = useMemo(() => master.flatMap((c) => c.items), [master]);
  const hist = useOpnameHistory({ enabled: true, items, today: stock.today });
  const [open, setOpen] = useState(null);       // { ym, row }
  const [picker, setPicker] = useState(false);
  const unpriced = itemsWithoutPrice(items);

  const toggle = () => {
    if (stock.opname) { stock.setOpname(false).then(() => showToast('Mode stok opname dimatikan')).catch(toastError); return; }
    triggerConfirm(
      'Nyalakan mode stok opname? Semua item jadi wajib diisi staf. Hasil hari ini yang sudah disimpan dibuka kembali kalau belum hitungan penuh (Absen Pulang terkunci sampai dihitung ulang).',
      () => stock.setOpname(true).then(() => { showToast('Mode stok opname aktif. Semua item wajib diisi.'); hist.reload(); }).catch(toastError),
    );
  };

  return (
    <div data-testid="stok-opname">
      <p className={SECTION}>STOK OPNAME</p>
      <Card padding="md" className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50">Mode stok opname</p>
            <p className={`text-xs ${LBL}`}>{stock.opname ? 'Aktif: semua item wajib diisi staf sampai dimatikan.' : 'Mati. Nyalakan untuk mewajibkan semua item diisi staf.'}</p>
          </div>
          <Switch on={stock.opname} onToggle={toggle} label="Mode stok opname" testId="opname-saklar" />
        </div>
        {hist.error ? <Alert type="banner" variant="warning" className="!text-left !font-medium">{hist.error}</Alert> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800" data-testid="opname-bulan">
            {hist.months.map((m) => (m.row ? (
              <button key={m.ym} type="button" onClick={() => setOpen(m)} className="w-full text-left py-3 flex items-center justify-between gap-3 active:opacity-70" data-testid={`opname-${m.ym}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{monthLabel(m.ym)}</p>
                  <p className={`text-xs ${LBL}`}>Dihitung {dayLabel(m.row.day)}{m.row.saved_by ? ` · oleh ${m.row.saved_by}` : ''}{m.missing ? ` · ${m.missing} item tanpa harga` : ''}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-50">Rp {m.total.toLocaleString('id-ID')}</span>
                  <ChevronRight className={`w-4 h-4 ${LBL}`} />
                </div>
              </button>
            ) : (
              <div key={m.ym} className="py-3" data-testid={`opname-${m.ym}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{monthLabel(m.ym)}</p>
                  <span className={`text-sm ${LBL}`}>belum dihitung</span>
                </div>
                <p className={`text-xs ${LBL}`}>Belum ada hitungan penuh. Income Statement bulan ini tampil "Belum diisi".</p>
              </div>
            )))}
          </div>
        )}
        <Button variant="secondary" size="full" onClick={() => setPicker(true)} disabled={!hist.allMonths.length} icon={<CalendarDays className="w-4 h-4" />}>Pilih bulan lain</Button>
        {unpriced.length > 0 && (
          <p className="flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2" data-testid="opname-tanpa-harga">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {unpriced.length} item belum punya harga modal; nilai stok bisa lebih rendah dari aslinya. Isi di Kelola &gt; Harga modal.
          </p>
        )}
      </Card>

      <Modal isOpen={picker} onClose={() => setPicker(false)} sheet size="md" maxHeight title="Pilih bulan">
        <div className="p-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="opname-pilih-bulan">
          {hist.allMonths.map((m) => (
            <button key={m.ym} type="button" onClick={() => { setPicker(false); setOpen(m); }} className="w-full flex items-center justify-between py-3 border-t border-slate-100 dark:border-slate-800 first:border-0 text-left">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{monthLabel(m.ym)}</span>
              <span className={`text-xs ${LBL}`}>dihitung {dayLabel(m.row.day)}</span>
            </button>
          ))}
        </div>
      </Modal>
      <OpnameSheet key={open?.ym || 'tutup'} month={open} master={master} items={items} loadDetail={hist.loadDetail} onClose={() => setOpen(null)} />
    </div>
  );
}

/**
 * StockHistory — tab Riwayat (owner). Dua bagian:
 *  1. Riwayat Stok Belanja Harian: 3 hari terakhir (habis/menipis per hari), ketuk untuk isinya; "Pilih hari lain" membuka kalender
 *     untuk melacak hari yang lebih lama (berguna untuk menelusuri belanjaan).
 *  2. Stok Opname: saklar mode opname + nilai stok akhir 3 bulan terakhir (hitungan penuh paling akhir tiap bulan), "Pilih bulan lain".
 * `stock` = hasil useStockData (master, today, opname, setOpname).
 */
export default function StockHistory({ stock }) {
  const master = stock.master;
  const { rows, days, loading, error, reload, loadCounts } = useStockHistory(true);
  const [openDay, setOpenDay] = useState(null);
  const [extra, setExtra] = useState({});          // isian hari yang dibuka dari kalender (bukan 3 terbaru)
  const [picker, setPicker] = useState(false);
  const list = useMemo(() => rows.map((r) => ({ ...r, summary: daySummary(master, r.counts) })), [rows, master]);

  const open = (day) => {
    setOpenDay(day);
    if (!rows.some((r) => r.day === day) && !extra[day]) loadCounts(day).then((c) => setExtra((e) => ({ ...e, [day]: c })), toastError);
  };
  const dayMeta = days.find((d) => d.day === openDay) || null;
  const dayCounts = !openDay ? null : (rows.find((r) => r.day === openDay)?.counts ?? extra[openDay] ?? null);

  if (error) return <Alert type="banner" variant="error">{error}</Alert>;

  return (
    <div className="space-y-5" data-testid="stok-riwayat">
      <div>
        <p className={SECTION}>RIWAYAT STOK BELANJA HARIAN</p>
        {!list.length ? (
          loading
            ? <p className="text-center text-sm text-slate-400 py-8">Memuat riwayat...</p>
            : <EmptyState title="Belum ada riwayat" description="Hasil stok yang sudah disimpan akan muncul di sini." />
        ) : (
          <Card padding="md" className="space-y-1">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((r) => (
                <button key={r.day} type="button" onClick={() => open(r.day)} className="w-full text-left py-3 first:pt-0 active:opacity-70" data-testid={`stok-hari-baris-${r.day}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fullDayLabel(r.day)}</p>
                    <ChevronRight className={`w-4 h-4 ${LBL}`} />
                  </div>
                  <p className={`text-xs ${LBL}`}>{r.summary.habis + r.summary.menipis + r.summary.aman} item{r.saved_by ? ` · diisi ${r.saved_by}` : ''} · {time(r.saved_at)}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="danger">{r.summary.habis} habis</Badge>
                    <Badge variant="warning">{r.summary.menipis} menipis</Badge>
                  </div>
                </button>
              ))}
            </div>
            <Button variant="secondary" size="full" onClick={() => setPicker(true)} icon={<CalendarDays className="w-4 h-4" />} data-testid="stok-pilih-hari-btn">Pilih hari lain</Button>
          </Card>
        )}
      </div>

      <OpnameSection stock={stock} master={master} />

      <button type="button" onClick={reload} className={`w-full text-center text-xs underline ${LBL}`}>Muat ulang riwayat</button>
      <p className="text-xs text-center text-slate-400 dark:text-slate-500">Status di detail memakai batas menipis item yang berlaku sekarang.</p>

      <PickDaySheet key={days[0]?.day || 'kosong'} open={picker} onClose={() => setPicker(false)} days={days} onPick={(d) => { setPicker(false); open(d); }} />
      <DaySheet key={openDay || 'tutup'} day={dayMeta} counts={dayCounts} master={master} onClose={() => setOpenDay(null)} />
    </div>
  );
}
