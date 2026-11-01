import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { makeCtx, menusUsingResep, resepRows } from './hppModel'
import { angka, rupiah, rupiahUnit } from './hppFormat'
import KomposisiPicker from './KomposisiPicker'
import { BahanLine, ResepLine, TombolTambah } from './MenuSheet'
import { Card, Hero, HeroLabel, ProporsiBar, SectionLabel, Sheet } from './ui'

/**
 * Popup isi resep (tab Resep): modal satu batch / satu porsi, isi resep, dan ubah isinya (takaran, hapus, tambah).
 * Berlaku untuk SEMUA menu yang memakai resep ini (jumlahnya ditampilkan saat mode ubah). Cara ubah sama dengan
 * isi resep di popup menu (BahanLine / ResepLine / KomposisiPicker dari MenuSheet).
 */
export default function ResepSheet({ model, resepId, actions, onClose }) {
  const [catatan, setCatatan] = useState('')
  const [edit, setEdit] = useState(false)
  const [picker, setPicker] = useState(null)
  const r = model.resep[resepId]
  const ctx = useMemo(() => makeCtx(model), [model])
  if (!r) return null

  const total = ctx.resepTotal(r.id)
  const rows = resepRows(model, ctx, r.id)
  const nMenu = menusUsingResep(model, r.id).length
  const unit = r.hasilUnit || 'porsi'

  const ubahHarga = async (bahanId, harga) => {
    const b = model.bahan[bahanId]
    const ok = await actions.ubahHarga({ bahanId, harga, catatan: `Diubah dari resep ${r.nama}`, sumber: 'modal_menu' })
    if (ok) setCatatan(`${b.nama} diubah ke ${rupiah(harga)}. Tercatat di riwayat harga.`)
    return ok
  }
  const hapusIsi = (row) => {
    const ok = typeof window === 'undefined' || window.confirm(`Hapus ${row.nama} dari resep ${r.nama}? Berlaku untuk ${nMenu} menu yang memakai resep ini.`)
    if (!ok) return
    actions.hapusResepItem(row.itemId)
    setCatatan(`${row.nama} dihapus dari resep ${r.nama}.`)
  }

  return (
    <Sheet title={r.nama} onClose={onClose}>
      <Hero>
        <HeroLabel>{r.hasilQty ? 'Modal satu batch' : 'Modal per porsi'}</HeroLabel>
        <div className="font-heading text-4xl font-bold tabular-nums">{rupiah(total)}</div>
        <div className="text-xs text-slate-400">
          {r.hasilQty ? `Hasil ${angka(r.hasilQty)} ${unit} · ≈ ${rupiahUnit(total / r.hasilQty)}/${unit}` : 'Per porsi'}{r.grup ? ` · ${r.grup}` : ''}
        </div>
        <ProporsiBar parts={rows} total={total} gelap />
      </Hero>
      {catatan && <p className="mb-2 px-1 text-xs font-semibold text-accent-600" role="status">{catatan}</p>}

      <Card>
        <div className="flex items-center justify-between pb-1 pt-3">
          <SectionLabel>Isi resep</SectionLabel>
          <button type="button" onClick={() => { setEdit((v) => !v); setPicker(null) }} aria-pressed={edit}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold active:scale-95 ${edit ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <Pencil size={12} aria-hidden="true" />{edit ? 'Selesai' : 'Ubah isi'}
          </button>
        </div>
        {edit && <p className="pb-1 text-xs text-amber-700">Resep ini dipakai di {nMenu} menu. Perubahan isinya berlaku untuk semuanya.</p>}
        {rows.length === 0 && <p className="py-3 text-xs text-slate-400">Isi resep belum diisi. Tekan Ubah isi lalu Tambah ke resep.</p>}
        {rows.map((row) => (
          row.kind === 'bahan'
            ? <BahanLine key={`b-${row.itemId}`} model={model} bahanId={row.id} qty={row.qty} biaya={row.biaya} onHarga={ubahHarga}
              edit={edit} onQty={(v) => actions.ubahQtyResepItem(row.itemId, v)} onHapus={() => hapusIsi(row)} />
            : <ResepLine key={`r-${row.itemId}`} model={model} ctx={ctx} resepId={row.id} qty={row.qty} biaya={row.biaya} total={total}
              onHarga={ubahHarga} stack={[r.id]} edit={edit} actions={actions} picker={picker} setPicker={setPicker} lapor={setCatatan}
              onQty={(v) => actions.ubahQtyResepItem(row.itemId, v)} onHapus={() => hapusIsi(row)} />
        ))}
        {edit && (picker === r.id ? (
          <KomposisiPicker model={model} untuk={{ tipe: 'resep', resepId: r.id }}
            sudah={r.items.map((it) => (it.bahanId ? `b:${it.bahanId}` : `r:${it.subResepId}`))}
            onBatal={() => setPicker(null)}
            onTambah={async ({ kind, id, qty }) => {
              const ok = await actions.tambahKomposisiResep(r.id, kind === 'bahan' ? { bahanId: id, qty } : { subResepId: id, qty })
              if (ok) setCatatan(`Isi resep ${r.nama} ditambah.`)
              return ok
            }} />
        ) : (
          <TombolTambah onClick={() => setPicker(r.id)}>Tambah ke resep {r.nama}</TombolTambah>
        ))}
      </Card>
      {edit && <p className="mt-2 text-xs text-slate-400">Isi resep disimpan langsung dan berlaku untuk semua menu yang memakainya.</p>}
    </Sheet>
  )
}
