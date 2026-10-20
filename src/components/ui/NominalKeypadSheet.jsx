import { useEffect, useRef, useState } from 'react';
import { Calculator } from 'lucide-react';
import NominalDock from './NominalDock';
import NominalCalculator from './NominalCalculator';
import {
  appendKey, backspaceDigits, toggleSign, parseNominal, toDigits, formatNominal,
} from './nominalMath';

/**
 * NominalKeypadSheet — keypad nominal (pengganti keyboard HP). Muncul menempel di
 * dasar layar seperti keyboard biasa (lihat NominalDock), bukan pop-up geser.
 * Layout dari "Preview: Nominal Keypad + Kalkulator Popup": layar angka +
 * ikon kalkulator, lalu 789 / 456 / 123 / 00 0 ⌫ (susunan sama dengan kalkulator).
 * Tampilan SAMA dengan NominalCalculator: palet gelap/oranye SENGAJA tetap
 * (tidak ikut tema aplikasi), seperti kalkulator bawaan HP.
 *
 * Nilai di-commit LIVE ke pemanggil tiap tombol ditekan (seperti mengetik di
 * field biasa); tombol "Selesai" atau Back HP cuma menutup.
 *
 * Props:
 *   value, onChange(digits)  — string digit ('' | '0' | '12000' | '-500')
 *   title          string    — judul kecil di atas layar angka
 *   prefix/suffix  string    — 'Rp' / '%'
 *   allowNegative  boolean   — munculin tombol ± di sebelah ikon kalkulator
 *   calculator     boolean   — munculin ikon kalkulator (default true)
 *   max            number    — batas nilai (mis. 100 untuk persen)
 *   maxDigits      number
 *   hint(number)   function  — teks/elemen bantu di bawah layar angka
 *                              (mis. Kembalian di PaymentModal)
 *   onClose()
 */
const KEY = 'h-11 short:h-10 rounded-2xl text-xl short:text-lg font-medium bg-[#262626] text-[#ECECEC] active:bg-[#3A3A3C] select-none touch-manipulation';
const ICON_BTN = 'p-2 rounded-[10px] text-[#FF9F0A] active:bg-[#3A3A3C] touch-manipulation';

export default function NominalKeypadSheet({
  value, onChange, title, prefix = 'Rp', suffix = '', allowNegative = false,
  calculator = true, max = null, maxDigits, hint, onClose,
}) {
  const digitsRef = useRef(toDigits(value));
  const [digits, setDigits] = useState(digitsRef.current);
  const [calcOpen, setCalcOpen] = useState(false);
  // Kalkulator dibiarkan terpasang setelah ditutup (supaya animasi keluar jalan); `key` baru
  // tiap dibuka = state hitungan segar dari nilai field saat ini.
  const [calcSession, setCalcSession] = useState(0);
  const openCalc = () => { setCalcSession((n) => n + 1); setCalcOpen(true); };

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const opts = { max, ...(maxDigits ? { maxDigits } : {}) };

  const commit = (next) => {
    if (next === digitsRef.current) return;
    digitsRef.current = next;
    setDigits(next);
    onChangeRef.current?.(next);
  };

  const press = (key) => commit(appendKey(digitsRef.current, key, opts));
  const backspace = () => commit(backspaceDigits(digitsRef.current));

  // Keyboard fisik (laptop/tablet): angka, Backspace, Enter = Selesai.
  // Mati selama kalkulator terbuka supaya ketikan tidak masuk dua tempat.
  useEffect(() => {
    if (calcOpen) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); commit(appendKey(digitsRef.current, e.key, opts)); }
      else if (e.key === 'Backspace') { e.preventDefault(); commit(backspaceDigits(digitsRef.current)); }
      else if (e.key === 'Enter') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcOpen, max, maxDigits, onClose]);

  const number = parseNominal(digits);
  const empty = digits === '';

  return (
    <>
      <NominalDock onClose={onClose} hidden={calcOpen}>
        <div className="bg-black border-t border-[#1C1C1E] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] max-h-[100dvh] overflow-y-auto">
         <div className="w-full max-w-md mx-auto">

          {/* Judul dan angka satu baris (judul kecil di kiri) supaya keypad tidak memakan separuh layar. */}
          <div className="flex items-center gap-2 rounded-2xl pl-2 pr-1 py-1">
            {title && (
              <div className="shrink-0 max-w-[34%] text-xs font-bold text-[#8E8E93] uppercase tracking-wider truncate">{title}</div>
            )}
            <div
              data-testid="nominal-display"
              className={`flex-1 text-right text-3xl font-medium overflow-x-auto whitespace-nowrap hide-scrollbar ${
                empty ? 'text-[#8E8E93]' : 'text-white'
              }`}
            >
              {formatNominal(number, { prefix, suffix })}
            </div>
            {allowNegative && (
              <button type="button" aria-label="Ganti plus/minus" onClick={() => commit(toggleSign(digitsRef.current))} className={ICON_BTN}>
                <span className="block w-5 text-center text-lg font-bold leading-5">±</span>
              </button>
            )}
            {calculator && (
              <button type="button" aria-label="Buka kalkulator" onClick={openCalc} className={ICON_BTN}>
                <Calculator className="w-5 h-5" />
              </button>
            )}
          </div>

          {hint && (
            <div className="px-1 text-xs font-bold text-[#8E8E93]">{hint(number)}</div>
          )}

          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k) => (
              <button key={k} type="button" className={KEY} onClick={() => press(k)}>{k}</button>
            ))}
            <button type="button" className={KEY} onClick={() => press('00')}>00</button>
            <button type="button" className={KEY} onClick={() => press('0')}>0</button>
            <button type="button" className={KEY} aria-label="Hapus" onClick={backspace}>⌫</button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full h-11 rounded-[14px] bg-accent-600 dark:bg-accent-500 text-white text-sm font-bold select-none touch-manipulation"
          >
            Selesai
          </button>
         </div>
        </div>
      </NominalDock>

      {calcSession > 0 && (
        <NominalCalculator
          key={calcSession}
          open={calcOpen}
          initialDigits={digits}
          prefix={prefix}
          suffix={suffix}
          allowNegative={allowNegative}
          onClose={() => setCalcOpen(false)}
          onApply={(result) => { commit(result); setCalcOpen(false); }}
        />
      )}
    </>
  );
}
