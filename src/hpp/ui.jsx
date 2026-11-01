import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { parseAngka, rupiah, persen } from './hppFormat'
import Overlay from '../components/ui/Overlay'
import { useBackLayer } from './hppBackStack'
import './hppAnim.css'

/** Potongan tampilan bersama halaman HPP. Gaya mengikuti app (accent, slate, rounded-2xl, font-heading). */

export const WARNA_BAR = ['#f97316', '#fb923c', '#fdba74', '#94a3b8']

const TIER_STYLE = {
  HIGH: 'bg-emerald-50 text-emerald-700',
  SEDANG: 'bg-blue-50 text-blue-700',
  LOW: 'bg-amber-50 text-amber-700',
}

export function TierBadge({ tier, pct }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${TIER_STYLE[tier] || TIER_STYLE.LOW}`}>
      {pct !== undefined ? `${persen(pct)} ` : ''}{tier}
    </span>
  )
}

/** Selisih rupiah: naik (modal makin mahal) oranye, turun hijau. Tidak tampil kalau hampir nol. */
export function Delta({ value, className = '' }) {
  if (value === null || value === undefined || Math.abs(value) < 0.5) return null
  const naik = value > 0
  return (
    <span className={`font-bold tabular-nums ${naik ? 'text-accent-600' : 'text-emerald-600'} ${className}`}>
      {naik ? '▲ +' : '▼ '}{rupiah(Math.abs(value))}
    </span>
  )
}

export function Chip({ on, onClick, children, className = '' }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex-none whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        on ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function ChipRow({ children }) {
  return <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">{children}</div>
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-slate-400 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20">
      <Search size={16} aria-hidden="true" />
      <input
        type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2.5 font-medium text-slate-800 outline-none placeholder:text-slate-400"
      />
    </label>
  )
}

export function Card({ children, className = '', padded = false }) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white shadow-sm ${padded ? 'p-4' : 'px-4'} ${className}`}>
      {children}
    </div>
  )
}

export function SectionLabel({ children, className = '' }) {
  return <div className={`text-xs font-bold uppercase tracking-wider text-slate-400 ${className}`}>{children}</div>
}

/** Satu baris daftar dengan garis pemisah. */
export function Row({ children, onClick, className = '' }) {
  const base = `flex items-center justify-between gap-3 border-t border-slate-100 py-2.5 first:border-t-0 ${className}`
  return onClick
    ? <button type="button" onClick={onClick} className={`${base} w-full text-left active:opacity-70`}>{children}</button>
    : <div className={base}>{children}</div>
}

/**
 * Status isian angka. `draft` = teks yang sedang diketik (null = belum diubah), `value` = nilai tersimpan.
 * Murni (dites): `kotor` = ada ketikan yang belum disimpan, `bisaSimpan` = angkanya valid dan beda dari yang tersimpan.
 */
export function statusIsian(draft, value) {
  if (draft === null) return { kotor: false, valid: false, bisaSimpan: false, nilai: null }
  const nilai = parseAngka(draft)
  return { kotor: true, valid: nilai !== null, bisaSimpan: nilai !== null && nilai !== value, nilai }
}

/**
 * Isian angka dengan tombol Simpan. Mengetik hanya mengubah isian; perubahan baru tersimpan saat Simpan (atau Enter)
 * ditekan. Keluar dari kolom TIDAK menyimpan. Batal (atau Esc) mengembalikan angka semula.
 * `onCommit` boleh async: kalau mengembalikan false (gagal), isian tetap terbuka supaya bisa dicoba lagi.
 * `suffix` = teks satuan di samping kolom. `awal` = isian awal (hanya untuk tes).
 */
