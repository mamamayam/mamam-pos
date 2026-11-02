import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { draftSalinDariMenu, menuSumberSalin } from './hppModel'
import { SearchBox } from './ui'

/**
 * Tombol "Salin dari menu lain" di form Edit menu (permintaan pemilik 2 Nov 2026: menu yang komponennya hampir sama, mis. ricebox beda saos,
 * tinggal disalin lalu diubah bagian yang beda). Memilih menu sumber MENGGANTI seluruh komposisi draft dengan komponen menu itu; tidak menyimpan
 * apa pun sampai Simpan di form induk (Batal membuang). Menu sumber tidak diubah.
 *  - menuId: menu yang sedang diedit (tidak ditawarkan sebagai sumber); jumlahSekarang: banyak komponen di draft sekarang.
 */
export default function SalinKomposisi({ model, menuId, jumlahSekarang, onSalin }) {
  const [buka, setBuka] = useState(false)
  const [q, setQ] = useState('')
  const daftar = useMemo(() => menuSumberSalin(model, menuId, q), [model, menuId, q])
  const namaKategori = (id) => model.kategoriMenu.find((k) => k.id === id)?.nama ?? ''

  if (!buka) {
    return (
      <button type="button" onClick={() => setBuka(true)}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600 active:scale-[0.98]">
        <Copy size={14} aria-hidden="true" />Salin dari menu lain
      </button>
    )
  }
  return (
    <div className="hpp-reveal mt-2 rounded-2xl border border-accent-200 bg-accent-50/40 p-3" data-testid="salin-komposisi">
      <p className="mb-2 text-xs text-slate-500">
        Pilih menu yang komponennya mau disalin.
        {jumlahSekarang > 0 ? ` ${jumlahSekarang} komponen di form ini akan diganti` : ''}
        {jumlahSekarang > 0 ? ' (baru berlaku setelah Simpan).' : ''}
      </p>
      <SearchBox value={q} onChange={setQ} placeholder="Cari menu" />
      <ul className="mb-2 max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-white">
        {daftar.length === 0 && <li className="px-3 py-3 text-xs text-slate-400">Tidak ada menu yang cocok</li>}
        {daftar.slice(0, 60).map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => { onSalin(draftSalinDariMenu(m)); setBuka(false); setQ('') }}
              className="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-left first:border-t-0 active:bg-accent-50">
              <span className="min-w-0 truncate font-semibold text-slate-800">{m.nama}</span>
              <span className="flex-none text-xs text-slate-400">{namaKategori(m.kategoriId)} · {m.items.length} komponen</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => { setBuka(false); setQ('') }} className="w-full rounded-2xl bg-slate-100 py-2 text-sm font-bold text-slate-600 active:scale-[0.98]">Tutup pilihan</button>
    </div>
  )
}
