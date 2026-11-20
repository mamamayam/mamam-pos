/**
 * Saklar (pola sama dengan saklar Dompet): ketuk = `onToggle`. Dipakai mode stok opname dan "Harga per item" di form Pengeluaran.
 * `size="sm"` = versi kecil (38×22) untuk di samping label baris form; bawaan tetap ukuran Dompet (56×32).
 */
export default function Switch({ on, onToggle, disabled, label, testId, size = 'md' }) {
  const sm = size === 'sm';
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled} data-testid={testId}
      className={`relative ${sm ? 'h-[22px] w-[38px]' : 'h-8 w-14'} shrink-0 rounded-full transition-all duration-300 active:scale-95 disabled:opacity-60 ${on ? 'bg-gradient-to-r from-accent-600 to-accent-500 dark:from-accent-500 dark:to-accent-600 shadow-[0_4px_14px_rgba(var(--color-accent-500),0.3)]' : 'bg-slate-200 dark:bg-slate-700'}`}
    >
      <span className={`absolute ${sm ? 'top-[2px] left-[2px] h-[18px] w-[18px]' : 'top-1 left-1 h-6 w-6'} rounded-full bg-white shadow-md transition-transform duration-300 ${on ? (sm ? 'translate-x-4' : 'translate-x-6') : ''}`} />
    </button>
  );
}
