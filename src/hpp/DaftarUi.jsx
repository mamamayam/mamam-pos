import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { rupiah, tanggal } from './hppFormat'
import { Card, DeltaPersen, SectionLabel, Sparkline } from './ui'

/**
 * Potongan daftar bersama tab Bahan baku, Resep, dan Menu.
 *  - DaftarKelompok: kelompok per kategori yang MENGUNCUP di awal (ketuk judul untuk membuka). Saat mencari, semua
 *    kelompok yang cocok terbuka. `awalBuka` hanya untuk tes (render server).
 *  - BarisLipat: satu baris ringkas; ketuk untuk membuka detailnya.
 *  - RiwayatMini: grafik kecil + 3 perubahan terakhir (+ "Lihat semua").
 */
export default function DaftarKelompok({ grup, cari = '', awalBuka = false, renderItem, kosong = 'Tidak ada hasil' }) {
  const [terbuka, setTerbuka] = useState({})
  if (grup.length === 0) return <Card padded className="text-center text-xs text-slate-400">{kosong}</Card>
  return (
    <>
      {grup.map((g) => {
        const id = g.id ?? 'x'
        const buka = cari ? true : (terbuka[id] ?? awalBuka)
        return (
          <div key={id} className="mb-1">
            <button type="button" onClick={() => setTerbuka((s) => ({ ...s, [id]: !buka }))} aria-expanded={buka}
              className="flex w-full items-center justify-between px-0.5 py-2.5">
              <SectionLabel>{g.nama} · {g.items.length}</SectionLabel>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${buka ? '' : '-rotate-90'}`} />
            </button>
            {buka && <Card className="hpp-reveal">{g.items.map(renderItem)}</Card>}
          </div>
        )
      })}
    </>
  )
}

/** Baris ringkas. `nilai` dan `chip` ditaruh di kanan (atas-bawah); isi detail (children) hanya dipasang saat terbuka. */
export function BarisLipat({ buka, onToggle, judul, sub, nilai, chip = null, children }) {
  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={buka}
        className="flex w-full items-center justify-between gap-3 py-2.5 text-left active:opacity-70">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-slate-800">{judul}</span>
          <span className="block text-xs text-slate-400">{sub}</span>
        </span>
        <span className="flex flex-none items-center gap-1.5 text-slate-300">
          <span className="flex flex-col items-end gap-0.5">{nilai}{chip}</span>
          <ChevronDown size={14} className={`transition-transform ${buka ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {buka && <div className="hpp-reveal pb-3">{children}</div>}
    </div>
  )
}

/** Himpunan id baris yang sedang terbuka (ketuk lagi = tutup). `awal` = daftar id terbuka di awal (tes). */
export function useBarisTerbuka(awal = []) {
  const [set, setSet] = useState(() => new Set(awal))
  const toggle = (id) => setSet((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return [set, toggle]
}

/**
 * Riwayat singkat. `entri` terbaru dulu: [{ id?, pada, nilai, persen }] (persen null = yang paling awal).
 * Grafik memakai urutan lama -> baru. Tiga terbaru tampil; sisanya lewat "Lihat semua".
 */
export function RiwayatMini({ judul, entri, awalSemua = false }) {
  const [semua, setSemua] = useState(awalSemua)
  if (!entri.length) return null
  const tampil = semua ? entri : entri.slice(0, 3)
  return (
    <div className="mt-3">
      <SectionLabel className="mb-0.5">{judul}</SectionLabel>
      <Sparkline nilai={[...entri].reverse().map((e) => e.nilai)} />
      {tampil.map((e) => (
        <div key={e.id ?? e.pada} className="flex items-center gap-2 py-1.5 text-sm">
          <span className="flex-1 text-slate-400">{tanggal(e.pada)}</span>
          <span className="font-semibold tabular-nums text-slate-800">{rupiah(e.nilai)}</span>
          {e.persen === null ? <span className="text-xs font-bold text-slate-400">awal</span> : <DeltaPersen nilai={e.persen} />}
        </div>
      ))}
      {entri.length > 3 && (
        <button type="button" onClick={() => setSemua((v) => !v)} className="py-1.5 text-sm font-bold text-accent-600">
          {semua ? 'Sembunyikan' : `Lihat semua (${entri.length})`}
        </button>
      )}
    </div>
  )
}
