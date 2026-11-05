import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { leaveForHref } from '../../lib/appMode';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogOut, Pencil, Ellipsis, ChevronUp, Minus, Plus } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import SegmentedControl from '../../components/ui/SegmentedControl';
import {
  resolveMenuLayout, togglePin, moveCompact, moveExpanded,
  readMenuLayout, saveMenuLayout, clearMenuOrder, staggerDelay,
} from './menuOrder';
import { useGridReorder, SETTLE_MS } from './useGridReorder';
import { fetchMenuOrder, pushMenuOrder, deleteMenuOrder } from './menuOrderSync';
import { supabase } from '../../lib/supabase';
import { roleLabel } from '../../auth/permissions';
import { versionLabel } from '../../lib/appVersion';

/**
 * BottomSheetMenu — swipe-up sheet, ported dari test-app-baru (mamam-global).
 * Grid 3-kolom untuk menu Mamam POS (+ tombol HPP yang pindah ke /hpp di tab yang sama, hanya owner).
 *
 * BEDA dari versi asli: card "Notifikasi" di atas grid DIHAPUS — C belum
 * punya push notifications/NotificationBell (di luar scope gelombang 1).
 * Kalau nanti perlu, tinggal port ulang dari test-app-baru.
 *
 * Tampilan RINGKAS (bawaan saat dibuka): hanya menu pilihan pemilik + satu tile "Lainnya". Ketuk "Lainnya" untuk
 * membuka SEMUA menu (urutan terpisah), tombol "Ringkas" di bawahnya menutup lagi.
 *
 * Ketuk "Atur" untuk mengatur: dua tab, "Ringkas" (menu mana yang tampil di atas dan urutannya; ketuk −/+ untuk
 * memindah antara menu ringkas dan Lainnya, geser untuk mengurutkan) dan "Diperluas" (urutan semua menu saat
 * Lainnya dibuka). Logika tata letak ada di menuOrder.js (murni, dites).
 * Tata letak disimpan per peran: di perangkat ini (localStorage, langsung tampil) DAN di server (app_settings,
 * lihat menuOrderSync.js) supaya ikut ke HP/browser mana pun. Server dibaca tiap menu dibuka; kalau offline,
 * tata letak lokal tetap dipakai dan dikirim saat tersambung. "Reset" mengembalikan tata letak bawaan.
 * Badge menu yang tersembunyi di Lainnya (mis. Persetujuan) dijumlahkan ke tile Lainnya.
 *
 * ANIMASI Lainnya <-> Ringkas (permintaan pemilik 5 Nov 2026; sebelumnya menu lain muncul/hilang mendadak):
 * tile yang baru muncul memudar + membesar bergantian (stagger), tile Lainnya memudar keluar, tile yang berpindah
 * tempat (urutan Diperluas berbeda dari Ringkas) meluncur ke posisi barunya (`layout="position"`), tinggi sheet
 * diukur lalu dianimasikan (`AnimatedHeight`) supaya tepi atasnya naik/turun halus, dan tombol Ringkas ikut
 * melebar/menguncup. Easing + durasi sama dengan Overlay (0.2, 0, 0, 1 / 300 ms).
 *
 * ANIMASI mode "Atur" (permintaan pemilik 5 Nov 2026; sebelumnya drag-drop dan perpindahan tile terasa patah):
 * - tile yang berpindah urutan (digeser) atau berpindah bagian (−/+ atau ketuk di "Di dalam Lainnya") MELUNCUR ke tempat
 *   barunya (`layout` + `layoutId` di tab Ringkas, jadi terbang antar dua grid); tile tetap dibungkus SEL polos yang
 *   posisinya tidak ikut animasi, dan sel itulah yang didaftarkan ke `useGridReorder` (penentu tujuan memakai posisi akhir,
 *   bukan posisi tile yang sedang meluncur, supaya urutan tidak bolak-balik);
 * - bayangan yang diseret "terangkat" (membesar) saat disentuh dan MENDARAT ke slotnya saat dilepas (`SETTLE_MS`);
 * - pindah tab Ringkas <-> Diperluas dan masuk/keluar Atur = pudar bergantian (`AnimatePresence mode="wait"`), tinggi
 *   sheet mengikuti dengan halus (satu `AnimatedHeight` di atas semuanya; jangan ditumpuk, nanti ukurannya dikejar terus).
 * `prefers-reduced-motion`: semua durasi 0.
 */

