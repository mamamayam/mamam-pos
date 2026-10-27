import { lazy, Suspense, Component, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, Lock, WifiOff } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { VIEW_PERMISSION } from '../auth/permissions';
import { Button } from '../components/ui';
import PullIndicator from '../components/PullIndicator';
import { usePullToRefresh } from '../hook/usePullToRefresh';
import { isChunkLoadError, shouldAutoReload } from '../lib/connectionLogic';

// Mamam POS: PORT 1:1 dari AppRoutes.jsx mamam-global (A) branch
// test-app-baru. Mesin render (mountedViews, animasi framer-motion,
// error boundary per-view) TIDAK diubah — cuma isi VIEWS yang disesuaikan
// dengan 9 fitur gelombang 1 milik C (lihat breakdown UI yang disepakati).
//
// Dihapus dari versi A: isChunkLoadError/reloadOnceForFreshChunk (util
// khusus PWA-cache A yang tidak relevan untuk C).

const HomeView       = lazy(() => import('../features/home/HomeView'));
const ShiftView      = lazy(() => import('../features/shift/ShiftView'));
const PosView        = lazy(() => import('../features/pos/PosView'));
const MenuMgmt       = lazy(() => import('../features/menu/MenuMgmt'));
const CustomerView   = lazy(() => import('../features/customer/CustomerView'));
const ExpenseView    = lazy(() => import('../features/expense/ExpenseView'));
const EmployeeView   = lazy(() => import('../features/employee/EmployeeView'));
const AttendanceView = lazy(() => import('../features/attendance/AttendanceView'));
const PayrollView    = lazy(() => import('../features/payroll/PayrollView'));
const ReportsView    = lazy(() => import('../features/reports/ReportsView'));
const RiwayatView    = lazy(() => import('../features/history/RiwayatView'));
const SettingsView   = lazy(() => import('../features/settings/SettingsView'));
const StockView      = lazy(() => import('../features/stock/StockView'));

export const VIEWS = {
    beranda:     HomeView,
    dompet:      ShiftView,
    kasir:       PosView,
    menu:        MenuMgmt,
    pelanggan:   CustomerView,
    pengeluaran: ExpenseView,
    karyawan:    EmployeeView,
    absensi:     AttendanceView,
    penggajian:  PayrollView,
    laporan:     ReportsView,
    riwayat:     RiwayatView,
    pengaturan:  SettingsView,
    'stok-belanja': StockView,
};

// Setelah deploy baru, berkas halaman lama hilang dari server; aplikasi yang masih terbuka dari
// versi lama gagal memuat halaman yang belum pernah dibuka. Muat ulang SEKALI otomatis (ambil
// versi terbaru); guard di shouldAutoReload mencegah putaran tanpa akhir.
const RELOAD_KEY = 'mamam-pos-chunk-reload-at';
function reloadOnceForFreshChunk() {
    try {
        const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
        if (!shouldAutoReload(last, Date.now())) return false;
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch { return false; }
    window.location.reload();
    return true;
}

// --- Error Boundary per-view (sama seperti A, minus chunk-reload logic) ---
class ViewErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary] Fitur crash:', error, info);
        if (isChunkLoadError(error) && navigator.onLine !== false) reloadOnceForFreshChunk();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.viewKey !== this.props.viewKey && this.state.hasError) {
            this.setState({ hasError: false, error: null });
        }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError && isChunkLoadError(this.state.error)) {
            // Hasil import yang gagal tersimpan di React.lazy, jadi satu-satunya jalan ulang = muat ulang halaman.
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4" data-testid="halaman-gagal-dimuat">
                    <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/10 rounded-full flex items-center justify-center">
                        {offline ? <WifiOff className="w-8 h-8 text-amber-500 dark:text-amber-400" /> : <RefreshCw className="w-8 h-8 text-amber-500 dark:text-amber-400" />}
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-1">{offline ? 'Halaman belum bisa dimuat' : 'Perlu memuat versi terbaru'}</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs mx-auto">
                            {offline
                                ? 'Koneksi internet terputus, dan halaman ini belum pernah dibuka di perangkat ini. Sambungkan internet lalu muat ulang.'
                                : 'Aplikasi baru saja diperbarui, jadi halaman ini perlu dimuat ulang. Data kamu aman.'}
                        </p>
                    </div>
                    <Button onClick={() => window.location.reload()} icon={<RefreshCw className="w-4 h-4" />}>Muat Ulang</Button>
                </div>
            );
        }
        if (this.state.hasError) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <div className="w-16 h-16 bg-accent-50 dark:bg-accent-500/10 rounded-full flex items-center justify-center">
                        <AlertCircle className="w-8 h-8 text-accent-500 dark:text-accent-400" />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-1">
                            Halaman ini mengalami error
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">
                            Data kamu aman, hanya tampilan ini yang bermasalah.
                        </p>
                        {this.state.error && (
                            <p className="text-xs text-accent-400 dark:text-accent-400 font-mono bg-accent-50 dark:bg-accent-500/10 rounded px-3 py-1 mt-2 max-w-xs mx-auto break-all">
                                {this.state.error.message}
                            </p>
                        )}
                    </div>
                    <Button onClick={this.handleRetry} icon={<RefreshCw className="w-4 h-4" />}>
                        Coba Lagi
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}

