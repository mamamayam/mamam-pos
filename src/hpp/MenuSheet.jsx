import { useMemo, useState } from 'react'
import { draftBerubah, draftDariMenu, draftValid, hargaMinimal, itemsMenuDariDraft, makeCtx, menuInfo } from './hppModel'
import { parseAngka, persen, rupiah } from './hppFormat'
import { Chip, ChipRow, Delta, FieldLabel, Pratinjau, Sheet, Stepper, TextInput, TierBadge, TombolForm } from './ui'
import KomposisiForm from './KomposisiForm'

/**
 * Form "Edit menu": nama, kategori, harga jual, biaya lain (sisa modal yang belum diuraikan), dan komposisi
 * (takaran − / +, hapus, tambah). Semua perubahan hanya draft sampai Simpan; pratinjau memperlihatkan modal dan margin
 * lama → baru. `actions.simpanMenu` (HppApp) menyimpan semuanya sekaligus.
 */
export default function MenuSheet({ model, menuId, actions, onClose }) {
  const m = model.menu.find((x) => x.id === menuId)
  const [nama, setNama] = useState(() => m?.nama ?? '')
  const [kat, setKat] = useState(() => m?.kategoriId ?? null)
  const [jual, setJual] = useState(() => (m ? String(m.hargaOutlet) : ''))
  const [lain, setLain] = useState(() => (m ? String(Math.round(m.biayaLain)) : ''))
  const [draft, setDraft] = useState(() => (m ? draftDariMenu(m) : []))
  const [menyimpan, setMenyimpan] = useState(false)

  const harga = parseAngka(jual)
  const biayaLain = parseAngka(lain)
  const valid = !!m && nama.trim() !== '' && harga !== null && harga > 0 && biayaLain !== null && draftValid(draft)
  const asli = useMemo(() => (m ? draftDariMenu(m) : []), [m])
  const berubah = valid && (nama.trim() !== m.nama || kat !== m.kategoriId || harga !== m.hargaOutlet || biayaLain !== Math.round(m.biayaLain) || draftBerubah(asli, draft))

  const hitung = useMemo(() => {
    if (!valid) return null
    const lama = menuInfo(model, makeCtx(model), m)
    const mBaru = { ...m, hargaOutlet: harga, biayaLain, items: itemsMenuDariDraft(draft) }
    const sesudah = { ...model, menu: model.menu.map((x) => (x.id === m.id ? mBaru : x)) }
    return { lama, baru: menuInfo(sesudah, makeCtx(sesudah), mBaru) }
  }, [model, valid, m, harga, biayaLain, draft])
  if (!m) return null

  const minimal = hitung && hitung.baru.tier !== 'HIGH' ? hargaMinimal(hitung.baru.hpp, model.margin.hi) : 0

  return (
    <Sheet title="Edit menu" onClose={onClose}>
      {(tutup) => {
        const simpan = async () => {
          if (!berubah || menyimpan) return
          setMenyimpan(true)
          const ok = await actions.simpanMenu(m.id, { nama: nama.trim(), kategoriId: kat, hargaOutlet: harga, biayaLain, items: itemsMenuDariDraft(draft) })
          setMenyimpan(false)
          if (ok) tutup()
        }
        return (
          <>
            <FieldLabel>Nama</FieldLabel>
            <TextInput value={nama} onChange={setNama} ariaLabel="Nama menu" />

            <FieldLabel>Kategori menu</FieldLabel>
            <ChipRow>
              {model.kategoriMenu.map((k) => <Chip key={k.id} on={kat === k.id} onClick={() => setKat(k.id)}>{k.nama}</Chip>)}
            </ChipRow>

            <FieldLabel>Harga jual</FieldLabel>
            <Stepper value={jual} onChange={setJual} step={500} awalan="Rp" ariaLabel="Harga jual outlet" />

            <FieldLabel>Komposisi</FieldLabel>
            <KomposisiForm model={model} untuk={{ tipe: 'menu' }} draft={draft} onChange={setDraft} />

            <FieldLabel>Biaya lain (sisa modal yang belum diuraikan)</FieldLabel>
            <Stepper value={lain} onChange={setLain} step={100} awalan="Rp" ariaLabel="Biaya lain" />

            <Pratinjau>
              {hitung
                ? (
                  <>
                    Modal {rupiah(hitung.lama.hpp)} → <b className="text-slate-900">{rupiah(hitung.baru.hpp)}</b>{' '}
                    <Delta value={hitung.baru.hpp - hitung.lama.hpp} className="text-xs" />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>Margin</span><TierBadge tier={hitung.baru.tier} pct={hitung.baru.pct} />
                      <span>· Profit {rupiah(hitung.baru.profit)} · Online {rupiah(hitung.baru.online)}</span>
                    </div>
                    {minimal > 0 && <div className="mt-1.5 text-xs text-slate-500">Agar margin HIGH ({persen(model.margin.hi, 0)}), harga jual minimal {rupiah(minimal)}.</div>}
                  </>
                )
                : <span className="text-slate-400">Isi nama, harga jual, dan takaran semua komponen dengan angka yang benar.</span>}
            </Pratinjau>

            <TombolForm onBatal={tutup} onSimpan={simpan} bisa={berubah} proses={menyimpan} />
          </>
        )
      }}
    </Sheet>
  )
}
