import { useState, useMemo } from 'react';
import { Card } from '../../components/ui';
import { reportRange, localDateString, periodLabel } from './reportsMath';
import PeriodFilter from './PeriodFilter';
import LabaRugiTab from './LabaRugiTab';

/**
 * ReportsView — Laporan (satu layar, owner-only lewat `screen.laporan`):
 *  filter periode + Laba Rugi (penjualan, laba kotor = penjualan − semua pengeluaran,
 *  pengeluaran, pengeluaran per kategori, per metode bayar / tipe pesanan, menu terlaris,
 *  dan tombol Income Statement di paling bawah).
 * Daftar catatan pengeluaran ada di layar Pengeluaran (Riwayat transaksi: features/history/RiwayatView).
 * Periode: Bulanan (default, bisa mundur per bulan) / Harian / Semua / Rentang — lihat PeriodFilter.
 * Grafik tren dihilangkan (sama seperti di Beranda).
 */
export default function ReportsView() {
  const [period, setPeriod] = useState(() => {
    const today = localDateString();
    return { mode: 'bulan', month: today.slice(0, 7), day: today, start: '', end: '' };
  });
  const range = useMemo(() => reportRange(period), [period]);

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      <div className="max-w-3xl w-full space-y-4 pb-10">
        <PeriodFilter value={period} onChange={setPeriod} />
        {range
          ? <LabaRugiTab range={range} periodLabel={periodLabel(period)} />
          : <Card className="text-center text-sm text-slate-400 py-8">Pilih tanggal dulu, atau pakai tombol cepat di atas.</Card>}
      </div>
    </div>
  );
}
