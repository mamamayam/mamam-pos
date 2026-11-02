import { useMemo, useState } from 'react'
import { ArrowUp, Trash2, X } from 'lucide-react'
import { MAKS_NAMA_SATUAN, ctxAcuan, makeCtx, menuInfo, pemakaiSatuan, rapikanSatuan } from './hppModel'
import { Card, Hero, SectionLabel, Sheet } from './ui'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function Stepper({ label, nilai, onUbah, satuan = '%', step = 1, min = 0, max = 90 }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 py-2.5 first:border-t-0">
      <span className="font-semibold text-slate-800">{label}</span>
      <span className="inline-flex items-center gap-1.5">
        <button type="button" aria-label={`Kurangi ${label}`} onClick={() => onUbah(clamp(nilai - step, min, max))}
          className="h-8 w-8 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 active:scale-95">−</button>
        <span className="w-14 text-center font-heading font-bold tabular-nums">{nilai}{satuan}</span>
        <button type="button" aria-label={`Tambah ${label}`} onClick={() => onUbah(clamp(nilai + step, min, max))}
          className="h-8 w-8 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 active:scale-95">+</button>
      </span>
    </div>
  )
}

function KategoriEditor({ jenis, daftar, terpakai, actions }) {
  const [baru, setBaru] = useState('')
  const [draft, setDraft] = useState({})
  const tambah = () => { if (baru.trim()) { actions.tambahKategori(jenis, baru); setBaru('') } }
  return (
    <>
      {daftar.map((k, i) => {
        const n = terpakai(k.id)
        return (
          <div key={k.id} className="flex items-center gap-1.5 border-t border-slate-100 py-2 first:border-t-0">
            <input
              aria-label={`Nama kategori ${k.nama}`} value={draft[k.id] ?? k.nama}
              onChange={(e) => setDraft((d) => ({ ...d, [k.id]: e.target.value }))}
              onBlur={() => { const v = draft[k.id]; setDraft((d) => { const x = { ...d }; delete x[k.id]; return x }); if (v !== undefined && v.trim() && v.trim() !== k.nama) actions.ubahNamaKategori(k.id, v) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-semibold outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
            />
            <span className="w-14 text-right text-xs tabular-nums text-slate-400">{n} item</span>
            <button type="button" aria-label={`Naikkan ${k.nama}`} disabled={i === 0} onClick={() => actions.tukarKategori(k.id, daftar[i - 1].id)}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 disabled:opacity-30"><ArrowUp size={14} /></button>
            <button type="button" aria-label={`Hapus ${k.nama}`} disabled={n > 0} title={n > 0 ? 'Masih dipakai' : 'Hapus'} onClick={() => actions.hapusKategori(k.id)}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 disabled:opacity-30"><Trash2 size={14} /></button>
          </div>
        )
      })}
      <div className="flex items-center gap-1.5 border-t border-slate-100 py-2">
        <input aria-label={`Kategori ${jenis} baru`} placeholder="Kategori baru" value={baru} onChange={(e) => setBaru(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') tambah() }}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
        <button type="button" onClick={tambah} disabled={!baru.trim()}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40">Tambah</button>
      </div>
    </>
  )
}

/** Daftar pilihan satuan yang bisa ditambah/dihapus. Satuan yang masih dipakai bahan tidak bisa dihapus. Selalu sisakan minimal satu. */
function SatuanEditor({ judul, daftar, pakai, onSimpan }) {
  const [baru, setBaru] = useState('')
  const sudah = daftar.some((x) => x.toLowerCase() === baru.trim().toLowerCase())
  const tambah = () => { if (baru.trim() && !sudah) { onSimpan(rapikanSatuan([...daftar, baru])); setBaru('') } }
  return (
    <>
      <div className="flex flex-wrap gap-1.5 py-2" role="list" aria-label={judul}>
        {daftar.map((s) => {
          const n = pakai[s] || 0
          const kunci = n > 0 || daftar.length <= 1
          return (
            <span key={s} role="listitem" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1.5 text-sm font-semibold text-slate-700">
              {s}
              {n > 0 && <span className="text-xs font-normal tabular-nums text-slate-400">{n}</span>}
              <button type="button" aria-label={`Hapus satuan ${s}`} disabled={kunci} title={n > 0 ? `Masih dipakai ${n} bahan` : 'Hapus'}
                onClick={() => onSimpan(daftar.filter((x) => x !== s))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 active:scale-90 disabled:opacity-30"><X size={13} /></button>
            </span>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-100 py-2">
        <input aria-label={`${judul} baru`} placeholder="Satuan baru" value={baru} maxLength={MAKS_NAMA_SATUAN} onChange={(e) => setBaru(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') tambah() }}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
        <button type="button" onClick={tambah} disabled={!baru.trim() || sudah}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40">Tambah</button>
      </div>
      {sudah && baru.trim() && <p className="pb-2 text-xs text-slate-400">Satuan itu sudah ada.</p>}
    </>
  )
}

/** Pengaturan HPP: batas margin, markup online, kategori bahan dan menu. */
export default function SettingsSheet({ model, actions, email, onKeluar, onClose }) {
  const hitung = useMemo(() => {
    const ctx = makeCtx(model); const c = { LOW: 0, SEDANG: 0, HIGH: 0 }
    model.menu.forEach((m) => { c[menuInfo(model, ctx, m).tier] += 1 })
    return c
  }, [model])
  const { lo, hi } = model.margin
  const total = model.menu.length || 1
  const ubahMargin = (kunci, v) => {
    const next = { ...model.margin, [kunci]: v }
    if (next.lo > next.hi) { if (kunci === 'lo') next.hi = next.lo; else next.lo = next.hi }
    actions.simpanMargin(next)
  }
  const persenOnline = Math.round((model.markup - 1) * 100)

  return (
    <Sheet title="Pengaturan HPP" onClose={onClose} full>
      <Card className="mb-3">
        <SectionLabel className="pb-1 pt-3">Batas margin</SectionLabel>
        <Stepper label="LOW jika margin di bawah" nilai={lo} onUbah={(v) => ubahMargin('lo', v)} />
        <Stepper label="HIGH jika margin mulai dari" nilai={hi} onUbah={(v) => ubahMargin('hi', v)} />
        <div className="py-3">
          <div className="mb-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Sebaran menu per kategori margin">
            {[['LOW', '#f59e0b'], ['SEDANG', '#60a5fa'], ['HIGH', '#10b981']].map(([t, w]) => (hitung[t] ? <div key={t} style={{ flex: hitung[t], background: w }} /> : null))}
          </div>
          <p className="text-xs text-slate-400">
            Saat ini: {hitung.LOW} LOW, {hitung.SEDANG} SEDANG, {hitung.HIGH} HIGH dari {total} menu.{' '}
            {lo < hi ? 'Margin di antara dua batas masuk SEDANG.' : 'Dua batas sama = hanya LOW dan HIGH, tanpa SEDANG.'}
          </p>
        </div>
      </Card>

      <Card className="mb-3">
        <SectionLabel className="pb-1 pt-3">Harga online</SectionLabel>
        <Stepper label="Harga online = outlet +" nilai={persenOnline} step={5} max={100} onUbah={(v) => actions.simpanMarkup(1 + v / 100)} />
      </Card>

      <Card className="mb-3">
        <SectionLabel className="pb-1 pt-3">Satuan beli</SectionLabel>
        <SatuanEditor judul="Satuan beli" daftar={model.satuanBeli} pakai={pemakaiSatuan(model, 'satuan')} onSimpan={(d) => actions.simpanSatuan('satuan_beli', d)} />
      </Card>
      <Card className="mb-1">
        <SectionLabel className="pb-1 pt-3">Satuan pembagi</SectionLabel>
        <SatuanEditor judul="Satuan pembagi" daftar={model.satuanDasar} pakai={pemakaiSatuan(model, 'unit')} onSimpan={(d) => actions.simpanSatuan('satuan_dasar', d)} />
      </Card>
      <p className="mb-3 px-1 text-xs text-slate-400">Pilihan satuan di form Update harga. Angka kecil = jumlah bahan yang memakainya; satuan yang masih dipakai tidak bisa dihapus.</p>

      <Card className="mb-3">
        <SectionLabel className="pb-1 pt-3">Kategori bahan</SectionLabel>
        <KategoriEditor jenis="bahan" daftar={model.kategoriBahan} actions={actions}
          terpakai={(id) => model.bahanList.filter((b) => b.kategoriId === id).length} />
      </Card>

      <Card className="mb-3">
        <SectionLabel className="pb-1 pt-3">Kategori menu</SectionLabel>
        <KategoriEditor jenis="menu" daftar={model.kategoriMenu} actions={actions}
          terpakai={(id) => model.menu.filter((m) => m.kategoriId === id).length} />
      </Card>
      <p className="mb-4 px-1 text-xs text-slate-400">Kategori yang masih dipakai tidak bisa dihapus. Pindahkan item-nya dulu.</p>

      <Card padded>
        <p className="mb-2 text-xs text-slate-400">Masuk sebagai <span className="font-semibold text-slate-600">{email}</span></p>
        <button type="button" onClick={onKeluar}
          className="w-full rounded-2xl bg-red-50 py-2.5 font-bold text-red-600 active:scale-[0.98]">Keluar</button>
      </Card>
    </Sheet>
  )
}
