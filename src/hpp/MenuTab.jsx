import { useMemo } from 'react'
import { ctxAcuan, kelompokkan, makeCtx, menuBahanKosong, menuInfo, menuParts, riwayatModalRows } from './hppModel'
import { angka, rupiah } from './hppFormat'
import { Delta, PilBelumDiisi, Sel, TierBadge, TombolAksi } from './ui'
import DaftarKelompok, { BarisLipat, RiwayatMini, useBarisTerbuka } from './DaftarUi'

/**
 * Tab Menu: daftar menu per kategori (kategori menguncup di awal). Ketuk menu untuk melihat komposisi dan riwayat
 * modalnya; tombol Edit membuka form menu (MenuSheet). `q` = kata cari dari bilah atas (HppApp).
 */
export default function MenuTab({ model, onOpen, onAcuan, adaPerubahan, q = '', awalBuka = false, awalTerbuka = [] }) {
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
      <DaftarKelompok grup={grup} cari={cari} awalBuka={awalBuka} kosong="Tidak ada menu yang cocok"
        renderItem={(m) => {
          const i = info.get(m.id)
          const kosong = m.items.length === 0
          return (
            <BarisLipat key={m.id} buka={terbuka.has(m.id)} onToggle={() => toggle(m.id)} judul={m.nama}
              sub={<>Jual {rupiah(m.hargaOutlet)}{!kosong && <Delta value={i.delta} className="ml-1" />}</>}
              nilai={kosong ? <span className="font-bold text-slate-800">—</span> : <span className="font-bold tabular-nums text-slate-800">{rupiah(i.hpp)}</span>}
              chip={kosong ? <PilBelumDiisi /> : <TierBadge tier={i.tier} pct={i.pct} />}>
              <DetailMenu model={model} ctx={i.ctx} m={m} info={i} kosong={kosong} />
              <TombolAksi onClick={() => onOpen(m.id)}>Edit</TombolAksi>
            </BarisLipat>
          )
        }} />

      {adaPerubahan && (
        <button type="button" onClick={onAcuan}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-500 active:scale-[0.98]">
          Jadikan harga sekarang sebagai acuan
        </button>
      )}
    </section>
  )
}

/** Isi detail menu (hanya dipasang saat baris terbuka). */
function DetailMenu({ model, ctx, m, info, kosong }) {
  const parts = menuParts(model, ctx, m)
  const riwayat = useMemo(() => riwayatModalRows(model, { menuId: m.id }), [model, m.id])
  const tanpaHarga = menuBahanKosong(model, m)
  if (kosong) {
    return (
      <>
        <p className="text-xs text-slate-400">Komposisi belum diisi. Tekan Edit untuk mengisi.</p>
        <div className="mt-2 grid grid-cols-3 gap-2"><Sel label="Harga jual">{rupiah(m.hargaOutlet)}</Sel></div>
      </>
    )
  }
  return (
    <>
      {parts.map((p) => (
        <div key={`${p.kind}-${p.itemId ?? p.id}`} className="flex items-center justify-between gap-3 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
          <span className="min-w-0 truncate text-slate-700">{p.nama}</span>
          <span className="flex-none text-slate-400">{`${angka(p.qty)} ${p.unit}`}</span>
          <span className="w-24 flex-none text-right font-semibold tabular-nums text-slate-800">{rupiah(p.biaya)}</span>
        </div>
      ))}
      {tanpaHarga.length > 0 && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Belum ada harga untuk: {tanpaHarga.join(', ')}. Modal belum termasuk bahan ini.</p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Sel label="Modal">{rupiah(info.hpp)}</Sel>
        <Sel label="Harga jual">{rupiah(m.hargaOutlet)}</Sel>
        <Sel label="Profit">{rupiah(info.profit)}</Sel>
      </div>
      <RiwayatMini judul="Riwayat modal" entri={riwayat} />
    </>
  )
}