const LAINNYA = { id: 'lainnya', icon: Ellipsis, label: 'Lainnya' };

const EASE = [0.2, 0, 0, 1];   // sama dengan Overlay (cubic-bezier(0.2,0,0,1))

/** Gerak satu tile di grid menu: masuk (pudar + membesar, tertunda `delay`), keluar (cepat), dan pindah posisi. */
const tileMotion = (delay, reduce) => ({
  layout: 'position',   // hanya posisi: ukuran tile tetap, jadi teks tidak ikut melar
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85, transition: { duration: reduce ? 0 : 0.12 } },
  transition: reduce
    ? { duration: 0 }
    : { layout: { duration: 0.3, ease: EASE }, opacity: { duration: 0.2, delay }, scale: { duration: 0.3, ease: EASE, delay } },
});

/**
 * AnimatedHeight — tingginya mengikuti isi tapi berubah dengan transisi (bukan loncat). Isi diukur dengan
 * pengamat ukuran (cadangan) DAN diukur ulang di commit yang sama saat `watch` berubah (ketuk Lainnya/Ringkas), supaya gerakan
 * mulai pada frame itu juga tanpa jeda. Sebelum terukur (render pertama) tinggi mengikuti isi apa adanya: tidak ada animasi saat sheet dibuka.
 * `pt-2 pb-1` di dalam + margin negatif di luar memberi ruang untuk badge merah (menjorok 6px di atas tile) dan bayangan
 * tile supaya tidak terpotong `overflow-hidden`, tanpa menggeser tata letak. `px-1` + `-mx-1` sama untuk cincin putus-putus
 * dan tombol −/+ di mode Atur yang menjorok keluar tile.
 */
