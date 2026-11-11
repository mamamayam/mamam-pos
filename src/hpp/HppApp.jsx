import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Settings } from 'lucide-react'
import LoginScreen from './LoginScreen'
import MenuTab from './MenuTab'
import BahanTab from './BahanTab'
import ResepTab from './ResepTab'
import MenuSheet from './MenuSheet'
import BahanSheet from './BahanSheet'
import ResepSheet from './ResepSheet'
import DampakSheet from './DampakSheet'
import SettingsSheet from './SettingsSheet'
import { hppConfigured, hppDb } from './hppClient'
import { keluar, masuk, pulihkanSesi } from './hppAuth'
import { TABS, pathForTab, tabFromPath } from './hppRoutes'
import { useHpp } from './useHpp'
import { dampakUbah, ringkasanDaftar } from './hppModel'
import { ringkasUbahBahan } from './hppFormat'
import { setelahSinkron, useBackLayer, useExitHint } from './hppBackStack'
import { IndikatorTarik, NotifKeluar, SearchBox, Snack } from './ui'
import { useTarikSegarkan } from './useTarikSegarkan'

/**
 * Root HPP (path /hpp dan /hpp/*). Dimuat lewat React.lazy dari src/main.jsx, jadi menjadi
 * chunk terpisah dan TIDAK ikut terunduh di HP yang hanya membuka POS.
 *
 * ATURAN (lihat PRD Routing, dijaga appMode.test.js):
 *  - Berkas di src/hpp hanya boleh mengimpor dari src/hpp, `react`, `lucide-react`, `@supabase/supabase-js`,
 *    ditambah dua modul bersama yang murni (tanpa kode POS): `lib/backStack` (hanya `createBackStack`, lewat
 *    `hppBackStack.js`) dan `components/ui/Overlay` (lewat `ui.jsx`). Jangan menyentuh `auth/*`, `app/*`, atau komponen POS lain.
 *  - Stack navigasi: Back menutup popup dulu, lalu tab Resep / Menu -> Bahan baku (tab awal), lalu notif "Ketuk lagi untuk keluar" lalu keluar ke POS (hppBackStack.js).
 *  - Data HPP dijaga RLS di database (supabase/migrations/013_hpp.sql). Frontend hanya memakai anon key.
 */
export default function HppApp() {
  const [auth, setAuth] = useState({ status: hppConfigured ? 'cek' : 'tidak-diset', email: '' })

  const tampilKeluar = useExitHint()
  const akar = useRef(null)   // elemen <main> yang menggulir: dipakai gestur tarik-untuk-memuat-ulang

  useEffect(() => { document.title = 'Mamam HPP' }, [])
  useEffect(() => {
    if (!hppConfigured) return undefined
    let hidup = true
    pulihkanSesi(hppDb).then((s) => { if (hidup) setAuth(s ? { status: 'masuk', email: s.email } : { status: 'keluar', email: '' }) })
    return () => { hidup = false }
  }, [])

  const login = async (email, password) => {
    const hasil = await masuk(hppDb, email, password)
    if (!hasil.error) setAuth({ status: 'masuk', email: hasil.email })
    return hasil
  }
  const logout = async () => { await keluar(hppDb); setAuth({ status: 'keluar', email: '' }) }

  return (
    <main ref={akar} className="fixed inset-0 overflow-y-auto overscroll-y-contain bg-slate-50 font-body text-slate-800">
      {auth.status === 'tidak-diset' && (
        <Pesan judul="HPP belum tersambung ke database">
          Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di environment, lalu build ulang.
        </Pesan>
      )}
      {auth.status === 'cek' && <Pesan judul="Memeriksa sesi…" />}
      {auth.status === 'keluar' && <LoginScreen onMasuk={login} />}
      {auth.status === 'masuk' && <Cangkang db={hppDb} email={auth.email} onKeluar={logout} akar={akar} />}
      <NotifKeluar tampil={tampilKeluar} />
    </main>
  )
}

/** Nama jenis item untuk label tombol Tambah di tiap tab. */
const LABEL_TAMBAH = { bahan: 'bahan baku', resep: 'resep', menu: 'menu' }

function Pesan({ judul, children, aksi }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-7 text-center shadow-sm">
        <h1 className="font-heading text-lg font-bold text-slate-800">{judul}</h1>
        {children && <p className="mt-2 text-slate-500">{children}</p>}
        {aksi}
      </div>
    </div>
  )
}

