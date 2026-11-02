import { kelompokkan, perubahanTerakhir, riwayatBahanRows } from './hppModel'
import { labelSatuan, rupiah, rupiahUnit } from './hppFormat'
import { Card, DeltaPersen, PilBelumDiisi, PilNetral, TombolAksi } from './ui'
import DaftarKelompok, { BarisLipat, RiwayatMini, useBarisTerbuka } from './DaftarUi'

/**
 * Tab Bahan baku: bahan per kategori (kategori menguncup di awal). Ketuk bahan untuk melihat riwayat harganya;
 * tombol Update harga membuka form (BahanSheet). `q` = kata cari dari bilah atas (HppApp).
 * `awalBuka` / `awalTerbuka` hanya untuk tes.
 */
export default function BahanTab({ model, onOpen, q = '', awalBuka = false, awalTerbuka = [] }) {
  const [terbuka, toggle] = useBarisTerbuka(awalTerbuka)
  const cari = q.trim().toLowerCase()
  const daftar = model.bahanList.filter((b) => b.nama.toLowerCase().includes(cari))
  const grup = kelompokkan(daftar, model.kategoriBahan, (b) => b.kategoriId)
  const kosong = model.bahanList.filter((b) => b.harga === null).length

  return (
    <section>
      <DaftarKelompok grup={grup} cari={cari} awalBuka={awalBuka} kosong="Tidak ada bahan yang cocok"
        renderItem={(b) => {
          const p = perubahanTerakhir(model, b.id)
          return (
            <BarisLipat key={b.id} buka={terbuka.has(b.id)} onToggle={() => toggle(b.id)} judul={b.nama}
              sub={`per ${labelSatuan(b)}${b.harga ? ` · ≈ ${rupiahUnit(b.harga / b.isi)}/${b.unit}` : ''}`}
              nilai={b.harga === null ? <PilBelumDiisi /> : <span className="font-bold tabular-nums text-slate-800">{rupiah(b.harga)}</span>}
              chip={b.harga === null ? null : (p ? <DeltaPersen nilai={p.persen} /> : <PilNetral>Harga awal</PilNetral>)}>
              {b.harga === null
                ? <p className="text-xs text-slate-400">Harga belum diisi.</p>
                : <RiwayatMini judul="Riwayat harga" akhiran={`/${b.satuan}`}
                  entri={riwayatBahanRows(model, b.id).map((e) => ({ id: e.id, pada: e.pada, nilai: e.harga, persen: e.persen }))} />}
              <TombolAksi onClick={() => onOpen(b.id)}>{b.harga === null ? 'Isi harga' : 'Update harga'}</TombolAksi>
            </BarisLipat>
          )
        }} />
      {kosong > 0 && !cari && (
        <Card padded className="mt-1 text-xs text-slate-500">
          <b className="text-amber-700">{kosong} bahan</b> belum ada harganya. Menu yang memakainya dihitung tanpa bahan itu.
        </Card>
      )}
    </section>
  )
}
