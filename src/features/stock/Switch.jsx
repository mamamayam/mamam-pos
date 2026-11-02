/** Saklar (pola sama dengan saklar Dompet): ketuk = `onToggle`. Dipakai mode stok opname. */
export default function Switch({ on, onToggle, disabled, label, testId }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled} data-testid={testId}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-all duration-300 active:scale-95 disabled:opacity-60 ${on ? 'bg-gradient-to-r from-accent-600 to-accent-500 dark:from-accent-500 dark:to-accent-600 shadow-[0_4px_14px_rgba(var(--color-accent-500),0.3)]' : 'bg-slate-200 dark:bg-slate-700'}`}
    >
      <span className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 ${on ? 'translate-x-6' : ''}`} />
    </button>
  );
}
