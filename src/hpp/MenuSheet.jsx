import { useMemo, useState } from 'react'
import { draftBerubah, draftDariMenu, draftValid, hargaMinimal, itemsMenuDariDraft, makeCtx, menuInfo, namaSudahDipakai } from './hppModel'
import { parseAngka, persen, rupiah } from './hppFormat'
import { Delta, Dropdown, FieldLabel, Pratinjau, Sheet, Stepper, TextInput, TierBadge, TombolForm } from './ui'
import KomposisiForm from './KomposisiForm'
import SalinKomposisi from './SalinKomposisi'

/** Isian awal form Menu baru: tanpa nama, kategori, harga, dan komponen. */
const MENU_KOSONG = { id: null, nama: '', kategoriId: null, hargaOutlet: 0, items: [] }

/**
 * Form "Edit menu": nama, kategori (dropdown), harga jual, dan komposisi (takaran − / +, hapus, tambah, atau salin dari menu lain). Tidak ada kolom "Biaya lain"
 * dan modal hanya dari komponen (permintaan pemilik 2 Nov 2026). Semua perubahan hanya draft sampai Simpan; pratinjau memperlihatkan modal dan margin
 * lama → baru. `actions.simpanMenu` (HppApp) menyimpan semuanya sekaligus.
 *
 * `baru` = form "Menu baru" (tombol Tambah di tab Menu): isian yang sama dari kosong, termasuk "Salin dari menu lain" untuk menyusun komposisi.
 * Kategori boleh dikosongkan (menu masuk "Lainnya"), komposisi boleh diisi nanti, nama kembar dalam kategori yang sama ditolak. Simpan memanggil `actions.buatMenu`.
 */
export default function MenuSheet({ model, menuId, actions, onClose, baru = false }) {
  const m = baru ? MENU_KOSONG : model.menu.find((x) => x.id === menuId)
  const [nama, setNama] = useState(() => m?.nama ?? '')
  const [kat, setKat] = useState(() => m?.kategoriId ?? null)
  const [jual, setJual] = useState(() => (m && !baru ? String(m.hargaOutlet) : ''))
  const [draft, setDraft] = useState(() => (m ? draftDariMenu(m) : []))
  const [menyimpan, setMenyimpan] = useState(false)

  const harga = parseAngka(jual)
  const kembar = baru && namaSudahDipakai(model.menu.filter((x) => (x.kategoriId ?? null) === (kat ?? null)).map((x) => x.nama), nama)
  const valid = !!m && nama.trim() !== '' && !kembar && harga !== null && harga > 0 && draftValid(draft)
  const asli = useMemo(() => (m ? draftDariMenu(m) : []), [m])
  const berubah = valid && (baru || nama.trim() !== m.nama || kat !== m.kategoriId || harga !== m.hargaOutlet || draftBerubah(asli, draft))

  const hitung = useMemo(() => {
    if (!valid) return null
    const lama = menuInfo(model, makeCtx(model), m)
    const mBaru = { ...m, hargaOutlet: harga, items: itemsMenuDariDraft(draft) }
    const sesudah = { ...model, menu: model.menu.map((x) => (x.id === m.id ? mBaru : x)) }
    return { lama, baru: menuInfo(sesudah, makeCtx(sesudah), mBaru) }
  }, [model, valid, m, harga, draft])
  if (!m) return null

  const minimal = hitung && hitung.baru.tier !== 'HIGH' ? hargaMinimal(hitung.baru.hpp, model.margin.hi) : 0

  return (
    <Sheet title={baru ? 'Menu baru' : 'Edit menu'} onClose={onClose}>
      {(tutup) => {
        const simpan = async () => {
          if (!berubah || menyimpan) return
          setMenyimpan(true)
          const v = { nama: nama.trim(), kategoriId: kat, hargaOutlet: harga, items: itemsMenuDariDraft(draft) }
          const ok = baru ? await actions.buatMenu(v) : await actions.simpanMenu(m.id, v)
          setMenyimpan(false)
          if (ok) tutup()
        }
        return (
          <>
            <FieldLabel>Nama</FieldLabel>
            <TextInput value={nama} onChange={setNama} ariaLabel="Nama menu" />
            {kembar && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">Nama itu sudah dipakai menu lain di kategori ini.</p>}

            <FieldLabel>Kategori menu</FieldLabel>
            <Dropdown value={kat} options={model.kategoriMenu} onChange={setKat} label="Kategori menu" placeholder={baru ? 'Pilih kategori (boleh kosong)' : 'Pilih kategori'} />

            <FieldLabel>Harga jual</FieldLabel>
            <Stepper value={jual} onChange={setJual} step={500} awalan="Rp" ariaLabel="Harga jual outlet" />

            <FieldLabel>Komposisi</FieldLabel>
            <KomposisiForm model={model} untuk={{ tipe: 'menu' }} draft={draft} onChange={setDraft} />
            <SalinKomposisi model={model} menuId={m.id} jumlahSekarang={draft.length} onSalin={setDraft} />

            <Pratinjau>
              {hitung
                ? (
                  <>
                    {baru
                      ? <>Modal <b className="text-slate-900">{rupiah(hitung.baru.hpp)}</b></>
                      : (
                        <>
                          Modal {rupiah(hitung.lama.hpp)} → <b className="text-slate-900">{rupiah(hitung.baru.hpp)}</b>{' '}
                          <Delta value={hitung.baru.hpp - hitung.lama.hpp} className="text-xs" />
                        </>
                      )}
                    {baru && draft.length === 0
                      ? <div className="mt-1.5 text-xs text-slate-400">Komposisi boleh diisi nanti lewat Edit; menu tanpa komponen tampil "Belum diisi".</div>
                      : (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>Margin</span><TierBadge tier={hitung.baru.tier} pct={hitung.baru.pct} />
                          <span>· Profit {rupiah(hitung.baru.profit)} · Online {rupiah(hitung.baru.online)}</span>
                        </div>
                      )}
                    {minimal > 0 && !(baru && draft.length === 0) && <div className="mt-1.5 text-xs text-slate-500">Agar margin HIGH ({persen(model.margin.hi, 0)}), harga jual minimal {rupiah(minimal)}.</div>}
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
