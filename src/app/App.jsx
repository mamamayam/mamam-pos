import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Modal, Button } from '../components/ui';
import AppRoutes, { VIEWS } from './AppRoutes';
import { readSavedNav, saveNav, clearNav } from './navPersist';
import BottomSheetMenu from './layout/BottomSheetMenu';
import ApprovalSheet from '../features/approvals/ApprovalSheet';
import Header from './layout/Header';
import BottomNav from './layout/BottomNav';
import { AppContext } from '../context/AppContext';
import { formatRupiah } from '../utils/formatters';
import { useAuth } from '../auth/AuthContext';
import LoginScreen from '../auth/LoginScreen';
import DeviceLockScreen from '../auth/DeviceLockScreen';
import { useDeviceStatus } from '../hook/useDevice';
import { deviceLock, STATUS as DEVICE_STATUS } from '../hook/deviceLogic';
import ResetPinScreen from '../auth/ResetPinScreen';
import ConnectionBanner from '../components/ConnectionBanner';
import { VIEW_PERMISSION } from '../auth/permissions';
import { backStack } from '../lib/backStack';
import { usePendingApprovals, usePendingApprovalsPoller } from '../hook/usePendingApprovals';

import {
  Briefcase,
  Clock,
  Fingerprint,
  List,
  ShoppingCart,
  ClipboardCheck,
  ClipboardList,
  TrendingDown,
  BarChart3,
  History,
  Users,
  UserCog,
  Settings,
  Calculator,
} from 'lucide-react';

/**
 * App.jsx — Mamam POS.
 *
 * Ini BUKAN port 1:1 dari App.jsx test-app-baru (mamam-global) — itu file
 * monolitik yang nyampur mesin navigasi dengan SEMUA state bisnis (POS
 * store, sync engine, PIN admin, payroll auto-backfill, push notif, dll).
 *
 * Yang DIPERTAHANKAN persis (pola & logika, ditulis ulang bersih):
 *   - Stack navigation per-root: navigate() / navigateToSub() / navigateBack()
 *   - mountedViews (Set) — cabang yang tidak aktif TETAP mounted
 *     (visibility:hidden di AppRoutes), state internal tidak reset
 *   - navDirection — dibaca AppRoutes.jsx untuk varian animasi slide
 *
 * Yang DIBUANG (di luar scope Mamam POS / gelombang 1):
 *   - syncEngine, usePersistState, usePosStore (Dexie/offline) — C online-first
 *   - PIN admin sungguhan, push notifications, Capacitor back-button
 *     (App.jsx test-app-baru target APK Android; C web/PWA — tombol Back dan
 *     "ketuk lagi untuk keluar" ditangani lib/backStack.js)
 *   - Auto-backfill payroll/libur, online/offline toast
 *
 * Guard shift: PosView tidak bisa diakses kalau belum ada shift yang
 * `closed_at IS NULL` — logic ini akan diimplementasi di dalam PosView/
 * ShiftView sendiri lewat query Supabase, BUKAN di sini (App.jsx tidak tahu
 * apa pun soal data bisnis).
 */