// --- Layar terbatas: pagar kedua kalau ada jalur yang membuka layar tanpa izin ---
function RestrictedView() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Lock className="w-6 h-6 text-slate-400" /></div>
            <h2 className="font-heading font-bold text-slate-800 dark:text-slate-100">Khusus Owner</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">Halaman ini hanya bisa dibuka dengan PIN owner.</p>
        </div>
    );
}

// --- Loading Skeleton (sama seperti A) ---
function ViewSkeleton() {
    return (
        <div className="flex-1 flex flex-col p-4 gap-4 animate-pulse">
            <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl w-3/4" />
            <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl w-full" />
            <div className="grid grid-cols-2 gap-4 mt-2">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
                ))}
            </div>
        </div>
    );
}

// --- Varian animasi transisi (sama persis dengan A) ---
const VARIANTS = {
    'forward-root': {
        initial: { x: '100%', opacity: 0.6 },
        animate: { x: 0, opacity: 1 },
        exit: { x: '-30%', opacity: 0 },
    },
    'backward-root': {
        initial: { x: '-100%', opacity: 0.6 },
        animate: { x: 0, opacity: 1 },
        exit: { x: '30%', opacity: 0 },
    },
    'forward-sub': {
        initial: { y: '100%', opacity: 1 },
        animate: { y: 0, opacity: 1 },
        exit: { y: 0, opacity: 0.4, scale: 0.97 },
    },
    'backward-sub': {
        initial: { y: 0, opacity: 0.4, scale: 0.97 },
        animate: { y: 0, opacity: 1, scale: 1 },
        exit: { y: '100%', opacity: 1 },
    },
};
const TRANSITION = { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.32 };

// --- Main AppRoutes (mesin render sama persis dengan A) ---
export default function AppRoutes({ currentView, mountedViews, navDirection = 'forward-root' }) {
    const { can } = useAuth();
    const isAllowed = (key) => !VIEW_PERMISSION[key] || can(VIEW_PERMISSION[key]);
    const viewsToRender = mountedViews ? Array.from(mountedViews) : [currentView];
    const variant = VARIANTS[navDirection] || VARIANTS['forward-root'];

    // Tarik ke bawah dari paling atas = muat ulang halaman (lihat hook untuk pengamannya).
    const rootRef = useRef(null);
    const ptr = usePullToRefresh(rootRef);

    const prevActiveRef = useRef(currentView);
    const previousActive = prevActiveRef.current;
    useEffect(() => {
        prevActiveRef.current = currentView;
    }, [currentView]);

    return (
        <div ref={rootRef} className="relative flex-1 overflow-hidden">
            <PullIndicator {...ptr} />
            {viewsToRender.map((viewKey) => {
                const ViewComponent = VIEWS[viewKey] && !isAllowed(viewKey) ? RestrictedView : VIEWS[viewKey];
                if (!ViewComponent) return null;

                const isActive = viewKey === currentView;
                const isExiting = viewKey === previousActive && previousActive !== currentView;

                if (!isActive && !isExiting) {
                    return (
                        <div
                            key={viewKey}
                            className="absolute inset-0 flex flex-col overflow-hidden pointer-events-none"
                            style={{ visibility: 'hidden' }}
                            aria-hidden="true"
                        >
                            <ViewErrorBoundary viewKey={viewKey}>
                                <Suspense fallback={<ViewSkeleton />}>
                                    <ViewComponent />
                                </Suspense>
                            </ViewErrorBoundary>
                        </div>
                    );
                }

                return (
                    <motion.div
                        key={viewKey}
                        initial={isActive ? variant.initial : false}
                        animate={isActive ? variant.animate : variant.exit}
                        transition={TRANSITION}
                        className={isActive
                            ? 'absolute inset-0 flex flex-col overflow-y-auto overscroll-y-contain'
                            : 'absolute inset-0 flex flex-col overflow-hidden pointer-events-none'}
                        aria-hidden={!isActive}
                    >
                        <ViewErrorBoundary viewKey={viewKey}>
                            <Suspense fallback={<ViewSkeleton />}>
                                <ViewComponent />
                            </Suspense>
                        </ViewErrorBoundary>
                    </motion.div>
                );
            })}
            {!VIEWS[currentView] && (
                <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500">
                    Halaman tidak ditemukan: <code className="ml-1 text-sm bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{currentView}</code>
                </div>
            )}
        </div>
    );
}
