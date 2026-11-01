import { useMemo, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { ctxAcuan, hargaMinimal, makeCtx, menuBahanKosong, menuInfo, menuParts, menusUsingResep, resepRows } from './hppModel'
import { angka, persen, rupiah } from './hppFormat'
import KomposisiPicker from './KomposisiPicker'
import { Card, Chip, ChipRow, Delta, Hero, HeroLabel, NumberField, ProporsiBar, SectionLabel, Sheet, TierBadge } from './ui'

const WARNA_TIER = { HIGH: 'text-emerald-400', SEDANG: 'text-blue-300', LOW: 'text-amber-400' }

/** Popup "Modal menu": rincian modal, komposisi, dan harga bahan yang bisa diubah langsung. */
export default function MenuSheet({ model, menuId, actions, onClose }) {
  const [catatan, setCatatan] = useState('')
  const [edit, setEdit] = useState(false)
  const [picker, setPicker] = useState(null)   // null | 'menu' | id resep yang sedang ditambah isinya
  const m = model.menu.find((x) => x.id === menuId)
  const ctx = useMemo(() => makeCtx(model), [model])
  const acuan = useMemo(() => ctxAcuan(model), [model])
  if (!m) return null

  const info = menuInfo(model, ctx, m)
  const delta = info.hpp - acuan.menuHpp(m)
  const parts = menuParts(model, ctx, m)
  const kosong = menuBahanKosong(model, m)
  const minimal = info.tier === 'HIGH' ? 0 : hargaMinimal(info.hpp, model.margin.hi)

  const ubahHarga = async (bahanId, harga) => {
    const b = model.bahan[bahanId]
    const ok = await actions.ubahHarga({ bahanId, harga, catatan: `Diubah dari modal menu ${m.nama}`, sumber: 'modal_menu' })
    if (ok) setCatatan(`${b.nama} diubah ke ${rupiah(harga)}. Tercatat di riwayat harga.`)
    return ok   // false = gagal: isian tetap terbuka (lihat NumberField)
  }

  return (
    <Sheet title={m.nama} onClose={onClose}>
      <SectionLabel className="mb-1.5">Kategori menu</SectionLabel>
      <ChipRow>
        {model.kategoriMenu.map((k) => (
          <Chip key={k.id} on={m.kategoriId === k.id} onClick={() => actions.kategoriMenu(m.id, k.id)}>{k.nama}</Chip>
        ))}
      </ChipRow>

      <Hero>
        <HeroLabel>Modal (HPP)</HeroLabel>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-heading text-4xl font-bold tabular-nums">{rupiah(info.hpp)}</span>
          <Delta value={delta} className="text-xs" />
        </div>
        <ProporsiBar parts={parts} total={info.hpp} gelap />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-slate-800 px-3 py-2">
            <HeroLabel>Harga jual</HeroLabel>
            <NumberField value={m.hargaOutlet} ariaLabel="Harga jual outlet" align="left"
              onCommit={(v) => actions.hargaJual(m.id, v)} gelap className="mt-0.5 w-full !px-0 !py-0.5 !border-transparent font-heading text-lg" />
          </div>
          <div className="rounded-2xl bg-slate-800 px-3 py-2">
            <HeroLabel>Margin</HeroLabel>
            <div className={`font-heading text-lg font-bold ${WARNA_TIER[info.tier]}`}>{persen(info.pct)} {info.tier}</div>
            <div className="text-xs text-slate-400">Profit {rupiah(info.profit)} · Online {rupiah(info.online)}</div>
          </div>
        </div>
        {minimal > 0 && (
          <p className="mt-3 text-xs text-slate-300">Agar margin HIGH ({persen(model.margin.hi, 0)}), harga jual minimal {rupiah(minimal)}.</p>
        )}
      </Hero>

      {kosong.length > 0 && (
        <p className="mb-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Belum ada harga untuk: {kosong.join(', ')}. Modal di atas belum termasuk bahan ini.
        </p>
      )}
      {catatan && <p className="mb-2 px-1 text-xs font-semibold text-accent-600" role="status">{catatan}</p>}

      <Card>
        <div className="flex items-center justify-between pb-1 pt-3">
          <SectionLabel>Komposisi modal</SectionLabel>
          <button type="button" onClick={() => { setEdit((v) => !v); setPicker(null) }} aria-pressed={edit}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold active:scale-95 ${edit ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <Pencil size={12} aria-hidden="true" />{edit ? 'Selesai' : 'Ubah komposisi'}
          </button>
        </div>
        {edit && <p className="pb-1 text-xs text-slate-400">Ubah takaran, hapus, atau tambah komponen. Ketuk resep untuk mengubah isinya.</p>}
        {parts.filter((p) => p.kind !== 'lain').map((p, i) => (
          p.kind === 'bahan' ? (
            <BahanLine key={`b-${p.itemId}`} model={model} bahanId={p.id} qty={p.qty} biaya={p.biaya} onHarga={ubahHarga}
              edit={edit} onQty={(v) => actions.ubahQtyMenuItem(p.itemId, v)}
              onHapus={() => { actions.hapusMenuItem(p.itemId); setCatatan(`${p.nama} dihapus dari menu ini.`) }} />
          ) : (
            <ResepLine key={`r-${p.itemId}`} model={model} ctx={ctx} resepId={p.id} qty={p.qty} biaya={p.biaya}
              total={info.hpp} onHarga={ubahHarga} edit={edit} actions={actions} picker={picker} setPicker={setPicker} lapor={setCatatan}
              onQty={(v) => actions.ubahQtyMenuItem(p.itemId, v)}
              onHapus={() => { actions.hapusMenuItem(p.itemId); setCatatan(`${p.nama} dihapus dari menu ini.`) }} />
          )
        ))}

        <div className="flex items-start justify-between gap-3 border-t border-slate-100 py-2.5">
          <div className="pt-1">
            <div className="font-semibold text-slate-800">Biaya lain</div>
          </div>
          <NumberField value={Math.round(m.biayaLain)} ariaLabel="Biaya lain" onCommit={(v) => actions.biayaLain(m.id, v)} />
        </div>

        {edit && (picker === 'menu' ? (
          <KomposisiPicker model={model} untuk={{ tipe: 'menu' }} biayaLain={m.biayaLain}
            sudah={m.items.map((it) => (it.bahanId ? `b:${it.bahanId}` : `r:${it.resepId}`))}
            onBatal={() => setPicker(null)}
            onTambah={async ({ kind, id, qty, kurangiBiayaLain }) => {
              const ok = await actions.tambahKomposisiMenu(m.id, kind === 'bahan' ? { bahanId: id, qty, kurangiBiayaLain } : { resepId: id, qty, kurangiBiayaLain })
              if (ok) setCatatan('Komponen ditambahkan ke menu ini.')
              return ok
            }} />
        ) : (
          <TombolTambah onClick={() => setPicker('menu')}>Tambah komponen</TombolTambah>
        ))}
      </Card>
      {edit && (
        <p className="mt-2 text-xs text-slate-400">
          Komponen menu dan isi resep disimpan langsung. Isi resep berlaku untuk semua menu yang memakai resep itu.
        </p>
      )}
    </Sheet>
  )
}

export function TombolTambah({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="mb-2 mt-1 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-accent-300 py-2 text-sm font-bold text-accent-700 active:scale-[0.98]">
      <Plus size={14} aria-hidden="true" />{children}
    </button>
  )
}

function TombolHapus({ label, onClick }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-95">
      <Trash2 size={14} />
    </button>
  )
}

/** Satu baris bahan langsung. Normal: harga per satuan beli bisa diedit. Mode ubah: takaran + hapus. */
export function BahanLine({ model, bahanId, qty, biaya, onHarga, dalam = false, edit = false, onQty, onHapus }) {
  const b = model.bahan[bahanId]
  if (!b) return null
  return (
    <div className={`flex items-start justify-between gap-3 border-t border-slate-100 ${dalam ? 'py-1.5' : 'py-2.5'}`}>
      <div className="min-w-0 pt-1">
        <div className={`truncate ${dalam ? 'text-slate-600' : 'font-semibold text-slate-800'}`}>{b.nama}</div>
        <div className="text-xs text-slate-400">
          {edit ? `${rupiah(biaya)} · ${rupiah(b.harga === null ? 0 : b.harga / b.isi)}/${b.unit}` : `${angka(qty)} ${b.unit} · ${rupiah(biaya)}`}
        </div>
      </div>
      {edit ? (
        <div className="flex flex-none items-start gap-1.5">
          <NumberField value={qty} ariaLabel={`Takaran ${b.nama}`} className="!w-20" onCommit={(v) => onQty(v)}
            suffix={<span className="w-8 text-xs text-slate-400">{b.unit}</span>} />
          <TombolHapus label={`Hapus ${b.nama}`} onClick={onHapus} />
        </div>
      ) : (
        <div className="flex-none">
          <NumberField value={b.harga} placeholder="isi harga" ariaLabel={`Harga ${b.nama}`} onCommit={(v) => onHarga(bahanId, v)}
            suffix={<span className="w-12 text-xs text-slate-400">/{b.satuan}</span>} />
        </div>
      )}
    </div>
  )
}

/** Satu baris resep yang bisa dibuka: lihat isi, ubah harga bahan, dan (mode ubah) ubah/hapus/tambah isinya. */
export function ResepLine({ model, ctx, resepId, qty, biaya, total, onHarga, dalam = false, stack = [], edit = false, actions, picker, setPicker, lapor, onQty, onHapus }) {
  const [buka, setBuka] = useState(false)
  const r = model.resep[resepId]
  if (!r) return null
  const aman = !stack.includes(resepId)
  const rows = buka && aman ? resepRows(model, ctx, resepId) : []
  const nMenu = menusUsingResep(model, resepId).length
  const unit = r.hasilUnit || 'porsi'

  const hapusIsi = (row) => {
    const ok = typeof window === 'undefined' || window.confirm(`Hapus ${row.nama} dari resep ${r.nama}? Berlaku untuk ${nMenu} menu yang memakai resep ini.`)
    if (!ok) return
    actions.hapusResepItem(row.itemId)
    lapor(`${row.nama} dihapus dari resep ${r.nama}.`)
  }

  return (
    <div className="border-t border-slate-100">
      <div className={`flex items-start justify-between gap-3 ${dalam ? 'py-1.5' : 'py-2.5'}`}>
        <button type="button" onClick={() => setBuka((v) => !v)} aria-expanded={buka} className="min-w-0 pt-1 text-left">
          <span className={`flex items-center gap-1 ${dalam ? 'text-slate-600' : 'font-semibold text-slate-800'}`}>
            <span className="truncate">{r.nama}</span>
            <ChevronDown size={14} className={`flex-none text-slate-400 transition-transform ${buka ? 'rotate-180' : ''}`} />
          </span>
          <span className="block text-xs text-slate-400">
            Resep, {r.items.length} bahan{r.hasilQty ? ` · batch ${angka(r.hasilQty)} ${r.hasilUnit || ''}` : ''} · {rupiah(biaya)}{total > 0 ? ` (${Math.round((biaya / total) * 100)}%)` : ''}
          </span>
        </button>
        {edit ? (
          <div className="flex flex-none items-start gap-1.5">
            <NumberField value={qty} ariaLabel={`Takaran ${r.nama}`} className="!w-20" onCommit={(v) => onQty(v)}
              suffix={<span className="w-9 text-xs text-slate-400">{unit}</span>} />
            <TombolHapus label={`Hapus ${r.nama}`} onClick={onHapus} />
          </div>
        ) : (
          <span className="flex-none pt-1 font-semibold tabular-nums text-slate-800">{rupiah(biaya)}</span>
        )}
      </div>

      {buka && (
        <div className="mb-1.5 ml-1 border-l-2 border-slate-200 pl-3">
          {edit && <p className="pb-1 text-xs text-amber-700">Resep ini dipakai di {nMenu} menu. Perubahan isinya berlaku untuk semuanya.</p>}
          {rows.map((row) => (
            row.kind === 'bahan'
              ? <BahanLine key={`b-${row.itemId}`} model={model} bahanId={row.id} qty={row.qty} biaya={row.biaya} onHarga={onHarga} dalam
                edit={edit} onQty={(v) => actions.ubahQtyResepItem(row.itemId, v)} onHapus={() => hapusIsi(row)} />
              : <ResepLine key={`r-${row.itemId}`} model={model} ctx={ctx} resepId={row.id} qty={row.qty} biaya={row.biaya} total={0} onHarga={onHarga}
                dalam stack={[...stack, resepId]} edit={edit} actions={actions} picker={picker} setPicker={setPicker} lapor={lapor}
                onQty={(v) => actions.ubahQtyResepItem(row.itemId, v)} onHapus={() => hapusIsi(row)} />
          ))}
          {edit && aman && (picker === resepId ? (
            <KomposisiPicker model={model} untuk={{ tipe: 'resep', resepId }}
              sudah={r.items.map((it) => (it.bahanId ? `b:${it.bahanId}` : `r:${it.subResepId}`))}
              onBatal={() => setPicker(null)}
              onTambah={async ({ kind, id, qty: q }) => {
                const ok = await actions.tambahKomposisiResep(resepId, kind === 'bahan' ? { bahanId: id, qty: q } : { subResepId: id, qty: q })
                if (ok) lapor(`Isi resep ${r.nama} ditambah.`)
                return ok
              }} />
          ) : (
            <TombolTambah onClick={() => setPicker(resepId)}>Tambah ke resep {r.nama}</TombolTambah>
          ))}
        </div>
      )}
    </div>
  )
}
