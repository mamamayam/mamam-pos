import { useMemo, useState } from 'react'
import { ctxAcuan, kelompokkan, makeCtx, menuInfo, menuParts, riwayatModalRows } from './hppModel'
import { angka, rupiah } from './hppFormat'
import { Delta, Sel, SearchBox, TierBadge, TombolAksi } from './ui'
import DaftarKelompok, { BarisLipat, RiwayatMini, useBarisTerbuka } from './DaftarUi'

/**
 * Tab Menu: daftar menu per kategori (kategori menguncup di awal). Ketuk menu untuk melihat komposisi dan riwayat
 * modalnya; tombol Edit membuka popup modal menu (MenuSheet).
 */
export default function MenuTab({ model, onOpen, onAcuan, adaPerubahan, awalBuka = false, awalTerbuka = [] }) {
  const [q, setQ] = useState('')
  const [terbuka, toggle] = useBarisTerbuka(awalTerbuka)

  const info = useMemo(() => {
    const ctx = makeCtx(model)
    const acuan = ctxAcuan(model)
    return new Map(model.menu.map((m) => [m.id, { ...menuInfo(model, ctx, m), delta: ctx.menuHpp(m) - acuan.menuHpp(m), ctx }]))
  }, [model])

  const cari = q.trim().toLowerCase()
  const daftar = model.menu.filter((m) => m.nama.toLowerCase().includes(cari))
  const grup = kelompokkan(daftar, model.kategoriMenu, (m) => m.kategoriId)

  return (
    <section>
      <SearchBox value={q} onChange={setQ} placeholder="Cari menu" />

      <DaftarKelompok grup={grup} cari={cari} awalBuka={awalBuka} kosong="Tidak ada menu yang cocok"
        renderItem={(m) => {
          const i = info.get(m.id)
          return (
            <BarisLipat key={m.id} buka={terbuka.has(m.id)} onToggle={() => toggle(m.id)} judul={m.nama}
              sub={<>Modal {rupiah(i.hpp)} · Jual {rupiah(m.hargaOutlet)} <Delta value={i.delta} className="ml-1" /></>}
              nilai={<TierBadge tier={i.tier} pct={i.pct} />}>
              <DetailMenu model={model} ctx={i.ctx} m={m} info={i} />
              <TombolAksi onClick={() => onOpen(m.id)}>Edit</TombolAksi>
            </BarisLipat>
          )
        }} />

      {adaPerubahan && (
        <button type="button" onClick={onAcuan}
          className="mt-1 w-full rounded-2xl bg-slate-100 py-2.5 text-xs font-bold text-slate-500 active:scale-[0.98]">
          Jadikan harga sekarang sebagai acuan
        </button>
      )}
    </section>
  )
}

/** Isi detail menu (hanya dipasang saat baris terbuka). */
function DetailMenu({ model, ctx, m, info }) {
  const parts = menuParts(model, ctx, m)
  const riwayat = useMemo(() => riwayatModalRows(model, { menuId: m.id }), [model, m.id])
  return (
    <>
      {parts.map((p) => (
        <div key={`${p.kind}-${p.itemId ?? p.id}`} className="flex items-center justify-between gap-3 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
          <span className="min-w-0 truncate text-slate-700">{p.nama}</span>
          <span className="flex-none text-slate-400">{p.kind === 'lain' ? '' : `${angka(p.qty)} ${p.unit}`}</span>
          <span className="w-20 flex-none text-right font-semibold tabular-nums text-slate-800">{rupiah(p.biaya)}</span>
        </div>
      ))}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Sel label="Modal">{rupiah(info.hpp)}</Sel>
        <Sel label="Harga jual">{rupiah(m.hargaOutlet)}</Sel>
        <Sel label="Profit">{rupiah(info.profit)}</Sel>
      </div>
      <RiwayatMini judul="Riwayat modal" entri={riwayat} />
    </>
  )
}