export function NumberField({ value, onCommit, ariaLabel, placeholder = '', className = '', align = 'right', gelap = false, suffix = null, awal = null }) {
  const [draft, setDraft] = useState(awal)
  const [menyimpan, setMenyimpan] = useState(false)
  const s = statusIsian(draft, value)
  const batal = () => setDraft(null)
  const simpan = async () => {
    if (!s.bisaSimpan || menyimpan) return
    setMenyimpan(true)
    let ok
    try { ok = await onCommit(s.nilai) } finally { setMenyimpan(false) }
    if (ok !== false) setDraft(null)
  }
  const tombol = 'rounded-xl px-3 py-1 text-xs font-bold transition-transform active:scale-95 disabled:opacity-45'
  return (
    <span className={`inline-flex flex-col gap-1.5 ${align === 'right' ? 'items-end' : 'items-start'} ${gelap ? 'w-full' : ''}`}>
      <span className={`flex items-center gap-1.5 ${gelap ? 'w-full' : ''}`}>
        <input
          type="text" inputMode="decimal" aria-label={ariaLabel} placeholder={placeholder} aria-invalid={s.kotor && !s.valid ? 'true' : undefined}
          value={draft ?? (value ?? '')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') simpan()
            if (e.key === 'Escape') batal()
          }}
          className={`w-24 rounded-xl border px-2.5 py-1.5 font-semibold tabular-nums outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 ${
            align === 'right' ? 'text-right' : 'text-left'
          } ${gelap ? 'border-slate-700 bg-slate-800 text-white' : `bg-white ${s.kotor ? (s.valid ? 'border-accent-500 text-accent-700' : 'border-red-400 text-red-600') : 'border-slate-200 text-slate-800'}`} ${className}`}
        />
        {suffix}
      </span>
      {s.kotor && (
        <span className="hpp-reveal flex items-center gap-1.5">
          <button type="button" onClick={batal} disabled={menyimpan} aria-label={`Batal ubah ${ariaLabel}`}
            className={`${tombol} ${gelap ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'}`}>Batal</button>
          <button type="button" onClick={simpan} disabled={!s.bisaSimpan || menyimpan} aria-label={`Simpan ${ariaLabel}`}
            className={`${tombol} bg-gradient-to-r from-accent-600 to-accent-500 text-white shadow shadow-accent-500/30`}>
            {menyimpan ? 'Menyimpan…' : 'Simpan'}
          </button>
        </span>
      )}
    </span>
  )
}

/** Panel gelap berisi angka utama (gaya "dark-elevated" di app). */
export function Hero({ children, className = '' }) {
  return <div className={`mb-3 rounded-3xl bg-slate-900 p-4 text-white shadow-2xl ${className}`}>{children}</div>
}
export function HeroLabel({ children }) {
  return <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{children}</div>
}

/** Bar proporsi + legenda. parts: [{nama, biaya}] */
export function ProporsiBar({ parts, total, gelap = false }) {
  const aktif = parts.filter((p) => p.biaya > 0)
  return (
    <>
      <div className={`my-3 flex h-2 gap-0.5 overflow-hidden rounded-full ${gelap ? 'bg-slate-800' : 'bg-slate-100'}`} role="img" aria-label="Proporsi komponen modal">
        {aktif.map((p, i) => <div key={`${p.kind}-${p.id}-${i}`} style={{ flex: p.biaya, background: WARNA_BAR[i % WARNA_BAR.length] }} />)}
      </div>
      <div className={`flex flex-wrap gap-x-3 gap-y-1 text-xs ${gelap ? 'text-slate-300' : 'text-slate-500'}`}>
        {aktif.map((p, i) => (
          <span key={`${p.kind}-${p.id}-${i}`}>
            <span style={{ color: WARNA_BAR[i % WARNA_BAR.length] }}>●</span> {p.nama} {total > 0 ? Math.round((p.biaya / total) * 100) : 0}%
          </span>
        ))}
      </div>
    </>
  )
}

/** Lama menunggu animasi keluar Overlay (ms, sama dengan `motion.ms` varian responsive). */
export const DURASI_KELUAR_MS = 300

/** Lama menunggu animasi keluar; 0 kalau pengguna meminta gerakan dikurangi. */
export const durasiKeluar = (matchMedia = typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined) =>
  (matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : DURASI_KELUAR_MS)

