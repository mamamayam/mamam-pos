import { useState, useRef, useCallback, useEffect } from 'react';
import { itemAtPoint } from './menuOrder';

/**
 * useGridReorder — drag & drop untuk grid (pointer: jari maupun mouse). Beda dengan
 * useDragReorder (khusus daftar vertikal): di sini penentu tujuannya persegi panjang elemen
 * yang sedang disentuh, jadi bekerja untuk grid 3 kolom ke segala arah.
 *
 * - startDrag(id) dipasang di onPointerDown elemen (elemen perlu touch-action: none).
 * - Saat jari masuk ke elemen lain, onMove(dragId, targetId) dipanggil (urutan berubah langsung
 *   seperti di layar utama HP). Saat dilepas, bayangan MENDARAT dulu ke slot akhirnya (`settling`, SETTLE_MS),
 *   baru `drag` jadi null dan onDrop() dipanggil. Tanpa itu bayangan lenyap mendadak dan tile asli muncul begitu saja.
 * - `drag` = { id, x, y, w, h, dx, dy, settling? } untuk menggambar "bayangan" yang mengikuti jari, atau null.
 * - Elemen yang didaftarkan lewat `registerRef` harus berupa SEL grid yang posisinya tidak ikut animasi transform
 *   (bukan tile yang sedang meluncur): penentu tujuan memakai persegi panjang sel = posisi AKHIR tata letak, jadi tile
 *   yang masih meluncur ke tempat barunya tidak membuat urutan bolak-balik.
 */
export const SETTLE_MS = 200;

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function useGridReorder({ onMove, onDrop }) {
  const [drag, setDrag] = useState(null);
  const refs = useRef({});
  const dragIdRef = useRef(null);
  const settleTimer = useRef(null);
  const cbRef = useRef({ onMove, onDrop });
  useEffect(() => { cbRef.current = { onMove, onDrop }; });
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const registerRef = useCallback((id) => (el) => {
    if (el) refs.current[id] = el; else delete refs.current[id];
  }, []);

  const startDrag = useCallback((id) => (e) => {
    if (e.button > 0) return;                       // hanya klik kiri / sentuhan
    const el = refs.current[id];
    if (!el) return;
    e.preventDefault();
    clearTimeout(settleTimer.current);              // drag baru saat bayangan lama masih mendarat: batalkan penutupan lama
    const r = el.getBoundingClientRect();
    dragIdRef.current = id;
    setDrag({ id, x: e.clientX, y: e.clientY, w: r.width, h: r.height, dx: e.clientX - r.left, dy: e.clientY - r.top });
  }, []);

  const dragId = drag?.id ?? null;
  useEffect(() => {
    if (dragId === null) return undefined;
    const onPointerMove = (e) => {
      if (dragIdRef.current === null) return;       // sudah dilepas, bayangan sedang mendarat
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      const rects = {};
      for (const [id, el] of Object.entries(refs.current)) rects[id] = el.getBoundingClientRect();
      const target = itemAtPoint(rects, e.clientX, e.clientY);
      if (target && target !== dragIdRef.current) cbRef.current.onMove(dragIdRef.current, target);
    };
    const finish = () => {
      const id = dragIdRef.current;
      if (id === null) return;                      // pointerup lalu pointercancel: sekali saja
      dragIdRef.current = null;                     // gerakan berikutnya diabaikan
      const cell = refs.current[id];
      if (!cell || reducedMotion()) { setDrag(null); cbRef.current.onDrop?.(); return; }
      const r = cell.getBoundingClientRect();       // slot akhir (posisi tata letak, bukan posisi animasi)
      setDrag((d) => (d ? { ...d, settling: true, x: r.left + d.dx, y: r.top + d.dy } : d));
      settleTimer.current = setTimeout(() => { setDrag(null); cbRef.current.onDrop?.(); }, SETTLE_MS);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [dragId]);

  return { drag, registerRef, startDrag };
}
