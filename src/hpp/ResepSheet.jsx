import { useMemo, useState } from 'react'
import { dampakUbahResep, draftBerubah, draftDariResep, draftValid, itemsResepDariDraft, makeCtx, modelDenganResep, resepPerUnit } from './hppModel'
import { angka, parseAngka, ringkasUbahResep, rupiah, rupiahUnit } from './hppFormat'
import { DeltaPersen, FieldLabel, Pratinjau, Sheet, Stepper, TextInput, TombolDampak, TombolForm } from './ui'
import KomposisiForm from './KomposisiForm'
import DampakSheet from './DampakSheet'

/**
 * Form "Edit resep": nama, hasil per batch (hanya resep batch), dan komposisi (takaran − / +, hapus, tambah). Semua perubahan
 * hanya draft sampai Simpan. Berlaku untuk SEMUA menu yang memakai resep ini; "Lihat menu terdampak" menunjukkan modalnya.
 * `actions.simpanResep` (HppApp) menyimpan lalu memunculkan notifikasi menu terdampak.
 */
export default function ResepSheet({ model, resepId, actions, onClose }) {
  const r = model.resep[resepId]
  const [nama, setNama] = useState(() => r?.nama ?? '')
  const [hasil, setHasil] = useState(() => (r?.hasilQty ? String(r.hasilQty) : ''))
  const [draft, setDraft] = useState(() => (r ? draftDariResep(r) : []))
  const [menyimpan, setMenyimpan] = useState(false)
  const [lihat, setLihat] = useState(false)

  const batch = !!r?.hasilQty
  const hasilQty = batch ? parseAngka(hasil) : null
  const valid = !!r && nama.trim() !== '' && draftValid(draft) && (!batch || (hasilQty !== null && hasilQty > 0))
  const items = useMemo(() => itemsResepDariDraft(draft), [draft])
  const asli = useMemo(() => (r ? draftDariResep(r) : []), [r])
  const berubah = valid && (nama.trim() !== r.nama || (batch && hasilQty !== r.hasilQty) || draftBerubah(asli, draft))

  const hitung = useMemo(() => {
    if (!valid) return null
    const ctx = makeCtx(model)
    const lamaTotal = ctx.resepTotal(r.id)
    const sesudah = modelDenganResep(model, r.id, { hasilQty: batch ? hasilQty : undefined, items })
    const baruTotal = makeCtx(sesudah).resepTotal(r.id)
    return { lamaTotal, baruTotal, lama: resepPerUnit(r, lamaTotal), baru: resepPerUnit({ hasilQty: batch ? hasilQty : null }, baruTotal) }
  }, [model, valid, r, batch, hasilQty, items])
  const dampak = useMemo(
    () => (valid ? dampakUbahResep(model, resepId, { hasilQty: batch ? hasilQty : undefined, items }) : { rows: [], ganti: 0 }),
    [model, resepId, valid, batch, hasilQty, items],
  )
  if (!r) return null

  const unit = r.hasilUnit || 'porsi'
  const judulDampak = hitung ? ringkasUbahResep(nama.trim() || r.nama, hitung.lama, hitung.baru, unit) : ''

  return (
    <>
      <Sheet title="Edit resep" onClose={onClose}>
        {(tutup) => {
          const simpan = async () => {
            if (!berubah || menyimpan) return
            setMenyimpan(true)
            const ok = await actions.simpanResep(r.id, { nama: nama.trim(), hasilQty, items }, dampak, judulDampak)
            setMenyimpan(false)
            if (ok) tutup()
          }
          return (
            <>
              <FieldLabel>Nama</FieldLabel>
              <TextInput value={nama} onChange={setNama} ariaLabel="Nama resep" />

              {batch && (
                <>
                  <FieldLabel>Hasil per batch</FieldLabel>
                  <Stepper value={hasil} onChange={setHasil} step={unit === 'gr' || unit === 'ml' ? 100 : 1} akhiran={unit} ariaLabel="Hasil per batch" />
                </>
              )}

              <FieldLabel>Komposisi</FieldLabel>
              <KomposisiForm model={model} untuk={{ tipe: 'resep', resepId: r.id }} draft={draft} onChange={setDraft} />

              <Pratinjau>
                {hitung
                  ? (
                    <>
                      Per {unit}: {rupiahUnit(hitung.lama)} → <b className="text-slate-900">{rupiahUnit(hitung.baru)}</b>{' '}
                      {hitung.lama > 0 && Math.abs(hitung.baru / hitung.lama - 1) > 0.0005 && <DeltaPersen nilai={(hitung.baru / hitung.lama - 1) * 100} />}
                      <div className="mt-1 text-xs text-slate-400">
                        {batch ? `Total batch ${rupiah(hitung.lamaTotal)} → ${rupiah(hitung.baruTotal)}` : `Per porsi ${rupiah(hitung.lamaTotal)} → ${rupiah(hitung.baruTotal)}`}
                        {batch && hasilQty ? ` · hasil ${angka(hasilQty)} ${unit}` : ''}
                      </div>
                    </>
                  )
                  : <span className="text-slate-400">Isi nama{batch ? ', hasil,' : ''} dan takaran semua komponen dengan angka lebih dari 0.</span>}
                {berubah && dampak.rows.length > 0 && <TombolDampak n={dampak.rows.length} onClick={() => setLihat(true)} />}
              </Pratinjau>

              <TombolForm onBatal={tutup} onSimpan={simpan} bisa={berubah} proses={menyimpan} />
            </>
          )
        }}
      </Sheet>
      {lihat && <DampakSheet model={model} onClose={() => setLihat(false)} rows={dampak.rows} judul={judulDampak} />}
    </>
  )
}