const TOMBOL_X = 'flex-none rounded-full bg-slate-100 p-2 text-slate-400 transition-all duration-300 hover:bg-accent-100 hover:text-accent-600 active:scale-95'

/**
 * Popup HPP, kerangkanya SAMA dengan popup app utama (`Overlay` varian responsive): lembar putih dari bawah di HP
 * (handle bar, tombol X bulat, bisa ditarik ke bawah untuk menutup), dialog di tengah di laptop.
 * Menutup lewat X, tarik ke bawah, ketuk latar, Esc, atau tombol Back browser/HP: animasi keluar diputar dulu,
 * baru `onClose` dipanggil (induk melepas popup). Selama terbuka, popup menjadi lapisan di stack navigasi
 * (`hppBackStack.js`), jadi Back menutup popup ini, bukan keluar dari halaman.
 * `children` boleh berupa fungsi `(tutup) => ...` supaya isi popup bisa menutup dirinya (dengan animasi keluar) setelah simpan.
 */
export function Sheet({ title, onClose, children, full = false }) {
  const [keluar, setKeluar] = useState(false)
  const timer = useRef(null)
  const tutup = useCallback(() => {
    if (timer.current !== null) return
    setKeluar(true)
    timer.current = setTimeout(onClose, durasiKeluar())
  }, [onClose])
  useEffect(() => () => clearTimeout(timer.current), [])
  useBackLayer(true, tutup)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') tutup() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tutup])
  return (
    <Overlay
      open={!keluar} onClose={tutup} variant="responsive" z="z-50"
      containerClass="items-end md:items-center justify-center md:p-4"
      panelClass={`flex w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:max-w-xl md:rounded-3xl ${
        full ? 'h-[92dvh] md:h-auto md:max-h-[92dvh]' : 'max-h-[92dvh]'
      }`}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto mb-1 mt-3 h-1 w-10 flex-none rounded-full bg-slate-200 md:hidden" aria-hidden="true" />
        <div className="flex flex-none items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="min-w-0 truncate font-heading text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={tutup} aria-label="Tutup" className={TOMBOL_X}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 p-4">
          {typeof children === 'function' ? children(tutup) : children}
        </div>
      </div>
    </Overlay>
  )
}

/**
 * Notif mengambang "Ketuk lagi untuk keluar", SAMA dengan `ExitToast` app utama (teks, bentuk, posisi, z-index,
 * lama animasi 180 ms masuk/keluar). Dibuat ulang tanpa framer-motion (HPP tidak boleh memuat kode POS).
 * Tampil saat Back ditekan di Menu; Back kedua dalam 2 detik meninggalkan HPP (kembali ke POS).
 * `tampil` dari `useExitHint()` (hppBackStack.js). Tidak menangkap sentuhan dan berada di atas popup.
 */
export function NotifKeluar({ tampil }) {
  const [ada, setAda] = useState(tampil)   // tetap terpasang selama animasi keluar
  useEffect(() => {
    if (tampil) { setAda(true); return undefined }
    const t = setTimeout(() => setAda(false), 180)
    return () => clearTimeout(t)
  }, [tampil])
  if (!tampil && !ada) return null
  return (
    <div role="status" aria-live="polite"
      className={`${tampil ? 'hpp-exit-in' : 'hpp-exit-out'} pointer-events-none fixed inset-x-0 z-[400] flex justify-center px-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] short:bottom-[calc(4rem+env(safe-area-inset-bottom))]`}>
      <div className="rounded-full bg-slate-900/95 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
        Ketuk lagi untuk keluar
      </div>
    </div>
  )
}

