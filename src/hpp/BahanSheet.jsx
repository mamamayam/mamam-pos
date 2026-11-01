import { useMemo, useState } from 'react'
import { dampakUbah, isiBawaan, opsiSatuan } from './hppModel'
import { angka, labelSatuan, parseAngka, ringkasUbahBahan, rupiah, rupiahUnit } from './hppFormat'
import { Chip, ChipRow, DeltaPersen, SectionLabel, Sheet, Stepper } from './ui'
import DampakSheet from './DampakSheet'

/**
 * Popup "Update harga" untuk satu bahan: harga per satuan beli (tombol − / + besar), catatan opsional, dan
 * pratinjau harga per unit dasar. Satuan beli, isi, dan kategori jarang berubah, jadi disembunyikan di balik tombol
 * Ubah. Sebelum disimpan, "Lihat menu terdampak" menunjukkan menu mana yang modalnya ikut berubah. Riwayat harga
 * ada di detail baris (tab Bahan baku), bukan di popup ini.
 * `actions.ubahBahan` (HppApp) menyimpan harga/satuan/isi/kategori sekaligus lalu memunculkan notifikasi dampaknya.
 */
export default function BahanSheet({ model, bahanId, actions, onClose, awalUbah = false }) {
  const b = model.bahan[bahanId]
  const [nilai, setNilai] = useState(() => (b && b.harga !== null ? String(b.harga) : ''))
  const [catatan, setCatatan] = useState('')
  const [satuan, setSatuan] = useState(() => b?.satuan ?? '')
  const [isi, setIsi] = useState(() => (b ? String(b.isi) : ''))
  const [kat, setKat] = useState(() => b?.kategoriId ?? null)
  const [ubah, setUbah] = useState(awalUbah)
  const [menyimpan, setMenyimpan] = useState(false)
  const [lihat, setLihat] = useState(false)

  const harga = parseAngka(nilai)
  const isiBaru = parseAngka(isi)
  const valid = !!b && harga !== null && isiBaru !== null && isiBaru > 0 && satuan.trim() !== ''
  const berubah = !!b && valid && (harga !== b.harga || satuan.trim() !== b.satuan || isiBaru !== b.isi || kat !== b.kategoriId)
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
            const ok = await actions.ubahBahan({ bahanId: b.id, harga, satuan: satuan.trim(), isi: isiBaru, kategoriId: kat, catatan: catatan.trim() })
            setMenyimpan(false)
            if (ok) tutup()
          }
          return (
            <>
              <div className="mb-3">
                <div className="font-heading text-lg font-bold text-slate-900">{b.nama}</div>
                <div className="text-xs text-slate-400">
                  Harga sekarang {b.harga === null ? 'belum diisi' : rupiah(b.harga)} per {b.satuan}
                </div>
              </div>

              <SectionLabel className="mb-1.5">Harga per {satuan.trim() || b.satuan}</SectionLabel>
              <Stepper value={nilai} onChange={setNilai} step={500} awalan="Rp" ariaLabel="Harga baru" />

              <input
                type="text" value={catatan} onChange={(e) => setCatatan(e.target.value)} aria-label="Catatan"
                placeholder="Catatan (opsional), mis. harga pasar naik"
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
              />

              {ubah ? (
                <div className="hpp-reveal mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <SectionLabel className="mb-1.5">Satuan beli</SectionLabel>
                  <ChipRow>
                    {opsiSatuan(b.satuan).map((s) => <Chip key={s} on={satuan === s} onClick={() => pilihSatuan(s)}>{s}</Chip>)}
                  </ChipRow>
                  <SectionLabel className="mb-1.5">Isi per {satuan.trim() || b.satuan} (dibagi per {b.unit})</SectionLabel>
                  <Stepper value={isi} onChange={setIsi} step={b.unit === 'gr' || b.unit === 'ml' ? 100 : 1} akhiran={b.unit} ariaLabel="Isi per satuan" />
                  <SectionLabel className="mb-1.5 mt-3">Kategori bahan</SectionLabel>
                  <ChipRow>
                    {model.kategoriBahan.map((k) => <Chip key={k.id} on={kat === k.id} onClick={() => setKat(k.id)}>{k.nama}</Chip>)}
                  </ChipRow>
                  <p className="text-xs text-slate-400">Riwayat harga dicatat per satuan beli. Setelah satuan diganti, bandingkan perubahan per {b.unit}.</p>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2.5 text-sm text-slate-500">
                  <span className="min-w-0">Satuan: <b className="text-slate-800">{labelSatuan(b)}</b></span>
                  <button type="button" onClick={() => setUbah(true)}
                    className="flex-none rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-bold text-accent-600 active:scale-95">Ubah</button>
                </div>
              )}

              <div className="mt-3 rounded-2xl bg-white px-3.5 py-3 text-sm text-slate-600" aria-live="polite">
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
                  : <span className="text-slate-400">Isi harga dan isi per satuan dengan angka yang benar.</span>}
                {berubah && dampak.rows.length > 0 && (
                  <button type="button" onClick={() => setLihat(true)}
                    className="mt-2.5 w-full rounded-2xl border-[1.5px] border-accent-500 py-2.5 font-bold text-accent-600 active:scale-[0.98]">
                    Lihat menu terdampak ({dampak.rows.length})
                  </button>
                )}
              </div>

              <div className="mt-4 flex gap-2.5">
                <button type="button" onClick={tutup}
                  className="flex-1 rounded-2xl bg-slate-200/70 py-3.5 font-bold text-slate-600 active:scale-[0.98]">Batal</button>
                <button type="button" onClick={simpan} disabled={!berubah || menyimpan}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-accent-600 to-accent-500 py-3.5 font-bold text-white shadow-lg shadow-accent-500/30 transition-transform active:scale-[0.98] disabled:opacity-45 disabled:shadow-none">
                  {menyimpan ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </>
          )
        }}
      </Sheet>
      {lihat && (
        <DampakSheet model={model} onClose={() => setLihat(false)} rows={dampak.rows}
          judul={ringkasUbahBahan(b, harga, isiBaru)} />
      )}
    </>
  )
}