function Cangkang({ db, email, onKeluar, akar }) {
  const { model, status, galat, pesan, actions: aksiDasar, raw } = useHpp(db)
  const [tab, setTab] = useState(() => tabFromPath(window.location.pathname))
  const [lembar, setLembar] = useState(null)   // { t: 'menu' | 'resep' | 'bahan' | 'set' | 'dampak', id } ('dampak' membawa judul dan rows); 'bahan-baru' | 'resep-baru' | 'menu-baru' = form tambah, tanpa id
  const [snack, setSnack] = useState(null)     // { pesan, judul, rows } notifikasi setelah data tersimpan
  const [q, setQ] = useState('')               // kata cari bilah atas, dipakai tab yang sedang tampil
  const tutupSnack = useCallback(() => setSnack(null), [])

  // Setelah harga/satuan bahan tersimpan: hitung menu yang ikut berubah (dari model SEBELUM perubahan) lalu tampilkan
  // notifikasi dengan tombol "Lihat" (popup Menu terdampak). Berlaku dari mana pun harga diubah (popup bahan, menu, resep).
  const umumkan = (modelAwal, bahanId, { harga, isi }) => {
    const b = modelAwal.bahan[bahanId]
    if (!b) return
    const d = dampakUbah(modelAwal, bahanId, { harga, isi })
    setSnack({
      pesan: d.rows.length ? `Tersimpan · ${d.rows.length} menu terdampak` : 'Tersimpan',
      judul: ringkasUbahBahan(b, harga ?? b.harga, isi ?? b.isi),
      rows: d.rows,
    })
  }
  const actions = {
    ...aksiDasar,
    /** Simpan form Update harga (nama, harga, satuan, isi, kategori) lalu umumkan menu yang terdampak. */
    async simpanBahan(bahanId, v) {
      const awal = model
      const ok = await aksiDasar.simpanBahan(bahanId, v)
      if (ok) umumkan(awal, bahanId, { harga: v.harga, isi: v.isi })
      return ok
    },
    /** Simpan form Edit resep. `dampak` + `judul` dihitung form (sebelum disimpan) untuk notifikasi. */
    async simpanResep(resepId, v, dampak, judul) {
      const ok = await aksiDasar.simpanResep(resepId, v)
      if (ok) setSnack({ pesan: dampak.rows.length ? `Tersimpan · ${dampak.rows.length} menu terdampak` : 'Tersimpan', judul, rows: dampak.rows })
      return ok
    },
    async simpanMenu(menuId, v) {
      const ok = await aksiDasar.simpanMenu(menuId, v)
      if (ok) setSnack({ pesan: 'Tersimpan', judul: '', rows: [] })
      return ok
    },
    /** Tambah bahan / resep / menu baru (tombol Tambah di bilah atas). Notifikasi menyebut nama yang ditambahkan. */
    async buatBahan(v) {
      const ok = await aksiDasar.buatBahan(v)
      if (ok) setSnack({ pesan: `Bahan "${v.nama}" ditambahkan`, judul: '', rows: [] })
      return ok
    },
    async buatResep(v) {
      const ok = await aksiDasar.buatResep(v)
      if (ok) setSnack({ pesan: `Resep "${v.nama}" ditambahkan`, judul: '', rows: [] })
      return ok
    },
    async buatMenu(v) {
      const ok = await aksiDasar.buatMenu(v)
      if (ok) setSnack({ pesan: `Menu "${v.nama}" ditambahkan`, judul: '', rows: [] })
      return ok
    },
  }

  // Tab selain Bahan baku (tab awal) = satu lapisan di stack navigasi (hppBackStack.js): Back dari Resep / Menu kembali ke Bahan baku,
  // Back dari Bahan baku memunculkan notif, Back kedua meninggalkan HPP (ke POS). Popup (Sheet) menumpuk di atasnya dan ditutup lebih dulu.
  const gantiTab = useCallback((key) => setTab(key), [])
  useBackLayer(tab !== 'bahan', () => setTab('bahan'))
  // Alamat mengikuti tab yang tampil (refresh / bagikan link tetap benar). replaceState, bukan pushState:
  // entri riwayat dikelola backStack, dan state-nya dipertahankan. Dijalankan SETELAH stack menyamakan entri
  // (setelahSinkron), supaya yang diganti entri lapisan tab, bukan entri Menu di bawahnya.
  const tabTerbaru = useRef(tab)
  useEffect(() => {
    tabTerbaru.current = tab
    setelahSinkron(() => {
      const path = pathForTab(tabTerbaru.current)
      if (window.location.pathname === path) return
      try { window.history.replaceState(window.history.state, '', path) } catch { /* abaikan */ }
    })
  }, [tab])
  const tutup = useCallback(() => setLembar(null), [])
  // Tarik daftar ke bawah dari paling atas = muat ulang data (tab, kata cari, dan popup tidak berubah). Pengaman: lihat useTarikSegarkan.js.
  const tarikSegarkan = useTarikSegarkan(akar, { onSegarkan: actions.reload })

  if (status === 'loading') return <Pesan judul="Memuat data HPP…" />
  if (status === 'error') {
    return (
      <Pesan judul={galat?.setup ? 'HPP belum dipasang' : 'Gagal memuat data'}
        aksi={(
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={actions.reload} className="flex-1 rounded-2xl bg-slate-100 py-2.5 font-bold text-slate-600">Coba lagi</button>
            <button type="button" onClick={onKeluar} className="flex-1 rounded-2xl bg-red-50 py-2.5 font-bold text-red-600">Keluar</button>
          </div>
        )}>
        {galat?.pesan}
      </Pesan>
    )
  }

  const jumlah = { bahan: model.bahanList.length, resep: Object.keys(model.resep).length, menu: model.menu.length }
  const adaPerubahan = raw.bahan.some((b) => b.harga_acuan !== null && Number(b.harga_acuan) !== Number(b.harga))

  return (
    <>
      <IndikatorTarik {...tarikSegarkan} />
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <span className="bg-gradient-to-br from-slate-900 to-slate-500 bg-clip-text font-heading text-2xl font-bold text-transparent">HPP</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setLembar({ t: 'set' })} aria-label="Pengaturan"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-95"><Settings size={18} /></button>
            <a href="/" className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">← Ke POS</a>
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16">
        <div className="pb-2 pt-4">
          <h1 className="font-heading text-xl font-bold text-slate-900">Daftar HPP</h1>
          <p className="mt-0.5 text-xs text-slate-400">{ringkasanDaftar(model)}</p>
        </div>

        {/* Tab + pencarian ikut menempel di bawah header saat daftar digulir */}
        <div className="sticky top-14 z-10 -mx-4 bg-slate-50 px-4 pb-1 pt-1.5">
          <nav aria-label="Bagian HPP" className="relative mb-2.5 grid grid-cols-3 rounded-full bg-white shadow-md ring-1 ring-slate-200">
            <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-accent-600 to-accent-500 transition-transform duration-300"
              style={{ transform: `translateX(${Math.max(0, TABS.findIndex((t) => t.key === tab)) * 100}%)` }} aria-hidden="true" />
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => gantiTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}
                className={`relative z-[1] rounded-full py-2.5 text-sm font-semibold transition-colors ${tab === t.key ? 'text-white' : 'text-slate-500'}`}>
                {t.label}<small className="ml-1 font-medium opacity-70">{jumlah[t.key]}</small>
              </button>
            ))}
          </nav>
          <div className="mb-1.5 flex items-stretch gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Cari bahan, saos, menu…" className="min-w-0 flex-1" />
            {/* Tambah item baru di tab yang sedang tampil (Bahan baku / Resep / Menu) */}
            <button type="button" onClick={() => setLembar({ t: `${tab}-baru` })} aria-label={`Tambah ${LABEL_TAMBAH[tab]}`}
              className="flex flex-none items-center gap-1 rounded-2xl bg-gradient-to-r from-accent-600 to-accent-500 px-3.5 text-sm font-bold text-white shadow-md shadow-accent-500/25 active:scale-95">
              <Plus size={16} aria-hidden="true" />Tambah
            </button>
          </div>
        </div>

        {tab === 'bahan' && <BahanTab model={model} q={q} onOpen={(id) => setLembar({ t: 'bahan', id })} />}
        {tab === 'resep' && <ResepTab model={model} q={q} onOpen={(id) => setLembar({ t: 'resep', id })} />}
        {tab === 'menu' && <MenuTab model={model} q={q} onOpen={(id) => setLembar({ t: 'menu', id })} onAcuan={actions.jadikanAcuan} adaPerubahan={adaPerubahan} />}
      </div>

      {lembar?.t === 'menu' && <MenuSheet model={model} menuId={lembar.id} actions={actions} onClose={tutup} />}
      {lembar?.t === 'resep' && <ResepSheet model={model} resepId={lembar.id} actions={actions} onClose={tutup} />}
      {lembar?.t === 'bahan' && <BahanSheet model={model} bahanId={lembar.id} actions={actions} onClose={tutup} />}
      {lembar?.t === 'bahan-baru' && <BahanSheet model={model} baru actions={actions} onClose={tutup} />}
      {lembar?.t === 'resep-baru' && <ResepSheet model={model} baru actions={actions} onClose={tutup} />}
      {lembar?.t === 'menu-baru' && <MenuSheet model={model} baru actions={actions} onClose={tutup} />}
      {lembar?.t === 'dampak' && <DampakSheet model={model} judul={lembar.judul} rows={lembar.rows} onClose={tutup} />}
      {lembar?.t === 'set' && <SettingsSheet model={model} actions={actions} email={email} onKeluar={onKeluar} onClose={tutup} />}

      <Snack pesan={snack?.pesan} aksi={snack?.rows.length ? 'Lihat' : null} onTutup={tutupSnack}
        onAksi={() => { setLembar({ t: 'dampak', judul: snack.judul, rows: snack.rows }); setSnack(null) }} />

      {pesan && (
        <div role="alert" className="hpp-toast fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-red-600 px-4 py-3 text-white shadow-xl">
          <span>{pesan}</span>
          <button type="button" onClick={actions.tutupPesan} className="font-bold">Tutup</button>
        </div>
      )}
    </>
  )
}
