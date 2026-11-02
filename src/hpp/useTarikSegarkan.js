import { useEffect, useRef, useState } from 'react'

/**
 * useTarikSegarkan — tarik daftar HPP ke bawah (dari paling atas) untuk memuat ulang DATA (tanpa memuat ulang halaman,
 * jadi tab dan kata cari tetap). Kembaran `hook/usePullToRefresh.js` milik POS, ditulis sendiri karena src/hpp tidak boleh
 * mengimpor kode POS (dijaga appMode.test.js). Beda dengan POS: `root` di sini yang menggulir, jadi gulirnya ikut dicek.
 *
 * Tidak jalan kalau: sentuhan dimulai di dalam elemen position:fixed (popup/sheet), ada input/textarea/select yang fokus,
 * `root` atau induk sentuhan sedang tidak di paling atas, elemen punya `data-no-ptr`, atau geseran lebih ke samping daripada ke bawah.
 */
export const AMBANG_TARIK = 70   // px tarikan (setelah diredam) yang dibutuhkan
const MAKS_TARIK = 110
const REDAM = 0.5
export const MIN_TAMPIL_MS = 500   // supaya putarannya sempat terlihat walau data cepat selesai

export function terblokir(target, root) {
  const a = document.activeElement
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true
  if (root.scrollTop > 0) return true
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (el.dataset && el.dataset.noPtr !== undefined) return true
    if (el.scrollTop > 0) return true
    if (getComputedStyle(el).position === 'fixed') return true
  }
  return false
}

export function useTarikSegarkan(rootRef, { onSegarkan } = {}) {
  const [tarik, setTarik] = useState(0)
  const [menarik, setMenarik] = useState(false)
  const [menyegarkan, setMenyegarkan] = useState(false)
  const st = useRef({ tracking: false, decided: false, x: 0, y: 0, pull: 0, busy: false })
  const aksi = useRef(onSegarkan)
  aksi.current = onSegarkan

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const s = st.current
    let hidup = true

    const reset = () => { s.tracking = false; s.decided = false; s.pull = 0; setMenarik(false); setTarik(0) }
    const onStart = (e) => {
      if (s.busy || e.touches.length !== 1 || terblokir(e.target, root)) { s.tracking = false; return }
      s.tracking = true; s.decided = false; s.pull = 0
      s.x = e.touches[0].clientX; s.y = e.touches[0].clientY
    }
    const onMove = (e) => {
      if (!s.tracking) return
      const dy = e.touches[0].clientY - s.y
      const dx = e.touches[0].clientX - s.x
      if (!s.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        s.decided = true
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { s.tracking = false; return }
        setMenarik(true)
      }
      if (dy <= 0) { s.pull = 0; setTarik(0); return }
      s.pull = Math.min(MAKS_TARIK, dy * REDAM)
      setTarik(s.pull)
    }
    const onEnd = async () => {
      if (!s.tracking) return
      const selesai = s.pull >= AMBANG_TARIK
      s.tracking = false
      setMenarik(false)
      if (!selesai) { reset(); return }
      s.busy = true
      setMenyegarkan(true); setTarik(AMBANG_TARIK)
      const mulai = Date.now()
      try { await aksi.current?.() } catch { /* galat ditangani useHpp */ }
      const sisa = MIN_TAMPIL_MS - (Date.now() - mulai)
      if (sisa > 0) await new Promise((r) => setTimeout(r, sisa))
      s.busy = false
      if (hidup) { setMenyegarkan(false); reset() }
    }

    root.addEventListener('touchstart', onStart, { passive: true })
    root.addEventListener('touchmove', onMove, { passive: true })
    root.addEventListener('touchend', onEnd, { passive: true })
    root.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      hidup = false
      root.removeEventListener('touchstart', onStart)
      root.removeEventListener('touchmove', onMove)
      root.removeEventListener('touchend', onEnd)
      root.removeEventListener('touchcancel', reset)
    }
  }, [rootRef])

  return { tarik, menarik, menyegarkan }
}
