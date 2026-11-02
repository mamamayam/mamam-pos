import { useMemo, useState } from 'react'
import { dampakUbah, isiBawaan, opsiSatuan } from './hppModel'
import { angka, labelSatuan, parseAngka, ringkasUbahBahan, rupiah, rupiahUnit } from './hppFormat'
import { Chip, ChipRow, DeltaPersen, FieldLabel, Pratinjau, Sheet, Stepper, TextInput, TombolDampak, TombolForm } from './ui'
import DampakSheet from './DampakSheet'

/**
 * Form "Update harga" satu bahan: nama, harga per satuan beli (tombol − / +, langkah Rp500), dan pratinjau harga per unit dasar.
 * Satuan beli, isi, dan kategori jarang berubah, jadi disembunyikan di balik tombol Ubah. Tidak ada tombol persentase.
 * Sebelum Simpan, "Lihat menu terdampak" menunjukkan menu yang modalnya ikut berubah. Riwayat harga ada di detail baris
 * (tab Bahan baku), bukan di sini; "dipakai di N menu" sengaja tidak ditampilkan.
 * `actions.simpanBahan` (HppApp) menyimpan semuanya sekaligus lalu memunculkan notifikasi menu terdampak.
 */
export default function BahanSheet({ model, bahanId, actions, onClose, awalUbah = false }) {
  const b = model.bahan[bahanId]
  const [nama, setNama] = useState(() => b?.nama ?? '')
  const [nilai, setNilai] = useState(() => (b && b.harga !== null ? String(b.harga) : ''))
  const [satuan, setSatuan] = useState(() => b?.satuan ?? '')
  const [isi, setIsi] = useState(() => (b ? String(b.isi) : ''))
  const [kat, setKat] = useState(() => b?.kategoriId ?? null)
  const [ubah, setUbah] = useState(awalUbah)
  const [menyimpan, setMenyimpan] = useState(false)
  const [lihat, setLihat] = useState(false)

  const harga = parseAngka(nilai)
  const isiBaru = parseAngka(isi)
  const valid = !!b && nama.trim() !== '' && harga !== null && isiBaru !== null && isiBaru > 0 && satuan.trim() !== ''
  const berubah = valid && (nama.trim() !== b.nama || harga !== b.harga || satuan.trim() !== b.satuan || isiBaru !== b.isi || kat !== b.kategoriId)
  const dampak = useMemo(
    () => (valid ? dampakUbah(model, bahanId, { harga, isi: isiBaru }) : { rows: [], ganti: 0 }),
    [model, bahanId, valid, harga, isiBaru],
  )
  if (!b) return null

  const lama = b.harga === null ? null : b.harga / b.isi
  const baru = valid ? harga / isiBaru : null
  const pilihSatuan = (s) => {
    setSatuan(s)
    const bawaan = isiBawaan(s, b.unit)
    if (bawaan !== null) setIsi(String(bawaan))
  }

  return (
    <>
      <Sheet title="Update harga" onClose={onClose}>
        {(tutup) => {
          const simpan = async () => {
            if (!berubah || menyimpan) return
            setMenyimpan(true)
            const ok = await actions.simpanBahan(b.id, { nama: nama.trim(), harga, satuan: satuan.trim(), isi: isiBaru, kategoriId: kat })
            setMenyimpan(false)
            if (ok) tutup()
          }
          return (
            <>
              <FieldLabel>Nama</FieldLabel>
              <TextInput value={nama} onChange={setNama} ariaLabel="Nama bahan" />

              <FieldLabel>Harga per {satuan.trim() || b.satuan}</FieldLabel>
              <Stepper value={nilai} onChange={setNilai} step={500} awalan="Rp" ariaLabel="Harga baru" />

              {ubah ? (
                <div className="hpp-reveal mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <FieldLabel>Satuan beli</FieldLabel>
                  <ChipRow>
                    {opsiSatuan(b.satuan).map((s) => <Chip key={s} on={satuan === s} onClick={() => pilihSatuan(s)}>{s}</Chip>)}
                  </ChipRow>
                  <FieldLabel>Isi per {satuan.trim() || b.satuan} (dibagi per {b.unit})</FieldLabel>
                  <Stepper value={isi} onChange={setIsi} step={b.unit === 'gr' || b.unit === 'ml' ? 100 : 1} akhiran={b.unit} ariaLabel="Isi per satuan" />
                  <FieldLabel>Kategori bahan</FieldLabel>
                  <ChipRow>
                    {model.kategoriBahan.map((k) => <Chip key={k.id} on={kat === k.id} onClick={() => setKat(k.id)}>{k.nama}</Chip>)}
                  </ChipRow>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2.5 text-sm text-slate-500">
                  <span className="min-w-0">Satuan: <b className="text-slate-800">{labelSatuan(b)}</b></span>
                  <button type="button" onClick={() => setUbah(true)}
                    className="flex-none rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-bold text-accent-600 active:scale-95">Ubah</button>
                </div>
              )}

              <Pratinjau>
                {valid
                  ? (
                    <>
                      {rupiah(harga)}/{satuan.trim()} ÷ {angka(isiBaru)} {b.unit} = <b className="text-slate-900">{rupiahUnit(baru)}</b>/{b.unit}{' '}
                      {lama !== null && lama > 0 && Math.abs(baru / lama - 1) > 0.0005 && (
                        <>
                          <DeltaPersen nilai={(baru / lama - 1) * 100} /> <span className="text-xs text-slate-400">dari {rupiahUnit(lama)}</span>
                        </>
                      )}
                    </>
                  )
                  : <span className="text-slate-400">Isi nama, harga, dan isi per satuan dengan benar.</span>}
                {berubah && dampak.rows.length > 0 && <TombolDampak n={dampak.rows.length} onClick={() => setLihat(true)} />}
              </Pratinjau>

              <TombolForm onBatal={tutup} onSimpan={simpan} bisa={berubah} proses={menyimpan} />
            </>
          )
        }}
      </Sheet>
      {lihat && <DampakSheet model={model} onClose={() => setLihat(false)} rows={dampak.rows} judul={ringkasUbahBahan(b, harga, isiBaru)} />}
    </>
  )
}
