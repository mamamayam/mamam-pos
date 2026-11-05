import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_SHORT, isFutureMonth } from '../../utils/listFilters';

/**
 * MonthGrid — pemilih bulan: navigasi tahun `‹ 2026 ›` + 12 bulan (3 kolom). Bulan yang belum tiba tidak bisa dipilih,
 * tahun tidak bisa maju melewati tahun sekarang. Dipakai sheet Periode (FilterBar) > Tanggal Terpilih supaya bulan-bulan
 * lalu gampang dicari tanpa mengetik tanggal.
 *
 * Props: year, onYearChange(year), selected ({ year, month } | null; month 0-11), now ({ year, month }),
 *        onPick(month), minYear (default now.year - 5).
 */
const NAV = 'w-9 h-9 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 shadow-sm active:scale-90 transition-all disabled:opacity-30 disabled:active:scale-100';

export default function MonthGrid({ year, onYearChange, selected, now, onPick, minYear = now.year - 5 }) {
  return (
    <div data-testid="month-grid">
      <div className="flex items-center justify-between rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-1 mb-3">
        <button type="button" onClick={() => onYearChange(year - 1)} disabled={year <= minYear} aria-label="Tahun sebelumnya" data-testid="month-prev-year" className={NAV}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100" data-testid="month-year">{year}</span>
        <button type="button" onClick={() => onYearChange(year + 1)} disabled={year >= now.year} aria-label="Tahun berikutnya" data-testid="month-next-year" className={NAV}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MONTH_SHORT.map((name, m) => {
          const future = isFutureMonth(year, m, now);
          const on = selected && selected.year === year && selected.month === m;
          const isNow = year === now.year && m === now.month;
          return (
            <button
              key={name} type="button" disabled={future} onClick={() => onPick(m)} aria-pressed={on} data-testid={`month-${m}`}
              className={`h-11 rounded-full border text-sm font-bold transition-all duration-300 active:scale-95 disabled:active:scale-100 ${
                on
                  ? 'border-accent-500 bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400'
                  : future
                    ? 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600'
                    : `border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ${isNow ? 'ring-1 ring-accent-300 dark:ring-accent-500/40' : ''}`
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