function AnimatedHeight({ children, watch }) {
  const reduce = useReducedMotion();
  const inner = useRef(null);
  const [h, setH] = useState(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    setH(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => { if (inner.current) setH(inner.current.offsetHeight); }, [watch]);
  return (
    <motion.div
      initial={false}
      animate={h === null ? {} : { height: h }}
      transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
      className="overflow-hidden -mt-2 -mb-1 -mx-1"
      data-testid="menu-grid-wrap"
    >
      <div ref={inner} className="pt-2 pb-1 px-1">{children}</div>
    </motion.div>
  );
}

function MenuTile({ item, isActive, ghost = false, badge = 0 }) {
  return (
    <>
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-transform duration-200 ${ghost ? 'scale-110 shadow-xl' : 'group-active:scale-90'} ${
          isActive
            ? 'bg-gradient-to-br from-accent-600 to-accent-500 dark:from-accent-500 dark:to-accent-600'
            : 'bg-slate-100 dark:bg-slate-800'
        }`}
      >
        <item.icon className={`w-[22px] h-[22px] ${isActive ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`} />
        {badge > 0 && (
          <span data-testid={`badge-${item.id}`} className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold leading-5 text-center ring-2 ring-white dark:ring-slate-900">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className={`text-xs font-semibold text-center leading-tight ${isActive ? 'text-accent-600 dark:text-accent-400' : 'text-slate-600 dark:text-slate-300'}`}>
        {item.label}
      </span>
    </>
  );
}

/** Tombol bulat kecil di pojok tile (mode Atur, tab Ringkas): − = pindah ke Lainnya, + = tampilkan di menu ringkas. */
function PinToggle({ id, label, pinned, onClick }) {
  const Icon = pinned ? Minus : Plus;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`menu-pin-${id}`}
      aria-label={pinned ? `Pindahkan ${label} ke Lainnya` : `Tampilkan ${label} di menu ringkas`}
      className={`absolute top-0 z-10 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-md ring-2 ring-white dark:ring-slate-900 active:scale-90 transition-transform ${pinned ? 'bg-slate-500 dark:bg-slate-600' : 'bg-accent-600'}`}
      style={{ left: 'calc(50% + 12px)' }}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={3} />
    </button>
  );
}

/** Pudar masuk/keluar satu blok (ganti mode Atur, ganti tab). Dipakai dengan `AnimatePresence mode="wait"`. */
const fadeMotion = (reduce) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: reduce ? 0 : 0.18, ease: EASE } },
  exit: { opacity: 0, transition: { duration: reduce ? 0 : 0.1 } },
});

/**
 * Bayangan tile yang diseret: ikut jari, membesar sedikit begitu muncul ("terangkat"), lalu saat dilepas (`drag.settling`)
 * mengecil dan meluncur ke slot akhirnya. `py-1` sama dengan tile di grid supaya mendarat tepat di atasnya.
 */
function GhostTile({ drag, item, isActive, reduce }) {
  const [up, setUp] = useState(false);
  useEffect(() => { const f = requestAnimationFrame(() => setUp(true)); return () => cancelAnimationFrame(f); }, []);
  const settle = drag.settling && !reduce;
  return (
    <div
      className="fixed z-[9999] pointer-events-none flex flex-col items-center gap-2 py-1 opacity-95" data-testid="menu-ghost"
      data-settling={drag.settling ? 'true' : undefined}
      style={{
        left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w,
        transition: settle ? `left ${SETTLE_MS}ms cubic-bezier(0.2,0,0,1), top ${SETTLE_MS}ms cubic-bezier(0.2,0,0,1)` : undefined,
      }}
    >
      <MenuTile item={item} isActive={isActive} ghost={up && !drag.settling} />
    </div>
  );
}

const GRID = 'grid grid-cols-3 gap-x-2 gap-y-5';
const SECTION_TITLE = 'text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3';

export default function BottomSheetMenu({
  isOpen,
  onClose,
  visibleMenus,
  currentView,
  navigate,
  role,
  onLogout,
  onAction,
  badges = {},
}) {
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [editTab, setEditTab] = useState('ringkas');   // 'ringkas' | 'diperluas' (hanya saat mengatur)
  const [expanded, setExpanded] = useState(false);     // "Lainnya" sedang dibuka
  const [layout, setLayout] = useState(() => readMenuLayout(role));
  useEffect(() => { setLayout(readMenuLayout(role)); }, [role]);
  useEffect(() => { if (!isOpen) { setEditing(false); setEditTab('ringkas'); setExpanded(false); } }, [isOpen]);
  // simpan tiap tata letak berubah (null = tata letak bawaan, tidak ada yang disimpan)
  useEffect(() => { if (layout) saveMenuLayout(role, layout); }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps -- cuma saat tata letak berubah, bukan saat role ganti

  // ── Sinkron ke server (lintas perangkat) ──
  const fetchedRef = useRef(false);     // sudah berhasil membaca server sejak menu dibuka (jangan kirim sebelum itu: bisa menimpa tata letak baru dengan yang basi)
  const syncedRef = useRef(undefined);  // JSON tata letak yang diketahui ada di server ('null' = belum ada)
  const dirtyRef = useRef(false);       // ada perubahan lokal yang belum terkirim (mis. diubah saat offline)
  const editingRef = useRef(false);
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => { editingRef.current = editing; }, [editing]);

  const { compact, expanded: allMenus, hidden } = useMemo(() => resolveMenuLayout(visibleMenus, layout), [visibleMenus, layout]);
  const hiddenBadge = useMemo(() => hidden.reduce((n, m) => n + (badges[m.id] || 0), 0), [hidden, badges]);
  const hiddenActive = hidden.some((m) => m.id === currentView);

  const change = (fn) => { dirtyRef.current = true; setLayout((prev) => fn(visibleMenus, prev)); };
  const { drag, registerRef, startDrag } = useGridReorder({
    onMove: (from, to) => change((items, prev) => (editTab === 'ringkas' ? moveCompact(items, prev, from, to) : moveExpanded(items, prev, from, to))),
  });
  const draggedItem = drag ? visibleMenus.find((m) => m.id === drag.id) : null;

  useEffect(() => {
    if (!isOpen) { fetchedRef.current = false; return undefined; }
    let cancelled = false;
    fetchMenuOrder(supabase, role).then((remote) => {
      if (cancelled || remote === undefined) return;   // offline/galat: pakai tata letak lokal
      syncedRef.current = remote ? JSON.stringify(remote) : 'null';
      fetchedRef.current = true;
      if (remote && !dirtyRef.current && !editingRef.current) setLayout(remote);   // server menang, kecuali ada perubahan lokal yang belum terkirim
      else setSyncTick((t) => t + 1);                                              // kirim tata letak lokal ke server
    });
    return () => { cancelled = true; };
  }, [isOpen, role]);
  useEffect(() => {
    if (!layout || drag || !fetchedRef.current) return undefined;
    const json = JSON.stringify(layout);
    if (json === syncedRef.current) return undefined;
    const t = setTimeout(async () => {
      if (await pushMenuOrder(supabase, role, layout)) { syncedRef.current = json; dirtyRef.current = false; }
    }, 500);
    return () => clearTimeout(t);
  }, [layout, drag, role, syncTick]);

  const handleSelect = (id) => {
    if (editing) return;
    const item = visibleMenus.find((m) => m.id === id);
    if (item?.action) {   // tile aksi (mis. Persetujuan): membuka sheet, bukan pindah layar
      onClose();
      onAction?.(item.action);
      return;
    }
    if (item?.href) {   // menu tautan (mis. HPP): pindah halaman di tab yang sama, Back kembali ke POS
      leaveForHref(item.href);   // laci TIDAK ditutup manual: halaman ini akan diganti
      return;
    }
    navigate(id);
    onClose();
  };
  const handleReset = () => {
    clearMenuOrder(role); setLayout(null); dirtyRef.current = false;
    deleteMenuOrder(supabase, role).then((ok) => { if (ok) syncedRef.current = 'null'; });
  };

  /**
   * Satu tile di tampilan biasa. `delay` (detik) = masuknya tertunda sekian detik (animasi masuk/keluar/pindah grid
   * ringkas↔Lainnya, lihat `tileMotion`).
   */
  const renderTile = (item, { delay = 0 } = {}) => (
    <motion.div key={item.id} className="relative" {...tileMotion(delay, reduce)}>
      <button
        data-testid={`menu-${item.id}`}
        onClick={() => handleSelect(item.id)}
        className="w-full flex flex-col items-center gap-2 group rounded-2xl select-none"
      >
        <MenuTile item={item} isActive={currentView === item.id} badge={badges[item.id] || 0} />
      </button>
    </motion.div>
  );

  /**
   * Satu tile di mode Atur. `draggable` = bisa digeser; `pin` = 'on' | 'off' | undefined (tombol −/+); `onTap` = aksi ketuk
   * (ketuk menu di Lainnya = tampilkan di menu ringkas); `shared` = tab Ringkas: `layoutId` yang sama di kedua grid, jadi
   * tile yang pindah bagian TERBANG dari grid satu ke grid lain.
   * Sel luar (`div`) polos dan itulah yang didaftarkan ke `useGridReorder` (posisi akhir tata letak); yang meluncur adalah
   * `motion.div` di dalamnya.
   */
  const renderEditTile = (item, { draggable = false, pin, onTap, shared = false } = {}) => {
    const isDragged = drag?.id === item.id;
    const ring = draggable ? 'py-1 cursor-grab ring-1 ring-dashed ring-accent-300 dark:ring-accent-500/40' : 'py-1 ring-1 ring-dashed ring-slate-200 dark:ring-slate-700';
    return (
      <div key={item.id} ref={draggable ? registerRef(item.id) : undefined} data-testid={`menu-cell-${item.id}`}>
        <motion.div
          layout="position" layoutId={shared ? `r-${item.id}` : undefined} className="relative"
          transition={{ layout: reduce ? { duration: 0 } : { duration: 0.25, ease: EASE } }}
        >
          <button
            data-testid={`menu-${item.id}`}
            onClick={onTap || (() => {})}
            onPointerDown={draggable ? startDrag(item.id) : undefined}
            style={draggable ? { touchAction: 'none' } : undefined}
            className={`w-full flex flex-col items-center gap-2 group rounded-2xl select-none ${ring} ${isDragged ? 'opacity-30' : ''}`}
          >
            <MenuTile item={item} isActive={currentView === item.id} badge={badges[item.id] || 0} />
          </button>
          {pin && (
            <PinToggle id={item.id} label={item.label} pinned={pin === 'on'} onClick={() => change((items, prev) => togglePin(items, prev, item.id))} />
          )}
        </motion.div>
      </div>
    );
  };

  const showLainnyaTile = hidden.length > 0;
  // Tile yang baru muncul saat Lainnya dibuka (bukan menu ringkas) masuk bergantian menurut urutannya di grid.
  const extraIds = useMemo(() => {
    const keep = new Set(compact.map((m) => m.id));
    return allMenus.filter((m) => !keep.has(m.id)).map((m) => m.id);
  }, [compact, allMenus]);
  const gridMenus = expanded || !showLainnyaTile ? allMenus : compact;
  const delayOf = (id) => { const i = extraIds.indexOf(id); return i < 0 ? 0 : staggerDelay(i); };   // menu ringkas tidak tertunda

  return (
    <Modal isOpen={isOpen} onClose={onClose} sheet size="lg" maxHeight className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between min-h-8 mb-3">
          <button
            type="button"
            data-testid="menu-keluar"
            onClick={() => { onClose(); onLogout(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 active:scale-95 transition-all"
          >
            <LogOut className="w-3 h-3" />Keluar
          </button>
          <div className="flex items-center gap-1">
            {editing && (
              <button type="button" onClick={handleReset} data-testid="menu-reset"
                className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-500 dark:text-slate-400 active:scale-95 transition-all">Reset</button>
            )}
            <button type="button" onClick={() => setEditing((v) => !v)} data-testid="menu-atur"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-all ${editing ? 'bg-accent-600 text-white' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>
              {!editing && <Pencil className="w-3 h-3" />}{editing ? 'Selesai' : 'Atur'}
            </button>
          </div>
        </div>

        {/* Satu AnimatedHeight untuk semua isi (tampilan biasa / Atur / tab): ganti mode atau tab = pudar bergantian,
            tinggi sheet menyesuaikan dengan halus. */}
        <AnimatedHeight watch={`${editing}:${editTab}:${expanded}:${gridMenus.length}`}>
          <AnimatePresence initial={false} mode="wait">
            {editing ? (
              <motion.div key="edit" {...fadeMotion(reduce)}>
                <SegmentedControl
                  size="sm"
                  className="mb-2"
                  value={editTab}
                  onChange={setEditTab}
                  options={[{ value: 'ringkas', label: 'Ringkas' }, { value: 'diperluas', label: 'Diperluas' }]}
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4" data-testid="menu-edit-hint">
                  {editTab === 'ringkas'
                    ? 'Pilih menu yang tampil di atas dan atur urutannya. Sisanya masuk Lainnya.'
                    : 'Atur urutan semua menu saat Lainnya dibuka.'}
                </p>

                <AnimatePresence initial={false} mode="wait">
                  {editTab === 'ringkas' ? (
                    <motion.div key="tab-ringkas" {...fadeMotion(reduce)}>
                      <p className={SECTION_TITLE}>Menu ringkas</p>
                      <div className={GRID} data-no-swipe="" data-testid="menu-grid">
                        {compact.map((item) => renderEditTile(item, { draggable: true, pin: 'on', shared: true }))}
                        <motion.div
                          layout="position" className="flex flex-col items-center gap-2 py-1 rounded-2xl ring-1 ring-dashed ring-slate-200 dark:ring-slate-700 opacity-60"
                          transition={{ layout: reduce ? { duration: 0 } : { duration: 0.25, ease: EASE } }} data-testid="menu-lainnya-fixed"
                        >
                          <MenuTile item={LAINNYA} isActive={false} />
                        </motion.div>
                      </div>

                      <p className={`${SECTION_TITLE} mt-6`}>Di dalam Lainnya{hidden.length > 0 ? ` (${hidden.length})` : ''}</p>
                      {hidden.length > 0 ? (
                        <div className={GRID} data-no-swipe="" data-testid="menu-hidden-grid">
                          {hidden.map((item) => renderEditTile(item, { pin: 'off', shared: true, onTap: () => change((items, prev) => togglePin(items, prev, item.id)) }))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 dark:text-slate-500">Semua menu tampil di menu ringkas, jadi tile Lainnya disembunyikan.</p>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div key="tab-diperluas" {...fadeMotion(reduce)}>
                      <div className={GRID} data-no-swipe="" data-testid="menu-grid">
                        {allMenus.map((item) => renderEditTile(item, { draggable: true }))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div key="view" {...fadeMotion(reduce)}>
                {/* Grid menu 3 kolom: ringkas (menu pilihan + Lainnya) atau semua menu bila Lainnya dibuka.
                    popLayout: tile yang keluar langsung lepas dari alur grid (memudar di tempatnya), jadi sisanya tidak menunggu. */}
                <div className={`${GRID} relative`} data-testid="menu-grid">
                  <AnimatePresence initial={false} mode="popLayout">
                    {gridMenus.map((item) => renderTile(item, { delay: delayOf(item.id) }))}
                    {!expanded && showLainnyaTile && (
                      <motion.div key={LAINNYA.id} className="relative" {...tileMotion(0.1, reduce)}>
                        <button
                          type="button"
                          data-testid="menu-lainnya"
                          aria-expanded="false"
                          onClick={() => setExpanded(true)}
                          className="w-full flex flex-col items-center gap-2 group rounded-2xl select-none"
                        >
                          <MenuTile item={LAINNYA} isActive={hiddenActive} badge={hiddenBadge} />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* Tombol Ringkas hanya memudar (popLayout, padding bukan margin supaya posisi keluarnya tepat): ruangnya
                    sudah dihitung AnimatedHeight, jadi tinggi sheet yang bergerak halus, bukan tombolnya sendiri. */}
                <div className="relative">
                  <AnimatePresence initial={false} mode="popLayout">
                    {expanded && showLainnyaTile && (
                      <motion.div
                        key="ringkas"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.25, delay: reduce ? 0 : 0.1 } }}
                        exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
                        className="flex justify-center pt-5"
                      >
                        <button
                          type="button"
                          data-testid="menu-ringkas"
                          aria-expanded="true"
                          onClick={() => setExpanded(false)}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 active:scale-95 transition-all"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />Ringkas
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </AnimatedHeight>

        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">Masuk sebagai <span className="font-bold text-slate-600 dark:text-slate-300" data-testid="role-label">{roleLabel(role)}</span></p>
          <p className="text-center text-[11px] text-slate-300 dark:text-slate-600" data-testid="app-version">{versionLabel()}</p>
        </div>
      </div>
      {drag && draggedItem && createPortal(
        <GhostTile drag={drag} item={draggedItem} isActive={currentView === draggedItem.id} reduce={reduce} />,
        document.body
      )}
    </Modal>
  );
}