export default function App() {
  const { role, logout, can: allowed, ready, recovery } = useAuth();
  // Perangkat terdaftar: HP staf yang belum didaftarkan owner terkunci (lihat docs di AGENTS.md).
  const device = useDeviceStatus(Boolean(role) && ready);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);   // sheet Persetujuan (owner)

  // Owner: badge merah (Beranda, Menu, tile Persetujuan) kalau ada pengajuan yang menunggu keputusan:
  // Tambahan karyawan dan hapus transaksi dari staf.
  usePendingApprovalsPoller(allowed('persetujuan.kelola'));
  const pendingApprovals = usePendingApprovals();

  // Modal konfirmasi generik — dipakai BottomSheetMenu (logout admin) dan
  // bisa dipakai fitur lain lewat context kalau nanti perlu.
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
  const triggerConfirm = useCallback((message, onConfirm) => {
    setConfirmModal({ isOpen: true, message, onConfirm });
  }, []);
  const closeConfirm = useCallback(() => {
    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
  }, []);

  const [alertModal, setAlertModal] = useState({ isOpen: false, message: '' });
  const triggerAlert = useCallback((message) => setAlertModal({ isOpen: true, message }), []);

  // --- STACK NAVIGATION PER-ROOT (dipertahankan dari test-app-baru) ---
  // Refresh halaman (tarik-ke-bawah) kembali ke layar yang sama, bukan Beranda (lihat navPersist.js).
  const initialNav = useRef(null);
  if (!initialNav.current) initialNav.current = readSavedNav((v) => Boolean(VIEWS[v])) || { view: 'beranda', history: [] };
  const [currentView, setCurrentView] = useState(initialNav.current.view);
  const [viewHistory, setViewHistory] = useState(initialNav.current.history);
  const [mountedViews, setMountedViews] = useState(() => new Set([...initialNav.current.history, initialNav.current.view]));
  const [navDirection, setNavDirection] = useState('forward-root');

  const navigate = useCallback((view) => {
    if (view === currentView) return;
    setViewHistory([]);
    setMountedViews(new Set([view]));
    setNavDirection('forward-root');
    setCurrentView(view);
  }, [currentView]);

  const navigateToSub = useCallback((view) => {
    if (view === currentView) return;
    setViewHistory(prev => [...prev, currentView]);
    setMountedViews(prev => new Set(prev).add(view));
    setNavDirection('forward-sub');
    setCurrentView(view);
  }, [currentView]);

  const navigateBack = useCallback(() => {
    if (viewHistory.length > 0) {
      const prev = viewHistory[viewHistory.length - 1];
      setViewHistory(h => h.slice(0, -1));
      setNavDirection('backward-sub');
      setCurrentView(prev);
    } else if (currentView !== 'beranda') {
      setMountedViews(new Set(['beranda']));
      setNavDirection('backward-root');
      setCurrentView('beranda');
    }
    // Di Beranda tanpa history tidak ada yang dilakukan di sini: Back ditangani
    // backStack ("ketuk lagi untuk keluar", notifnya = components/ui/ExitToast).
  }, [viewHistory, currentView]);

  useEffect(() => { saveNav(currentView, viewHistory); }, [currentView, viewHistory]);

  // Sesi berakhir (logout, atau sesi habis sehingga PIN diminta lagi): lupakan layar terakhir. Setelah PIN dimasukkan
  // aplikasi mulai dari Beranda; layar tersimpan hanya untuk refresh di sesi yang masih berlaku.
  useEffect(() => {
    if (!ready || role) return;
    clearNav();
    setViewHistory([]);
    setMountedViews(new Set(['beranda']));
    setNavDirection('forward-root');
    setCurrentView('beranda');
  }, [ready, role]);

  // --- Tombol Back browser/HP <-> stack navigasi ---
  // Kedalaman stack = jumlah sub-layar, ditambah 1 kalau stack berakar di layar selain
  // Beranda (Back dari layar itu kembali ke Beranda, seperti navigateBack di atas).
  // Tiap tingkat punya satu "lapisan" di backStack; menekan Back = navigateBack().
  // Modal/laci yang terbuka mendaftar sendiri (useBackLayer) dan ditutup lebih dulu.
  // Di Beranda tanpa lapisan terbuka, Back pertama menampilkan "Ketuk lagi untuk keluar"
  // dan Back kedua keluar dari aplikasi (diatur backStack, bukan di sini).
  const navDepth = viewHistory.length + ((viewHistory[0] ?? currentView) !== 'beranda' ? 1 : 0);
  const navigateBackRef = useRef(navigateBack);
  useEffect(() => { navigateBackRef.current = navigateBack; });
  const navLayerIds = useRef([]);
  useEffect(() => {
    const ids = navLayerIds.current.filter((id) => backStack.has(id));   // buang yang sudah dipakai tombol Back
    while (ids.length > navDepth) backStack.unregister(ids.pop());
    while (ids.length < navDepth) ids.push(backStack.register(() => navigateBackRef.current()));
    navLayerIds.current = ids;
  }, [navDepth]);

  // Helper UI + navigasi yang dibagikan ke semua View lewat useAppContext().
  // Diletakkan SETELAH navigate/navigateToSub/navigateBack didefinisikan
  // (bug yang pernah terjadi: dideklarasikan sebelum navigate ada, sehingga
  // View yang memanggil navigate() dari context diam-diam gagal).
  const openApprovals = useCallback(() => { setIsMenuOpen(false); setIsApprovalOpen(true); }, []);
  const appContextValue = useMemo(
    () => ({ triggerAlert, triggerConfirm, formatRupiah, navigate, navigateToSub, navigateBack, openApprovals }),
    [triggerAlert, triggerConfirm, navigate, navigateToSub, navigateBack, openApprovals]
  );

  // --- Menu untuk BottomSheetMenu — fitur gelombang 1 Mamam POS + Pengaturan ---
  // NB: 'laporan' sudah termasuk Laba Rugi (bukan menu terpisah seperti
  // 'labarugi' di test-app-baru) — lihat ReportsView.
  const menuItems = useMemo(() => [
    { id: 'kasir',       icon: ShoppingCart, label: 'Kasir' },
    { id: 'dompet',      icon: Clock,        label: 'Dompet / Shift' },
    { id: 'menu',        icon: List,         label: 'Manajemen Menu' },
    { id: 'pelanggan',   icon: Users,        label: 'Pelanggan' },
    { id: 'pengeluaran', icon: TrendingDown, label: 'Pengeluaran' },
    { id: 'stok-belanja', icon: ClipboardList, label: 'Stok Belanja' },
    { id: 'karyawan',    icon: UserCog,      label: 'Karyawan' },
    { id: 'absensi',     icon: Fingerprint,  label: 'Absensi' },
    { id: 'penggajian',  icon: Briefcase,    label: 'Penggajian' },
    { id: 'riwayat',     icon: History,      label: 'Riwayat' },
    { id: 'laporan',     icon: BarChart3,    label: 'Laporan' },
    // Bukan layar: membuka sheet Persetujuan (hapus transaksi + Tambahan dari staf). Owner saja (VIEW_PERMISSION).
    { id: 'persetujuan', icon: ClipboardCheck, label: 'Persetujuan', action: 'persetujuan' },
    { id: 'pengaturan',  icon: Settings,     label: 'Pengaturan' },
    // HPP bukan layar POS: pindah ke halaman /hpp di tab yang sama (lihat src/hpp, PRD Routing).
    { id: 'hpp',         icon: Calculator,   label: 'HPP', href: '/hpp' },
  ], []);

  // Menu yang butuh izin khusus (mis. Penggajian, Manajemen Menu) disembunyikan
  // dari peran yang tidak berhak. Pagar kedua ada di AppRoutes.
  const visibleMenus = useMemo(
    () => menuItems.filter(item => !VIEW_PERMISSION[item.id] || allowed(VIEW_PERMISSION[item.id])),
    [menuItems, allowed]
  );

  // Keluar: kembali ke Beranda supaya peran berikutnya tidak mendarat di layar yang bukan miliknya.
  const handleLogout = useCallback(() => {
    setViewHistory([]);
    setMountedViews(new Set(['beranda']));
    setNavDirection('forward-root');
    setCurrentView('beranda');
    logout();
  }, [logout]);

  // TODO(gelombang berikutnya): currentShift ini harus berasal dari query
  // Supabase (`shifts` yang `closed_at IS NULL`), disuplai oleh ShiftView
  // lewat context/hook bersama — sekarang masih placeholder false supaya
  // App.jsx bisa dirender & ditest independen dari data layer.
  const currentShift = false;

  // Mode Supabase Auth: tunggu sesi dicek dulu (sekejap) supaya layar login tidak berkedip.
  if (!ready) return <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950" data-testid="auth-loading" />;
  // Dibuka dari tautan "Lupa PIN" di email: buat PIN baru.
  if (recovery) return <ResetPinScreen />;
  // Belum masuk: tampilkan layar PIN saja (tidak ada data yang dimuat).
  if (!role) return <LoginScreen />;
  // HP staf belum terdaftar / dicabut: layar kunci. Owner tidak pernah dikunci supaya bisa mendaftarkan HP.
  const lock = deviceLock(role, device.status);
  if (lock === DEVICE_STATUS.LOADING) return <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950" data-testid="device-loading" />;
  if (lock) return <DeviceLockScreen status={lock} code={device.code} onRetry={device.refresh} onLogout={logout} />;

  return (
    <AppContext.Provider value={appContextValue}>
    <div data-app-shell className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header
        currentShift={currentShift}
        currentView={currentView}
      />

      <ConnectionBanner />

      <AppRoutes
        currentView={currentView}
        mountedViews={mountedViews}
        navDirection={navDirection}
      />

      <BottomNav
        currentView={currentView}
        navigate={navigate}
        onOpenMenu={() => setIsMenuOpen(true)}
        pendingCount={pendingApprovals}
      />

      <BottomSheetMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        visibleMenus={visibleMenus}
        currentView={currentView}
        navigate={navigate}
        role={role}
        onLogout={() => triggerConfirm('Yakin ingin keluar?', handleLogout)}
        onAction={(action) => { if (action === 'persetujuan') openApprovals(); }}
        badges={{ persetujuan: pendingApprovals }}
      />

      <ApprovalSheet isOpen={isApprovalOpen} onClose={() => setIsApprovalOpen(false)} />

      <Modal isOpen={confirmModal.isOpen} onClose={closeConfirm} size="sm" zLevel="top">
        <div className="p-5">
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">{confirmModal.message}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={closeConfirm}>Batal</Button>
            <Button onClick={() => { confirmModal.onConfirm?.(); closeConfirm(); }}>Ya, Lanjutkan</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({ isOpen: false, message: '' })} size="sm" zLevel="top">
        <div className="p-5">
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">{alertModal.message}</p>
          <div className="flex justify-end">
            <Button onClick={() => setAlertModal({ isOpen: false, message: '' })}>Oke</Button>
          </div>
        </div>
      </Modal>
    </div>
    </AppContext.Provider>
  );
}
