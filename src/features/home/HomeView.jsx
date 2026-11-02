import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Receipt, Wallet, DollarSign, ChevronRight } from 'lucide-react';
import { formatRupiah } from '../../utils/formatters';
import QuickEntrySection from './QuickEntrySection';
import OpnameReminder from './OpnameReminder';
import { useAuth } from '../../auth/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';

/**
 * HomeView — Mamam POS.
 *
 * Struktur JSX (hero card, grid 2x2) di-port dari HomeView.jsx test-app-baru (mamam-global),
 * sesuai arahan "ikutin visual look & navigasinya". Daftar "Riwayat Pesanan Hari Ini" sudah
 * dihapus: gantinya bagian "Catat Cepat" (QuickEntrySection). Riwayat penjualan lengkap ada di
 * layar Riwayat (owner).
 *
 * BEDA dari versi asli — HANYA di layer data:
 *   - useSales() (SyncEngine V2) + AppContext (expenses)  →  query langsung
 *     ke tabel `transactions` + `expenses` project Supabase C (online-first,
 *     tanpa sync engine apa pun)
 *   - field camelCase A (order.date, order.paymentMethod, order.ojolName)
 *     → snake_case sesuai skema C yang meniru mamam-kasir (created_at,
 *     payment_method, ojol_platform, dst)
 *   - Tidak ada activeOnly() (soft-delete filter) — C hard-delete, jadi
 *     row yang ada di tabel = row yang aktif, tidak ada `deleted_at` sama
 *     sekali
 *   - setReceiptModal (modal struk global App.jsx) belum ada di C gelombang
 *     ini — tombol "Struk" untuk sementara dinonaktifkan sampai ReceiptModal
 *     di-port ke PosView
 */

const HomeView = () => {
    const { can } = useAuth();
    const { navigate } = useAppContext();
    const [sales, setSales] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [now, setNow] = useState(new Date());
    const [refreshKey, setRefreshKey] = useState(0);   // naik tiap Catat Cepat menyimpan, supaya kartu di atas ikut segar

    // Jam berjalan biar dashboard terasa hidup
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000 * 30);
        return () => clearInterval(timer);
    }, []);

    // Ambil data 2 hari terakhir (hari ini + kemarin, untuk badge delta %)
    // langsung dari Supabase. Tidak ada polling/subscription realtime di
    // gelombang ini; refresh manual (reload halaman) sudah cukup untuk
    // kebutuhan "track harian". Bisa ditambah Supabase Realtime subscription
    // nanti kalau auto-refresh terasa perlu.
    useEffect(() => {
        let cancelled = false;

        async function loadData() {
            setError(null);

            const since = new Date(now);
            since.setDate(since.getDate() - 1);
            since.setHours(0, 0, 0, 0);

            const [salesRes, expensesRes] = await Promise.all([
                supabase
                    .from('transactions')
                    .select('id, total, created_at')
                    .eq('status', 'paid')
                    .gte('created_at', since.toISOString())
                    .order('created_at', { ascending: false }),
                supabase
                    .from('expenses')
                    .select('id, amount, transaction_date')
                    .eq('direction', 'pengeluaran')
                    .gte('transaction_date', since.toISOString().slice(0, 10)),
            ]);

            if (cancelled) return;

            if (salesRes.error || expensesRes.error) {
                setError((salesRes.error || expensesRes.error).message);
                setLoading(false);
                return;
            }

            setSales(salesRes.data || []);
            setExpenses(expensesRes.data || []);
            setLoading(false);
        }

        loadData();
        return () => { cancelled = true; };
    }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps -- dimuat saat mount & saat Catat Cepat menyimpan, bukan tiap `now` tick

    const isToday = (dateString) => {
        const d = new Date(dateString);
        return d.getDate() === now.getDate() &&
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear();
    };

    // Kalkulasi Hari Ini
    const salesToday = useMemo(
        () => sales.filter(order => isToday(order.created_at)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        [sales, now]
    );
    const totalSalesToday = salesToday.reduce((sum, order) => sum + order.total, 0);
    const totalTransaksiToday = salesToday.length;
    const avgTransaksi = totalTransaksiToday > 0 ? totalSalesToday / totalTransaksiToday : 0;

    const expensesToday = useMemo(
        () => expenses.filter(exp => isToday(exp.transaction_date)),
        [expenses, now]
    );
    const totalExpensesToday = expensesToday.reduce((sum, exp) => sum + exp.amount, 0);

    const netProfitToday = totalSalesToday - totalExpensesToday;

    // Perbandingan vs kemarin, buat badge naik/turun di hero card
    const salesYesterday = useMemo(() => {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        return sales
            .filter(order => {
                const d = new Date(order.created_at);
                return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear();
            })
            .reduce((sum, order) => sum + order.total, 0);
    }, [sales, now]);
    const salesDeltaPct = salesYesterday > 0
        ? Math.round(((totalSalesToday - salesYesterday) / salesYesterday) * 100)
        : (totalSalesToday > 0 ? 100 : 0);

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-2">
                <p className="text-sm font-semibold text-red-500">Gagal memuat data</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">{error}</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto pb-6 animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out custom-scrollbar">

            {/* Pengingat stok opname (owner, H-1 dan hari H; tiap kali aplikasi dibuka) */}
            <OpnameReminder />

            {/* Hero Card — Total Penjualan Hari Ini */}
            <button type="button" onClick={() => navigate('riwayat')} aria-label="Buka riwayat penjualan"
                className="block w-full text-left bg-slate-900 dark:bg-black rounded-2xl p-5 mb-4 active:scale-[0.99] transition-transform">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Total Penjualan Hari Ini</p>
                <div className="flex items-center justify-between gap-3">
                    <p className="font-heading text-3xl font-bold text-white">{loading ? '...' : formatRupiah(totalSalesToday)}</p>
                    {!loading && salesDeltaPct !== 0 && (
                        <span className={`shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full ${salesDeltaPct > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {salesDeltaPct > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {salesDeltaPct > 0 ? '+' : ''}{salesDeltaPct}%
                        </span>
                    )}
                </div>
                <p className="mt-3 flex items-center gap-1 text-xs font-bold text-slate-500">Lihat riwayat <ChevronRight className="w-3 h-3" /></p>
            </button>

            {/* Grid 2x2 Metrik */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 flex items-center justify-center shrink-0">
                            <TrendingDown className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pengeluaran</p>
                    </div>
                    <p className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100">{loading ? '...' : formatRupiah(totalExpensesToday)}</p>
                </div>

                {can('beranda.laba') && (
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <DollarSign className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Laba Kotor</p>
                    </div>
                    <p className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100">{loading ? '...' : formatRupiah(netProfitToday)}</p>
                </div>
                )}

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center shrink-0">
                            <Receipt className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Transaksi</p>
                    </div>
                    <p className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100">{loading ? '...' : totalTransaksiToday}</p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-500 dark:text-purple-400 flex items-center justify-center shrink-0">
                            <Wallet className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Rata-rata</p>
                    </div>
                    <p className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100">{loading ? '...' : formatRupiah(avgTransaksi)}</p>
                </div>
            </div>

            {/* Catat Cepat: pengeluaran toko, tambah/potongan karyawan, persetujuan, catatan hari ini */}
            <QuickEntrySection onChanged={() => setRefreshKey(k => k + 1)} />
        </div>
    );
};

export default HomeView;
