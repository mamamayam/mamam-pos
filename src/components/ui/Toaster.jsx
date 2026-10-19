import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, AlertCircle } from 'lucide-react';
import { subscribeToast, dismissToast, getToast } from '../../lib/toast';

/**
 * Toaster — menampilkan toast dari lib/toast.js. Dipasang sekali di main.jsx (bersama ExitToast).
 * Muncul di BAGIAN ATAS layar (di bawah poni), bukan di bawah, supaya tetap terlihat saat sheet form
 * terbuka dan tidak tertutup keyboard/keypad. Ikon centang "memantul" masuk sebagai tanda form selesai.
 * Tidak menangkap sentuhan (pointer-events-none) dan berada di atas modal (z-[400]).
 */
export default function Toaster() {
  const [toast, setToast] = useState(() => getToast());

  useEffect(() => subscribeToast(setToast), []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast]);

  const ok = toast?.type !== 'error';
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[400] flex justify-center px-4 top-[calc(env(safe-area-inset-top,0px)+0.75rem)]"
      role="status" aria-live="polite" data-testid="toaster"
    >
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="flex max-w-sm items-center gap-2.5 rounded-2xl bg-slate-900/95 py-2.5 pl-2.5 pr-4 text-sm font-semibold text-white shadow-lg"
          >
            <motion.span
              initial={{ scale: 0.3, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 14, delay: 0.05 }}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
            >
              {ok ? <Check className="h-4 w-4" strokeWidth={3} /> : <AlertCircle className="h-4 w-4" />}
            </motion.span>
            <span className="min-w-0 leading-snug">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