/** Grafik garis kecil untuk riwayat (nilai urut lama -> baru). Tidak tampil kalau datanya kurang dari dua. */
export function Sparkline({ nilai, className = '' }) {
  if (!nilai || nilai.length < 2) return null
  const min = Math.min(...nilai)
  const rentang = Math.max(...nilai) - min || 1
  const titik = nilai.map((v, i) => `${((i * 100) / (nilai.length - 1)).toFixed(1)},${(24 - ((v - min) / rentang) * 20).toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label="Grafik riwayat" className={`my-1 block h-11 w-full ${className}`}>
      <polyline points={titik} fill="none" stroke={WARNA_BAR[0]} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Perubahan dalam persen: naik (makin mahal) oranye, turun hijau, hampir nol = "stabil". null = tidak tampil. */
export function DeltaPersen({ nilai, className = '' }) {
  if (nilai === null || nilai === undefined || !Number.isFinite(nilai)) return null
  if (Math.abs(nilai) < 0.05) return <span className={`text-xs font-bold text-slate-400 ${className}`}>stabil</span>
  const naik = nilai > 0
  return (
    <span className={`text-xs font-bold tabular-nums ${naik ? 'text-accent-600' : 'text-emerald-600'} ${className}`}>
      {naik ? '▲' : '▼'} {persen(Math.abs(nilai))}
    </span>
  )
}

/** Pil kecil "Belum diisi" (kuning), sama dengan penanda bahan tanpa harga di daftar. */
export function PilBelumDiisi() {
  return <span className="inline-block whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Belum diisi</span>
}

/** Satu kotak angka ringkas (label kecil + nilai). */
export function Sel({ label, children }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="truncate font-bold tabular-nums text-slate-800">{children}</div>
    </div>
  )
}

/** Tombol utama di dalam detail baris (garis oranye). */
export function TombolAksi({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-3 w-full rounded-2xl border-[1.5px] border-accent-500 py-2.5 font-bold text-accent-600 transition-transform active:scale-[0.98]">
      {children}
    </button>
  )
}

/**
 * Isian angka besar dengan tombol − dan + (nyaman ditekan di HP). `value` = teks isian, `onChange(teks)`.
 * `step` = besar langkah tombol. `awalan` / `akhiran` = teks di dalam kolom (mis. "Rp", "gr").
 */
export function Stepper({ value, onChange, step = 1, awalan = null, akhiran = null, ariaLabel }) {
  const ubah = (arah) => {
    const v = parseAngka(value) ?? 0
    onChange(String(Math.max(0, Math.round((v + arah * step) * 100) / 100)))
  }
  const tombol = 'flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-slate-200 bg-white text-2xl font-semibold text-slate-700 transition-transform active:scale-95'
  return (
    <div className="flex items-stretch gap-2">
      <button type="button" aria-label={`Kurangi ${ariaLabel}`} onClick={() => ubah(-1)} className={tombol}>−</button>
      <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20">
        {awalan && <span className="text-sm font-semibold text-slate-400">{awalan}</span>}
        <input
          type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}
          aria-invalid={value !== '' && parseAngka(value) === null ? 'true' : undefined}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-right font-heading text-xl font-bold tabular-nums text-slate-900 outline-none"
        />
        {akhiran && <span className="text-sm font-semibold text-slate-400">{akhiran}</span>}
      </label>
      <button type="button" aria-label={`Tambah ${ariaLabel}`} onClick={() => ubah(1)} className={tombol}>+</button>
    </div>
  )
}

/**
 * Notifikasi singkat di bawah (gelap) dengan satu tombol aksi opsional; hilang sendiri setelah 9 detik.
 * `onTutup` harus stabil (useCallback), kalau tidak timer mulai ulang tiap render.
 */
export function Snack({ pesan, aksi = null, onAksi, onTutup }) {
  useEffect(() => {
    if (!pesan) return undefined
    const t = setTimeout(onTutup, 9000)
    return () => clearTimeout(t)
  }, [pesan, onTutup])
  if (!pesan) return null
  return (
    <div role="status" aria-live="polite"
      className="hpp-toast fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-slate-900 py-2.5 pl-4 pr-2.5 text-white shadow-xl">
      <span className="min-w-0 text-sm font-semibold">{pesan}</span>
      {aksi && (
        <button type="button" onClick={onAksi} className="flex-none rounded-xl bg-accent-500 px-3.5 py-2 text-sm font-bold text-white active:scale-95">{aksi}</button>
      )}
    </div>
  )
}
