import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import useBackLayer from '../../hook/useBackLayer';
import Overlay from './Overlay';
import Button from './Button';

/**
 * Modal — komponen global untuk semua dialog overlay.
 *
 * Props:
 *   isOpen        boolean              — tampilkan modal
 *   onClose       () => void           — callback close (backdrop click / tombol X)
 *   children      ReactNode
 *   title         string               — judul di header modal (opsional)
 *   size          'xs' | 'sm' | 'md' | 'lg'  — lebar dialog (default: 'sm')
 *   zLevel        'modal' | 'top' | 'pin'  — level tumpukan (default: 'modal')
 *   sheet         boolean              — gunakan bottom sheet style (mobile-friendly)
 *   side          'right' | 'top'      — panel slide dari kanan (full-height) atau dari atas (dropdown, di bawah header)
 *   closeOnBackdrop boolean            — close saat klik backdrop (default: true)
 *   maxHeight     boolean              — batasi tinggi + scroll inner (default: false, gak dipakai kalau side dipakai karena udah diatur sendiri per-variant)
 *   className     string               — class tambahan untuk container dialog
 *   dirty         boolean              — isian form sudah berubah dan belum disimpan (lihat hook/useDirty.js).
 *                                        Selama true, menutup lewat X, ketuk latar, tarik ke bawah, ATAU tombol
 *                                        Back HP tidak langsung menutup: muncul konfirmasi "Isian belum disimpan"
 *                                        (Lanjut Isi / Buang). Penutupan oleh kode (mis. setelah simpan berhasil
 *                                        memanggil onClose langsung / isOpen jadi false) tidak ditanya.
 *
 * Animasi: semua varian punya animasi masuk & keluar (lihat Overlay.jsx). Bottom sheet
 * muncul dari bawah, keluar ke bawah, dan bisa di-swipe turun untuk menutup.
 *
 * Z-index:
 *   modal → z-[60]   : modal umum (CategoryModal, PaymentModal, dll)
 *   top   → z-[100]  : alert/confirm global (App.jsx)
 *   pin   → z-[300]  : PinModal
 *
 * Contoh:
 *   <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Edit Kategori">
 *     <p>Konten di sini</p>
 *   </Modal>
 *
 *   // Bottom sheet
 *   <Modal isOpen={isOpen} onClose={onClose} sheet size="md">
 *     ...
 *   </Modal>
 *
 *   // Panel slide dari kanan
 *   <Modal isOpen={isOpen} onClose={onClose} side="right" size="md">
 *     ...
 *   </Modal>
 *
 *   // Panel drop-down dari atas (bell notifikasi, dll)
 *   <Modal isOpen={isOpen} onClose={onClose} side="top">
 *     ...
 *   </Modal>
 */

const Z_LEVELS = {
  modal: 'z-[60]',
  top: 'z-[100]',
  pin: 'z-[300]',
};

const SIZES = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

const CLOSE_BTN = 'p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 hover:bg-accent-100 dark:hover:bg-accent-500/20 hover:text-accent-600 dark:hover:text-accent-400 active:scale-95 transition-all duration-300 shrink-0';

/**
 * Konfirmasi buang isian: dialog kecil di atas semua modal (zLevel top). Back/X/ketuk latar = "Lanjut Isi".
 * Memakai Modal biasa (tanpa `dirty`), jadi ikut animasi dan lapisan Back seperti dialog lain.
 */
