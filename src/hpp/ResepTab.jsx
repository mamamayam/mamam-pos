import { useMemo, useState } from 'react'
import { kelompokResep, makeCtx, resepRows, riwayatModalRows } from './hppModel'
import { angka, rupiah, rupiahUnit } from './hppFormat'
import { PilBelumDiisi, Sel, SearchBox, TombolAksi } from './ui'
import DaftarKelompok, { BarisLipat, RiwayatMini, useBarisTerbuka } from './DaftarUi'

/**
 * Tab Resep: resep per grup (Menu utama, Saos dan sambal, Topping, ...), grup menguncup di awal. Ketuk resep untuk
 * melihat isi dan riwayat modalnya; tombol Edit membuka popup isi resep (ResepSheet).
 */
export default function ResepTab({ model, onOpen, awalBuka = false, awalTerbuka = [] }) {
  const [q, setQ] = useState('')
  const [terbuka, toggle] = useBarisTerbuka(awalTerbuka)
  const ctx = useMemo(() => makeCtx(model), [model])
  const cari = q.trim().toLowerCase()
  const grup = kelompokResep(Object.values(model.resep).filter((r) => r.nama.toLowerCase().includes(cari)))

  return (
    <section>
      <SearchBox value={q} onChange={setQ} placeholder="Cari resep" />
      <DaftarKelompok grup={grup} cari={cari} awalBuka={awalBuka} kosong="Tidak ada resep yang cocok"
        renderItem={(r) => {
          const kosong = r.items.length === 0
          const total = ctx.resepTotal(r.id)
          const unit = r.hasilUnit || 'porsi'
          return (
            <BarisLipat key={r.id} buka={terbuka.has(r.id)} onToggle={() => toggle(r.id)} judul={r.nama}
              sub={r.hasilQty ? `Hasil ${angka(r.hasilQty)} ${unit}${kosong ? '' : ` · ≈ ${rupiahUnit(total / r.hasilQty)}/${unit}`}` : `Per porsi · ${r.items.length} bahan`}
              nilai={kosong ? <PilBelumDiisi /> : <span className="font-bold tabular-nums text-slate-800">{rupiah(total)}</span>}>
              <DetailResep model={model} ctx={ctx} r={r} total={total} unit={unit} />
              <TombolAksi onClick={() => onOpen(r.id)}>Edit</TombolAksi>
            </BarisLipat>
          )
        }} />
    </section>
  )
}

/** Isi detail (hanya dipasang saat baris terbuka, jadi hitungan riwayat tidak jalan untuk baris yang tertutup). */
function DetailResep({ model, ctx, r, total, unit }) {
  const rows = resepRows(model, ctx, r.id)
  const riwayat = useMemo(() => riwayatModalRows(model, { resepId: r.id }), [model, r.id])
  if (rows.length === 0) return <p className="text-xs text-slate-400">Isi resep belum diisi. Tekan Edit untuk mengisi.</p>
  return (
    <>
      {rows.map((row) => (
        <div key={row.itemId} className="flex items-center justify-between gap-3 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
          <span className="min-w-0 truncate text-slate-700">{row.nama}</span>
          <span className="flex-none text-slate-400">{angka(row.qty)} {row.unit}</span>
          <span className="w-20 flex-none text-right font-semibold tabular-nums text-slate-800">{rupiah(row.biaya)}</span>
        </div>
      ))}
      <div className={`mt-2 grid gap-2 ${r.hasilQty ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Sel label={r.hasilQty ? 'Total batch' : 'Per porsi'}>{rupiah(total)}</Sel>
        {r.hasilQty && <Sel label="Hasil">{angka(r.hasilQty)} {unit}</Sel>}
        {r.hasilQty ? <Sel label={`Per ${unit}`}>{rupiahUnit(total / r.hasilQty)}</Sel> : <Sel label="Bahan">{r.items.length}</Sel>}
      </div>
      <RiwayatMini judul="Riwayat modal" entri={riwayat} />
    </>
  )
}
