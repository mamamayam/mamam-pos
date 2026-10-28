import React, { useState, useEffect, useMemo, useRef } from 'react';
import { leaveForHref } from '../../lib/appMode';
import { createPortal } from 'react-dom';
import { LogOut, Pencil, Ellipsis, ChevronUp, Minus, Plus } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import SegmentedControl from '../../components/ui/SegmentedControl';
import {
  resolveMenuLayout, togglePin, moveCompact, moveExpanded,
  readMenuLayout, saveMenuLayout, clearMenuOrder,
} from './menuOrder';
import { useGridReorder } from './useGridReorder';
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
 */

const LAINNYA = { id: 'lainnya', icon: Ellipsis, label: 'Lainnya' };

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
   * Satu tile. `draggable` = bisa digeser (mode Atur); `pin` = 'on' | 'off' | undefined (tombol −/+ di mode Atur);
   * `onTap` menggantikan aksi ketuk bawaan (mis. mode Atur: ketuk menu di Lainnya = tampilkan di menu ringkas).
   */
  const renderTile = (item, { draggable = false, pin, onTap } = {}) => {
    const isActive = currentView === item.id;
    const isDragged = drag?.id === item.id;
    const ring = editing ? (draggable ? 'py-1 cursor-grab ring-1 ring-dashed ring-accent-300 dark:ring-accent-500/40' : 'py-1 ring-1 ring-dashed ring-slate-200 dark:ring-slate-700') : '';
    return (
      <div key={item.id} className="relative">
        <button
          ref={draggable ? registerRef(item.id) : undefined}
          data-testid={`menu-${item.id}`}
          onClick={onTap || (() => handleSelect(item.id))}
          onPointerDown={editing && draggable ? startDrag(item.id) : undefined}
          style={editing && draggable ? { touchAction: 'none' } : undefined}
          className={`w-full flex flex-col items-center gap-2 group rounded-2xl select-none ${ring} ${isDragged ? 'opacity-30' : ''}`}
        >
          <MenuTile item={item} isActive={isActive} badge={badges[item.id] || 0} />
        </button>
        {editing && pin && (
          <PinToggle id={item.id} label={item.label} pinned={pin === 'on'} onClick={() => change((items, prev) => togglePin(items, prev, item.id))} />
        )}
      </div>
    );
  };

  const showLainnyaTile = hidden.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} sheet size="lg" maxHeight className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-end min-h-8 mb-3">
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

        {editing ? (
          <>
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

            {editTab === 'ringkas' ? (
              <>
                <p className={SECTION_TITLE}>Menu ringkas</p>
                <div className={GRID} data-no-swipe="" data-testid="menu-grid">
                  {compact.map((item) => renderTile(item, { draggable: true, pin: 'on' }))}
                  <div className="flex flex-col items-center gap-2 py-1 rounded-2xl ring-1 ring-dashed ring-slate-200 dark:ring-slate-700 opacity-60" data-testid="menu-lainnya-fixed">
                    <MenuTile item={LAINNYA} isActive={false} />
                  </div>
                </div>

                <p className={`${SECTION_TITLE} mt-6`}>Di dalam Lainnya{hidden.length > 0 ? ` (${hidden.length})` : ''}</p>
                {hidden.length > 0 ? (
                  <div className={GRID} data-no-swipe="" data-testid="menu-hidden-grid">
                    {hidden.map((item) => renderTile(item, { pin: 'off', onTap: () => change((items, prev) => togglePin(items, prev, item.id)) }))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Semua menu tampil di menu ringkas, jadi tile Lainnya disembunyikan.</p>
                )}
              </>
            ) : (
              <div className={GRID} data-no-swipe="" data-testid="menu-grid">
                {allMenus.map((item) => renderTile(item, { draggable: true }))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Grid menu 3 kolom: ringkas (menu pilihan + Lainnya) atau semua menu bila Lainnya dibuka */}
            <div className={GRID} data-testid="menu-grid">
              {(expanded || !showLainnyaTile ? allMenus : compact).map((item) => renderTile(item))}
              {!expanded && showLainnyaTile && (
                <button
                  type="button"
                  data-testid="menu-lainnya"
                  aria-expanded="false"
                  onClick={() => setExpanded(true)}
                  className="w-full flex flex-col items-center gap-2 group rounded-2xl select-none"
                >
                  <MenuTile item={LAINNYA} isActive={hiddenActive} badge={hiddenBadge} />
                </button>
              )}
            </div>
            {expanded && showLainnyaTile && (
              <div className="flex justify-center mt-5">
                <button
                  type="button"
                  data-testid="menu-ringkas"
                  aria-expanded="true"
                  onClick={() => setExpanded(false)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 active:scale-95 transition-all"
                >
                  <ChevronUp className="w-3.5 h-3.5" />Ringkas
                </button>
              </div>
            )}
          </>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">Masuk sebagai <span className="font-bold text-slate-600 dark:text-slate-300" data-testid="role-label">{roleLabel(role)}</span></p>
          <button
            onClick={() => { onClose(); onLogout(); }}
            className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 py-3 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
          <p className="text-center text-[11px] text-slate-300 dark:text-slate-600" data-testid="app-version">{versionLabel()}</p>
        </div>
      </div>
      {drag && draggedItem && createPortal(
        <div className="fixed z-[9999] pointer-events-none flex flex-col items-center gap-2 opacity-95" data-testid="menu-ghost"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }}>
          <MenuTile item={draggedItem} isActive={currentView === draggedItem.id} ghost />
        </div>,
        document.body
      )}
    </Modal>
  );
}
