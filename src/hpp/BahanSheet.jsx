import { useMemo, useState } from 'react'
import { dampakUbah, isiBawaan, menusUsingBahan, namaSudahDipakai, opsiSatuan } from './hppModel'
import { angka, labelSatuan, parseAngka, ringkasUbahBahan, rupiah, rupiahUnit } from './hppFormat'
import { Chip, ChipRow, DeltaPersen, Dropdown, FieldLabel, Pratinjau, Sheet, Stepper, TextInput, TombolDampak, TombolForm } from './ui'
import DampakSheet from './DampakSheet'

/** Isian awal form Bahan baru: satuan pertama dari daftar di Pengaturan (bawaan kg / gr, isi 1.000), harga kosong. */
const bahanKosong = (model) => {
  const satuan = model.satuanBeli[0] ?? 'kg'
  const unit = model.satuanDasar[0] ?? 'gr'
  return { id: null, nama: '', harga: null, satuan, unit, isi: isiBawaan(satuan, unit) ?? 1, kategoriId: null }
}

/**
 * Form "Update harga" satu bahan: nama, harga per satuan beli (tombol − / +, langkah Rp500), dan pratinjau harga per unit dasar.
 * Satuan beli, satuan pembagi, isi, dan kategori jarang berubah (pilihan satuan diatur di Pengaturan HPP), jadi disembunyikan di balik tombol Ubah. Tidak ada tombol persentase.
 * Sebelum Simpan, "Lihat menu terdampak" menunjukkan menu yang modalnya ikut berubah. Riwayat harga ada di detail baris
 * (tab Bahan baku), bukan di sini; "dipakai di N menu" sengaja tidak ditampilkan.
 * `actions.simpanBahan` (HppApp) menyimpan semuanya sekaligus lalu memunculkan notifikasi menu terdampak.
 *
 * `baru` = form "Bahan baru" (tombol Tambah di tab Bahan baku): isian yang sama, tapi satuan/isi/kategori langsung terbuka,
 * harga boleh dikosongkan (tampil "Belum diisi"), nama kembar ditolak, dan Simpan memanggil `actions.buatBahan`.
 */
