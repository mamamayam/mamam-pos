import { kelompokkan } from './hppModel'
import { persen, rupiah } from './hppFormat'
import { Card, DeltaPersen, SectionLabel, Sheet, TierBadge } from './ui'

/**
 * Popup "Menu terdampak": menu yang modalnya berubah karena perubahan bahan, dikelompokkan per kategori menu,
 * dengan modal sebelum -> sesudah dan margin. `rows` dari `dampakUbah` (hppModel.js); `judul` = ringkasan perubahannya.
 */
export default function DampakSheet({ model, judul, rows, onClose }) {
  const grup = kelompokkan(rows, model.kategoriMenu, (r) => r.menu.kategoriId)
  return (
    <Sheet title="Menu terdampak" onClose={onClose}>
      {(tutup) => (
        <>
          {judul && <p className="mb-3 text-sm font-semibold text-slate-700">{judul}</p>}
          {grup.length === 0 && <Card padded className="text-center text-xs text-slate-400">Tidak ada menu yang berubah modalnya.</Card>}
          {grup.map((g) => (
            <div key={g.id ?? 'x'} className="mb-3">
              <SectionLabel className="mb-1.5 px-0.5">{g.nama} · {g.items.length}</SectionLabel>
              <Card>
                {g.items.map((r) => (
                  <div key={r.menu.id} className="flex items-start justify-between gap-3 border-t border-slate-100 py-2.5 first:border-t-0">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-800">{r.menu.nama}</div>
                      <div className="flex items-center gap-1 text-xs tabular-nums text-slate-400">
                        <span>margin {persen(r.sebelum.pct)} →</span>
                        <TierBadge tier={r.sesudah.tier} pct={r.sesudah.pct} />
                      </div>
                      {r.ganti && <span className="mt-0.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Berubah kategori</span>}
                    </div>
                    <div className="flex-none text-right">
                      <div className="font-semibold tabular-nums text-slate-800">{rupiah(r.sebelum.hpp)} → {rupiah(r.sesudah.hpp)}</div>
                      <DeltaPersen nilai={r.sebelum.hpp ? (r.selisih / r.sebelum.hpp) * 100 : null} />
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          ))}
          <button type="button" onClick={tutup}
            className="w-full rounded-2xl bg-gradient-to-r from-accent-600 to-accent-500 py-3 font-bold text-white shadow-lg shadow-accent-500/30 active:scale-[0.98]">
            Tutup
          </button>
        </>
      )}
    </Sheet>
  )
}
