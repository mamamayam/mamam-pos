import { useState, useEffect } from 'react';
import { Search, X, Calendar, Filter, ArrowUpDown, Check, Smartphone } from 'lucide-react';
import Card from './Card';
import Modal from './Modal';
import Button from './Button';
import SortModal from './SortModal';
import { Input } from './Input';
import MonthGrid from './MonthGrid';
import { PERIOD_OPTIONS, periodLabel, monthRange, fullMonthOf } from '../../utils/listFilters';
import { toLocalDateString } from '../../utils/formatters';

/**
 * FilterBar — kartu kontrol layar daftar (Riwayat, Pengeluaran): pencarian + tiga chip
 * (Periode, Tipe/Kategori, Urutkan) dalam DUA baris, tanpa geser samping.
 * Tiap chip membuka bottom sheet; chip menyala warna aksen kalau filternya tidak default.
 *
 * Props:
 *   query, onQueryChange, placeholder            pencarian
 *   period       { mode, start, end }            onPeriodChange(period)
 *   typeValue    'semua' | key                   onTypeChange(key)
 *   typeOptions  [{ key, label, icon? }]         pilihan selain "semua"
 *   typeAllLabel string  label opsi "semua" di sheet     (mis. 'Semua Tipe Order')
 *   typeChipLabel string teks chip saat "semua"           (mis. 'Semua Tipe')
 *   typeTitle    string  judul sheet
 *   sortValue, sortDefault, onSortChange, sortOptions [{ key, label, short? }]
 *   deviceValue, onDeviceChange, deviceOptions  (opsional, khusus owner) tombol bulat Perangkat di samping pencarian;
 *                tidak dirender kalau deviceOptions tidak diberikan. deviceValue 'semua' | key.
 */

const OPT_BASE = 'w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-300';
const OPT_ON = 'bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400';
const OPT_OFF = 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800';

const CHIP_BASE = 'h-10 min-w-0 px-2 rounded-full border text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-300 active:scale-95';
const CHIP_ON = 'border-accent-500 bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400';
const CHIP_OFF = 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400';

function Chip({ icon: Icon, label, active, onClick, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} title={ariaLabel} className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function PeriodSheet({ isOpen, onClose, period, onChange }) {
  const [showDates, setShowDates] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [year, setYear] = useState(() => new Date().getFullYear());   // tahun yang ditampilkan di pemilih bulan

  useEffect(() => {
    if (!isOpen) return;
    const today = toLocalDateString();
    setYear((fullMonthOf(period.start, period.end) || { year: Number(today.slice(0, 4)) }).year);
    setShowDates(period.mode === 'tanggal-terpilih');
    setStart(period.start || today);
    setEnd(period.end || period.start || today);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (key) => {
    if (key === 'tanggal-terpilih') { setShowDates(true); return; }
    onChange({ mode: key, start: '', end: '' });
    onClose();
  };
  const pickMonth = (m) => {
    onChange({ mode: 'tanggal-terpilih', ...monthRange(year, m) });
    onClose();
  };
  const now = (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; })();
  const apply = () => {
    const [a, b] = start && end && start > end ? [end, start] : [start, end];
    onChange({ mode: 'tanggal-terpilih', start: a, end: b || a });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Periode" size="md" sheet maxHeight>
      <div className="px-2 pb-3">
        {PERIOD_OPTIONS.map((p) => {
          const active = showDates ? p.key === 'tanggal-terpilih' : period.mode === p.key;
          return (
            <button key={p.key} type="button" onClick={() => pick(p.key)} className={`${OPT_BASE} ${active ? OPT_ON : OPT_OFF}`}>
              <span className="flex items-center gap-2.5"><Calendar className="w-4 h-4 opacity-50" />{p.label}</span>
              {active && <Check className="w-4 h-4 shrink-0" />}
            </button>
          );
        })}
        {showDates && (
          <div className="px-2 pt-2 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-1">Pilih bulan</p>
            <MonthGrid
              year={year} onYearChange={setYear} now={now} onPick={pickMonth}
              selected={period.mode === 'tanggal-terpilih' ? fullMonthOf(period.start, period.end) : null}
            />
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-2">Atau pilih rentang tanggal</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Dari" type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
              <Input label="Sampai" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <Button size="full" onClick={apply} disabled={!start}>Terapkan</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function FilterBar({
  query, onQueryChange, placeholder = 'Cari...',
  period, onPeriodChange,
  typeValue, onTypeChange, typeOptions = [], typeAllLabel, typeChipLabel, typeTitle,
  sortValue, sortDefault, onSortChange, sortOptions = [],
  deviceValue = 'semua', onDeviceChange, deviceOptions,
}) {
  const [open, setOpen] = useState(null); // 'period' | 'type' | 'sort' | 'device' | null
  const close = () => setOpen(null);

  const typeLabel = typeValue === 'semua' ? typeChipLabel : (typeOptions.find((o) => o.key === typeValue)?.label || typeValue);
  const sortOpt = sortOptions.find((o) => o.key === sortValue);
  const typeSheetOptions = [{ key: 'semua', label: typeAllLabel, icon: <Filter className="w-4 h-4 opacity-50" /> }, ...typeOptions.map((o) => ({
    ...o, icon: o.icon || <Filter className="w-4 h-4 opacity-50" />,
  }))];

  const showDevice = Array.isArray(deviceOptions) && typeof onDeviceChange === 'function';
  const deviceSheetOptions = showDevice
    ? [{ key: 'semua', label: 'Semua Perangkat', icon: <Smartphone className="w-4 h-4 opacity-50" /> }, ...deviceOptions.map((o) => ({ ...o, icon: o.icon || <Smartphone className="w-4 h-4 opacity-50" /> }))]
    : [];

  return (
    <>
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search" value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder={placeholder}
            className="w-full h-11 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-10 text-sm font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all duration-300 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => onQueryChange('')} aria-label="Hapus pencarian" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 active:scale-90 transition-all">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {showDevice && (
          <button type="button" onClick={() => setOpen('device')} aria-label="Perangkat" title="Perangkat" data-testid="filter-device"
            className={`h-11 w-11 shrink-0 rounded-full border flex items-center justify-center transition-all duration-300 active:scale-95 ${deviceValue !== 'semua' ? CHIP_ON : CHIP_OFF}`}>
            <Smartphone className="w-5 h-5" />
          </button>
        )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Chip icon={Calendar} label={periodLabel(period.mode, period)} active={period.mode !== 'hari-ini'} onClick={() => setOpen('period')} ariaLabel="Periode" />
          <Chip icon={Filter} label={typeLabel} active={typeValue !== 'semua'} onClick={() => setOpen('type')} ariaLabel={typeTitle} />
          <Chip icon={ArrowUpDown} label={sortOpt?.short || sortOpt?.label || 'Urutkan'} active={sortValue !== sortDefault} onClick={() => setOpen('sort')} ariaLabel="Urutkan" />
        </div>
      </Card>

      <PeriodSheet isOpen={open === 'period'} onClose={close} period={period} onChange={onPeriodChange} />
      <SortModal isOpen={open === 'type'} onClose={close} title={typeTitle} value={typeValue} onChange={onTypeChange} options={typeSheetOptions} />
      <SortModal isOpen={open === 'sort'} onClose={close} value={sortValue} onChange={onSortChange} options={sortOptions} />
      {showDevice && <SortModal isOpen={open === 'device'} onClose={close} title="Perangkat" value={deviceValue} onChange={onDeviceChange} options={deviceSheetOptions} />}
    </>
  );
}
