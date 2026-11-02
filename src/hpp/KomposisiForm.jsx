import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { bisaTambahSub } from './hppModel'
import { Chip, ChipRow, SearchBox, Stepper, langkahUnit, qtyAwal } from './ui'

/**
 * Daftar komponen yang diubah di form (Edit resep / Edit menu). Baris = draft (lihat draftDariMenu / draftDariResep di
 * hppModel.js): takaran dengan tombol − / +, tombol × menghapus, dan "Tambah komponen" membuka pemilih bahan/resep.
 * Tidak menyimpan apa pun: semua perubahan hanya ada di draft sampai tombol Simpan di form induk ditekan.
 *  - untuk = { tipe: 'menu' } atau { tipe: 'resep', resepId } (resep tidak boleh memuat dirinya sendiri / membuat lingkaran).
 *  - draft + onChange(draftBaru).
 */
export default function KomposisiForm({ model, untuk, draft, onChange }) {
  const [pilih, setPilih] = useState(false)

  const info = (d) => {
    if (d.kind === 'bahan') { const b = model.bahan[d.ref]; return { nama: b?.nama ?? '(bahan dihapus)', unit: b?.unit ?? '' } }
    const r = model.resep[d.ref]
    return { nama: r?.nama ?? '(resep dihapus)', unit: r?.hasilUnit || 'porsi' }
  }
  const ubahQty = (key, qty) => onChange(draft.map((d) => (d.key === key ? { ...d, qty } : d)))
  const hapus = (key) => onChange(draft.filter((d) => d.key !== key))
  const tambah = (kind, ref, unit) => {
    onChange([...draft, { key: `baru-${kind}-${ref}`, id: null, kind, ref, qty: String(qtyAwal(unit)) }])
    setPilih(false)
  }

  return (
    <div>
      {draft.length === 0 && <p className="py-2 text-sm text-slate-400">Belum ada komponen.</p>}
      {draft.map((d) => {
        const { nama, unit } = info(d)
        return (
          <div key={d.key} className="flex items-center gap-2 border-t border-slate-100 py-2 first:border-t-0">
            <span className="min-w-0 flex-1 text-sm leading-tight text-slate-700">{nama}</span>
            <div className="w-44 flex-none">
              <Stepper kecil value={d.qty} onChange={(v) => ubahQty(d.key, v)} step={langkahUnit(unit)} akhiran={unit} ariaLabel={`Takaran ${nama}`} />
            </div>
            <button type="button" aria-label={`Hapus ${nama}`} onClick={() => hapus(d.key)}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 active:scale-95">
              <X size={16} />
            </button>
          </div>
        )
      })}
      {pilih
        ? <Pemilih model={model} untuk={untuk} draft={draft} onPilih={tambah} onBatal={() => setPilih(false)} />
        : (
          <button type="button" onClick={() => setPilih(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-accent-300 py-2.5 text-sm font-bold text-accent-700 active:scale-[0.98]">
            <Plus size={14} aria-hidden="true" />Tambah komponen
          </button>
        )}
    </div>
  )
}

/** Pemilih komponen: tab Bahan / Resep + pencarian. Yang sudah ada di draft tidak ditawarkan lagi. */
function Pemilih({ model, untuk, draft, onPilih, onBatal }) {
  const [tab, setTab] = useState('bahan')
  const [q, setQ] = useState('')
  const cari = q.trim().toLowerCase()
  const sudah = useMemo(() => new Set(draft.map((d) => `${d.kind}:${d.ref}`)), [draft])

  const daftar = useMemo(() => {
    if (tab === 'bahan') {
      return model.bahanList.filter((b) => !sudah.has(`bahan:${b.id}`) && b.nama.toLowerCase().includes(cari))
        .map((b) => ({ kind: 'bahan', id: b.id, nama: b.nama, info: `per ${b.satuan}`, unit: b.unit }))
    }
    return Object.values(model.resep)
      .filter((r) => !sudah.has(`resep:${r.id}`) && r.nama.toLowerCase().includes(cari))
      .filter((r) => untuk.tipe !== 'resep' || bisaTambahSub(model, untuk.resepId, r.id))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
      .map((r) => ({ kind: 'resep', id: r.id, nama: r.nama, info: r.grup, unit: r.hasilUnit || 'porsi' }))
  }, [model, tab, cari, sudah, untuk])

  return (
    <div className="hpp-reveal mt-2 rounded-2xl border border-accent-200 bg-accent-50/40 p-3">
      <ChipRow>
        <Chip on={tab === 'bahan'} onClick={() => setTab('bahan')}>Bahan baku</Chip>
        <Chip on={tab === 'resep'} onClick={() => setTab('resep')}>Resep</Chip>
      </ChipRow>
      <SearchBox value={q} onChange={setQ} placeholder={tab === 'bahan' ? 'Cari bahan' : 'Cari resep'} />
      <ul className="mb-2 max-h-48 overflow-y-auto rounded-xl border border-slate-100 bg-white">
        {daftar.length === 0 && <li className="px-3 py-3 text-xs text-slate-400">Tidak ada yang cocok</li>}
        {daftar.slice(0, 40).map((d) => (
          <li key={`${d.kind}-${d.id}`}>
            <button type="button" onClick={() => onPilih(d.kind, d.id, d.unit)}
              className="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-left first:border-t-0 active:bg-accent-50">
              <span className="min-w-0 truncate font-semibold text-slate-800">{d.nama}</span>
              <span className="flex-none text-xs text-slate-400">{d.info}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onBatal} className="w-full rounded-2xl bg-slate-100 py-2 text-sm font-bold text-slate-600 active:scale-[0.98]">Tutup pilihan</button>
    </div>
  )
}