function DiscardConfirm({ open, onKeep, onDiscard }) {
  return (
    <Modal isOpen={open} onClose={onKeep} size="xs" zLevel="top">
      <div className="p-5" data-testid="discard-confirm">
        <p className="font-heading font-bold text-slate-900 dark:text-slate-50 mb-1">Isian belum disimpan</p>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Kalau ditutup sekarang, yang sudah kamu isi akan hilang.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="danger" onClick={onDiscard} data-testid="discard-buang">Buang</Button>
          <Button onClick={onKeep} data-testid="discard-lanjut">Lanjut Isi</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Modal(props) {
  const { isOpen, onClose, dirty = false } = props;
  const guarded = Boolean(dirty && onClose);
  const [asking, setAsking] = useState(false);

  // Modal ditutup oleh kode (simpan berhasil, pindah layar): konfirmasi ikut hilang.
  useEffect(() => { if (!isOpen) setAsking(false); }, [isOpen]);
  // Isian kembali bersih (mis. form dikosongkan) saat konfirmasi tampil: tidak perlu bertanya lagi.
  useEffect(() => { if (!guarded) setAsking(false); }, [guarded]);

  const requestClose = useCallback(() => setAsking(true), []);
  const keep = useCallback(() => setAsking(false), []);
  const discard = useCallback(() => { setAsking(false); onClose?.(); }, [onClose]);

  return (
    <>
      <ModalFrame {...props} onClose={guarded ? requestClose : onClose} guardClose={guarded} />
      {guarded && <DiscardConfirm open={asking} onKeep={keep} onDiscard={discard} />}
    </>
  );
}

function ModalFrame({
  isOpen,
  onClose,
  children,
  title,
  size = 'sm',
  zLevel = 'modal',
  sheet = false,
  side,
  closeOnBackdrop = true,
  maxHeight = false,
  className = '',
  guardClose = false,
}) {
  // Tombol Back browser/HP menutup modal ini (sama dengan menekan X), bukan keluar dari layar.
  // Form yang minta konfirmasi (guardClose) memasang ulang lapisannya kalau Back tidak jadi menutupnya.
  useBackLayer(isOpen && Boolean(onClose), onClose, { rearm: guardClose });

  const z = Z_LEVELS[zLevel] ?? Z_LEVELS.modal;
  const sizeClass = SIZES[size] ?? SIZES.sm;

  // ── Side drawer (slide dari kanan, full-height) ──────────────────────────
  if (side === 'right') {
    return (
      <Overlay
        open={isOpen} onClose={onClose} variant="right" z={z} closeOnBackdrop={closeOnBackdrop} guardClose={guardClose}
        panelClass={`bg-white dark:bg-slate-900 h-full w-full ${sizeClass} shadow-2xl flex flex-col ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 p-5 pb-3 shrink-0 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-heading font-bold text-slate-900 dark:text-slate-50 text-lg min-w-0 truncate">{title}</h3>
            {onClose && <button onClick={onClose} className={CLOSE_BTN}><X className="w-4 h-4" /></button>}
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </Overlay>
    );
  }

  // ── Top drawer (drop-down dari atas, di bawah header) ────────────────────
  if (side === 'top') {
    return (
      <Overlay
        open={isOpen} onClose={onClose} variant="top" z={z} closeOnBackdrop={closeOnBackdrop} guardClose={guardClose}
        panelClass={`bg-white dark:bg-slate-900 w-full max-h-[75dvh] shadow-2xl rounded-b-3xl flex flex-col ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 p-5 pb-3 shrink-0 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-heading font-bold text-slate-900 dark:text-slate-50 text-lg min-w-0 truncate">{title}</h3>
            {onClose && <button onClick={onClose} className={CLOSE_BTN}><X className="w-4 h-4" /></button>}
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </Overlay>
    );
  }

  // ── Bottom sheet: naik dari bawah, turun ke bawah, bisa di-swipe turun ───
  if (sheet) {
    return (
      <Overlay
        open={isOpen} onClose={onClose} variant="sheet" z={z} closeOnBackdrop={closeOnBackdrop} guardClose={guardClose}
        panelClass={`bg-white dark:bg-slate-900 w-full ${sizeClass} rounded-t-3xl ${maxHeight ? 'max-h-[90dvh] flex flex-col' : ''} ${className}`}
      >
        {/* Handle bar */}
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0" />
        {title && (
          <div className="flex items-center justify-between px-5 py-3 shrink-0">
            <h3 className="font-heading font-bold text-slate-900 dark:text-slate-50 text-base">{title}</h3>
            {onClose && <button onClick={onClose} className={CLOSE_BTN}><X className="w-4 h-4" /></button>}
          </div>
        )}
        <div className={maxHeight ? 'overflow-y-auto flex-1' : ''}>{children}</div>
      </Overlay>
    );
  }

  // ── Dialog (default) ─────────────────────────────────────────────────────
  return (
    <Overlay
      open={isOpen} onClose={onClose} variant="center" z={z} closeOnBackdrop={closeOnBackdrop} guardClose={guardClose}
      panelClass={`bg-white dark:bg-slate-900 ${sizeClass} w-full rounded-3xl shadow-2xl ${maxHeight ? 'max-h-[90dvh] flex flex-col' : ''} ${className}`}
    >
      {title && (
        <div className="flex items-start justify-between gap-3 p-5 pb-0 shrink-0">
          <h3 className="font-heading font-bold text-slate-900 dark:text-slate-50 text-lg min-w-0 truncate">{title}</h3>
          {onClose && <button onClick={onClose} className={CLOSE_BTN}><X className="w-4 h-4" /></button>}
        </div>
      )}
      <div className={maxHeight ? 'overflow-y-auto flex-1' : ''}>{children}</div>
    </Overlay>
  );
}