export default function BahanSheet({ model, bahanId, actions, onClose, awalUbah = false, baru = false }) {
  const b = baru ? bahanKosong(model) : model.bahan[bahanId]
  const [nama, setNama] = useState(() => b?.nama ?? '')
  const [nilai, setNilai] = useState(() => (b && b.harga !== null ? String(b.harga) : ''))
  const [satuan, setSatuan] = useState(() => b?.satuan ?? '')
  const [unit, setUnit] = useState(() => b?.unit ?? '')
  const [isi, setIsi] = useState(() => (b ? String(b.isi) : ''))
  const [kat, setKat] = useState(() => b?.kategoriId ?? null)
  const [ubah, setUbah] = useState(awalUbah || baru)
  const [menyimpan, setMenyimpan] = useState(false)
  const [lihat, setLihat] = useState(false)

  const harga = parseAngka(nilai)
  const isiBaru = parseAngka(isi)
  const hargaOk = baru ? (nilai.trim() === '' || harga !== null) : harga !== null   // bahan baru boleh tanpa harga dulu
  const kembar = baru && namaSudahDipakai(model.bahanList.map((x) => x.nama), nama)
  const valid = !!b && nama.trim() !== '' && !kembar && hargaOk && isiBaru !== null && isiBaru > 0 && satuan.trim() !== '' && unit.trim() !== ''
  const berubah = valid && (baru || nama.trim() !== b.nama || harga !== b.harga || satuan.trim() !== b.satuan || isiBaru !== b.isi || unit !== b.unit || kat !== b.kategoriId)
  const dampak = useMemo(
    () => (valid && !baru ? dampakUbah(model, bahanId, { harga, isi: isiBaru }) : { rows: [], ganti: 0 }),
    [model, bahanId, baru, valid, harga, isiBaru],
  )
  if (!b) return null

  const lama = b.harga === null ? null : b.harga / b.isi
  const hitungBaru = valid && harga !== null ? harga / isiBaru : null
  const bahanDipakai = !baru && unit !== b.unit && (menusUsingBahan(model, bahanId).length > 0 || Object.values(model.resep).some((r) => r.items.some((it) => it.bahanId === bahanId)))
  const pilihSatuan = (s) => {
    setSatuan(s)
    const bawaan = isiBawaan(s, unit)
    if (bawaan !== null) setIsi(String(bawaan))
  }
  const pilihUnit = (u) => {
    setUnit(u)
    const bawaan = isiBawaan(satuan.trim(), u)
    if (bawaan !== null) setIsi(String(bawaan))
  }

  return (
    <>
      <Sheet title={baru ? 'Bahan baru' : 'Update harga'} onClose={onClose}>
        {(tutup) => {
          const simpan = async () => {
            if (!berubah || menyimpan) return
            setMenyimpan(true)
            const ok = baru
              ? await actions.buatBahan({ nama: nama.trim(), harga, satuan: satuan.trim(), isi: isiBaru, unit, kategoriId: kat })
              : await actions.simpanBahan(b.id, { nama: nama.trim(), harga, satuan: satuan.trim(), isi: isiBaru, kategoriId: kat, unit })
            setMenyimpan(false)
            if (ok) tutup()
          }
          return (
            <>
              <FieldLabel>Nama</FieldLabel>
              <TextInput value={nama} onChange={setNama} ariaLabel="Nama bahan" />
              {kembar && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">Nama itu sudah dipakai bahan lain.</p>}

              <FieldLabel>Harga per {satuan.trim() || b.satuan}{baru ? ' (boleh dikosongkan dulu)' : ''}</FieldLabel>
              <Stepper value={nilai} onChange={setNilai} step={500} awalan="Rp" ariaLabel={baru ? 'Harga' : 'Harga baru'} />

              {ubah ? (
                <div className="hpp-reveal mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <FieldLabel>Satuan beli</FieldLabel>
                  <ChipRow>
                    {opsiSatuan(b.satuan, model.satuanBeli).map((s) => <Chip key={s} on={satuan === s} onClick={() => pilihSatuan(s)}>{s}</Chip>)}
                  </ChipRow>
                  <FieldLabel>Satuan pembagi (hitung HPP per)</FieldLabel>
                  <ChipRow>
                    {opsiSatuan(b.unit, model.satuanDasar).map((u) => <Chip key={u} on={unit === u} onClick={() => pilihUnit(u)}>{u}</Chip>)}
                  </ChipRow>
                  {bahanDipakai && (
                    <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Takaran di resep/menu yang memakai bahan ini tidak ikut dikonversi (tetap angka yang sama dalam {unit}). Cek lagi setelah simpan.
                    </p>
                  )}
                  <FieldLabel>Isi per {satuan.trim() || b.satuan} (dibagi per {unit})</FieldLabel>
                  <Stepper value={isi} onChange={setIsi} step={unit === 'gr' || unit === 'ml' ? 100 : 1} akhiran={unit} ariaLabel="Isi per satuan" />
                  <FieldLabel>Kategori bahan</FieldLabel>
                  <Dropdown value={kat} options={model.kategoriBahan} onChange={setKat} label="Kategori bahan" placeholder="Pilih kategori" />
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2.5 text-sm text-slate-500">
                  <span className="min-w-0">Satuan: <b className="text-slate-800">{labelSatuan(b)}</b></span>
                  <button type="button" onClick={() => setUbah(true)}
                    className="flex-none rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-bold text-accent-600 active:scale-95">Ubah</button>
                </div>
              )}

              <Pratinjau>
                {valid && hitungBaru !== null
                  ? (
                    <>
                      {rupiah(harga)}/{satuan.trim()} ÷ {angka(isiBaru)} {unit} = <b className="text-slate-900">{rupiahUnit(hitungBaru)}</b>/{unit}{' '}
                      {lama !== null && lama > 0 && Math.abs(hitungBaru / lama - 1) > 0.0005 && (
                        <>
                          <DeltaPersen nilai={(hitungBaru / lama - 1) * 100} /> <span className="text-xs text-slate-400">dari {rupiahUnit(lama)}</span>
                        </>
                      )}
                    </>
                  )
                  : valid
                    ? <span className="text-slate-500">Harga dikosongkan: bahan tampil "Belum diisi" sampai harganya diisi lewat Update harga.</span>
                    : <span className="text-slate-400">Isi nama{baru ? '' : ', harga,'} dan isi per satuan dengan benar.</span>}
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
