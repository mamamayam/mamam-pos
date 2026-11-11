import { useMemo, useState } from 'react'
import { dampakUbahResep, daftarGrupResep, draftBerubah, draftDariResep, draftValid, itemsResepDariDraft, makeCtx, modelDenganResep, namaSudahDipakai, opsiSatuan, resepPerUnit } from './hppModel'
import { angka, parseAngka, ringkasUbahResep, rupiah, rupiahUnit } from './hppFormat'
import { Chip, ChipRow, DeltaPersen, FieldLabel, Pratinjau, Sheet, Stepper, TextInput, TombolDampak, TombolForm } from './ui'
import KomposisiForm from './KomposisiForm'
import DampakSheet from './DampakSheet'

/** Id sementara untuk menghitung pratinjau resep yang belum disimpan (tidak pernah dikirim ke database). */
const ID_BARU = '__resep-baru__'

/**
 * Form "Edit resep": nama, hasil per batch (hanya resep batch), dan komposisi (takaran − / +, hapus, tambah). Semua perubahan
 * hanya draft sampai Simpan. Berlaku untuk SEMUA menu yang memakai resep ini; "Lihat menu terdampak" menunjukkan modalnya.
 * `actions.simpanResep` (HppApp) menyimpan lalu memunculkan notifikasi menu terdampak.
 *
 * `baru` = form "Resep baru" (tombol Tambah di tab Resep): pilih Per porsi atau Per batch (hasil + satuan), grup (pilih yang ada atau ketik grup baru),
 * lalu isi komposisi. Nama kembar ditolak. Simpan memanggil `actions.buatResep`; tidak ada "menu terdampak" karena belum ada menu yang memakainya.
 */
export default function ResepSheet({ model, resepId, actions, onClose, baru = false }) {
  const r = baru ? null : model.resep[resepId]
  const grupAda = useMemo(() => daftarGrupResep(model), [model])
  const [nama, setNama] = useState(() => r?.nama ?? '')
  const [hasil, setHasil] = useState(() => (r?.hasilQty ? String(r.hasilQty) : ''))
  const [draft, setDraft] = useState(() => (r ? draftDariResep(r) : []))
  const [jenis, setJenis] = useState('porsi')                                   // hanya form baru: 'porsi' | 'batch'
  const [satuanHasil, setSatuanHasil] = useState(() => model.satuanDasar[0] ?? 'gr')   // hanya form baru, resep batch
  const [grup, setGrup] = useState(() => grupAda[0] ?? 'Resep')                 // hanya form baru
  const [menyimpan, setMenyimpan] = useState(false)
  const [lihat, setLihat] = useState(false)

  const batch = baru ? jenis === 'batch' : !!r?.hasilQty
  const hasilQty = batch ? parseAngka(hasil) : null
  const kembar = baru && namaSudahDipakai(Object.values(model.resep).map((x) => x.nama), nama)
  const valid = (baru || !!r) && nama.trim() !== '' && !kembar && draftValid(draft) && (!batch || (hasilQty !== null && hasilQty > 0))
    && (!baru || (grup.trim() !== '' && (!batch || satuanHasil.trim() !== '')))
  const items = useMemo(() => itemsResepDariDraft(draft), [draft])
  const asli = useMemo(() => (r ? draftDariResep(r) : []), [r])
  const berubah = valid && (baru || nama.trim() !== r.nama || (batch && hasilQty !== r.hasilQty) || draftBerubah(asli, draft))

  const hitung = useMemo(() => {
    if (!valid) return null
    if (baru) {
      const sesudah = { ...model, resep: { ...model.resep, [ID_BARU]: { id: ID_BARU, nama: '', grup: '', hasilQty: batch ? hasilQty : null, hasilUnit: null, urutan: 0, items } } }
      const baruTotal = makeCtx(sesudah).resepTotal(ID_BARU)
      return { lamaTotal: 0, baruTotal, lama: 0, baru: resepPerUnit({ hasilQty: batch ? hasilQty : null }, baruTotal) }
    }
    const ctx = makeCtx(model)
    const lamaTotal = ctx.resepTotal(r.id)
    const sesudah = modelDenganResep(model, r.id, { hasilQty: batch ? hasilQty : undefined, items })
    const baruTotal = makeCtx(sesudah).resepTotal(r.id)
    return { lamaTotal, baruTotal, lama: resepPerUnit(r, lamaTotal), baru: resepPerUnit({ hasilQty: batch ? hasilQty : null }, baruTotal) }
  }, [model, valid, baru, r, batch, hasilQty, items])
  const dampak = useMemo(
    () => (valid && !baru ? dampakUbahResep(model, resepId, { hasilQty: batch ? hasilQty : undefined, items }) : { rows: [], ganti: 0 }),
    [model, resepId, baru, valid, batch, hasilQty, items],
  )
  if (!baru && !r) return null

  const unit = baru ? (batch ? satuanHasil.trim() || 'gr' : 'porsi') : (r.hasilUnit || 'porsi')
  const judulDampak = hitung && !baru ? ringkasUbahResep(nama.trim() || r.nama, hitung.lama, hitung.baru, unit) : ''

  return (
    <>
      <Sheet title={baru ? 'Resep baru' : 'Edit resep'} onClose={onClose}>
        {(tutup) => {
          const simpan = async () => {
            if (!berubah || menyimpan) return
            setMenyimpan(true)
            const ok = baru
              ? await actions.buatResep({ nama: nama.trim(), grup: grup.trim(), hasilQty, hasilUnit: batch ? satuanHasil.trim() : null, items })
              : await actions.simpanResep(r.id, { nama: nama.trim(), hasilQty, items }, dampak, judulDampak)
            setMenyimpan(false)
            if (ok) tutup()
          }
          return (
            <>
              <FieldLabel>Nama</FieldLabel>
              <TextInput value={nama} onChange={setNama} ariaLabel="Nama resep" />
              {kembar && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">Nama itu sudah dipakai resep lain.</p>}

              {baru && (
                <>
                  <FieldLabel>Jenis resep</FieldLabel>
                  <ChipRow>
                    <Chip on={jenis === 'porsi'} onClick={() => setJenis('porsi')}>Per porsi</Chip>
                    <Chip on={jenis === 'batch'} onClick={() => setJenis('batch')}>Per batch</Chip>
                  </ChipRow>
                  <p className="-mt-1 mb-1 text-xs text-slate-400">
                    {jenis === 'batch'
                      ? 'Dibuat banyak sekaligus (mis. saos 3.000 gr); menu memakainya per gr / ml. Modalnya dibagi dari hasil batch.'
                      : 'Modal satu porsi jadi (mis. ayam goreng 1 porsi); menu memakainya per porsi.'}
                  </p>
                </>
              )}

              {batch && (
                <>
                  <FieldLabel>Hasil per batch</FieldLabel>
                  <Stepper value={hasil} onChange={setHasil} step={unit === 'gr' || unit === 'ml' ? 100 : 1} akhiran={unit} ariaLabel="Hasil per batch" />
                  {baru && (
                    <>
                      <FieldLabel>Satuan hasil</FieldLabel>
                      <ChipRow>
                        {opsiSatuan(satuanHasil, model.satuanDasar).map((u) => <Chip key={u} on={satuanHasil === u} onClick={() => setSatuanHasil(u)}>{u}</Chip>)}
                      </ChipRow>
                    </>
                  )}
                </>
              )}

              {baru && (
                <>
                  <FieldLabel>Grup</FieldLabel>
                  <ChipRow>
                    {grupAda.map((g) => <Chip key={g} on={grup.trim() === g} onClick={() => setGrup(g)}>{g}</Chip>)}
                  </ChipRow>
                  <TextInput value={grup} onChange={setGrup} ariaLabel="Grup resep" />
                  <p className="mt-1 text-xs text-slate-400">Pilih grup yang ada, atau ketik nama grup baru.</p>
                </>
              )}

              <FieldLabel>Komposisi</FieldLabel>
              <KomposisiForm model={model} untuk={{ tipe: 'resep', resepId: baru ? null : r.id }} draft={draft} onChange={setDraft} />

              <Pratinjau>
                {hitung
                  ? (
                    <>
                      {baru
                        ? <>Per {unit}: <b className="text-slate-900">{rupiahUnit(hitung.baru)}</b></>
                        : (
                          <>
                            Per {unit}: {rupiahUnit(hitung.lama)} → <b className="text-slate-900">{rupiahUnit(hitung.baru)}</b>{' '}
                            {hitung.lama > 0 && Math.abs(hitung.baru / hitung.lama - 1) > 0.0005 && <DeltaPersen nilai={(hitung.baru / hitung.lama - 1) * 100} />}
                          </>
                        )}
                      <div className="mt-1 text-xs text-slate-400">
                        {baru
                          ? (batch ? `Total batch ${rupiah(hitung.baruTotal)}` : `Per porsi ${rupiah(hitung.baruTotal)}`)
                          : (batch ? `Total batch ${rupiah(hitung.lamaTotal)} → ${rupiah(hitung.baruTotal)}` : `Per porsi ${rupiah(hitung.lamaTotal)} → ${rupiah(hitung.baruTotal)}`)}
                        {batch && hasilQty ? ` · hasil ${angka(hasilQty)} ${unit}` : ''}
                      </div>
                      {baru && draft.length === 0 && <div className="mt-1 text-xs text-slate-400">Komposisi boleh diisi nanti lewat Edit; resep tanpa isi tampil "Belum diisi".</div>}
                    </>
                  )
                  : (
                    <span className="text-slate-400">
                      {baru
                        ? `Isi nama, grup${batch ? ', hasil batch' : ''}, dan takaran semua komponen dengan angka lebih dari 0.`
                        : `Isi nama${batch ? ', hasil,' : ''} dan takaran semua komponen dengan angka lebih dari 0.`}
                    </span>
                  )}
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
