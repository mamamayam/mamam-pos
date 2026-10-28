import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { isMissingTable } from './deviceLogic';
import { businessDate, moveId } from '../features/stock/stockMath';
import { pengisiNames } from '../features/stock/stockPengisi';

/**
 * useStockData — Stok Belanja (migrasi 020): master kategori/item, isian HARI INI, dan stok terakhir tersimpan.
 *
 * - Online-first: tiap perubahan langsung ke Supabase. Isian jumlah ditulis saat `persist(itemId)` dipanggil
 *   (blur / tombol +, −, Habis, Lewati); `finishCategory` dan `save` selalu `flush()` dulu.
 * - Isian yang belum terkirim (`dirty`) tidak ditimpa waktu data dimuat ulang (mis. app kembali dibuka).
 * - Tabel belum dibuat: `ready` = false, layar menampilkan petunjuk menjalankan migrasi (bukan error mentah).
 */
export const STOCK_MIGRATION_HINT = 'Stok Belanja belum aktif: jalankan supabase/migrations/021_stok_belanja.sql di SQL Editor dulu.';
const fail = (error, aksi) => { throw new Error(`${aksi}: ${error.message}`); };
const num = (v) => (v === null || v === undefined ? null : Number(v));

export function useStockData() {
  const [status, setStatus] = useState({ loading: true, ready: true, error: '' });
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [day, setDay] = useState(null);                 // baris stock_days hari ini (null = belum ada isian)
  const [today, setToday] = useState(() => businessDate());
  const [counts, setCounts] = useState({});
  const [latest, setLatest] = useState({});

  const countsRef = useRef({});
  const dirtyRef = useRef(new Set());
  const todayRef = useRef(today);
  const ensuredRef = useRef('');                        // tanggal yang baris stock_days-nya sudah dipastikan ada

  const reload = useCallback(async () => {
    const d = businessDate();
    const [cats, its, dayRes, cnt, lat] = await Promise.all([
      supabase.from('stock_categories').select('*').order('sort_order').order('created_at'),
      supabase.from('stock_items').select('*').order('sort_order').order('created_at'),
      supabase.from('stock_days').select('*').eq('day', d).maybeSingle(),
      supabase.from('stock_counts').select('item_id, qty, skipped').eq('day', d),
      supabase.from('stock_latest').select('*'),
    ]);
    const error = [cats, its, dayRes, cnt, lat].find((r) => r.error)?.error;
    if (error) {
      setStatus({ loading: false, ready: !isMissingTable(error), error: isMissingTable(error) ? STOCK_MIGRATION_HINT : error.message });
      return;
    }
    const server = {};
    for (const r of cnt.data || []) server[r.item_id] = { qty: num(r.qty), skipped: Boolean(r.skipped) };
    for (const id of dirtyRef.current) if (countsRef.current[id]) server[id] = countsRef.current[id];   // isian lokal yang belum terkirim menang
    countsRef.current = server;
    todayRef.current = d;
    const latestMap = {};
    for (const r of lat.data || []) latestMap[r.item_id] = { ...r, qty: num(r.qty) };
    setCategories(cats.data || []);
    setItems((its.data || []).map((i) => ({ ...i, min_qty: Number(i.min_qty) })));
    setDay(dayRes.data || null);
    setToday(d);
    setCounts(server);
    setLatest(latestMap);
    setStatus({ loading: false, ready: true, error: '' });
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const master = useMemo(
    () => categories.map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) })),
    [categories, items],
  );

  /* ── isian harian ─────────────────────────────────────────────────── */
  const ensureDay = useCallback(async () => {
    const d = todayRef.current;
    if (ensuredRef.current === d) return;
    const { error } = await supabase.from('stock_days').upsert({ day: d }, { onConflict: 'day', ignoreDuplicates: true });
    if (error) fail(error, 'Gagal memulai isian hari ini');
    ensuredRef.current = d;
    setDay((cur) => cur || { day: d, done_categories: [], saved_at: null, saved_by: null });
  }, []);

  /** Ubah isian lokal (belum dikirim). `patch`: { qty?, skipped? }. */
  const setCount = useCallback((itemId, patch) => {
    const next = { qty: null, skipped: false, ...countsRef.current[itemId], ...patch };
    countsRef.current = { ...countsRef.current, [itemId]: next };
    dirtyRef.current.add(itemId);
    setCounts(countsRef.current);
  }, []);

  const persist = useCallback(async (itemId) => {
    if (!dirtyRef.current.has(itemId)) return;
    const c = countsRef.current[itemId];
    if (!c) return;
    await ensureDay();
    const { error } = await supabase.from('stock_counts').upsert(
      { day: todayRef.current, item_id: itemId, qty: c.qty, skipped: c.skipped, updated_at: new Date().toISOString() },
      { onConflict: 'day,item_id' },
    );
    if (error) fail(error, 'Gagal menyimpan stok');
    dirtyRef.current.delete(itemId);
  }, [ensureDay]);

  const flush = useCallback(async () => { for (const id of [...dirtyRef.current]) await persist(id); }, [persist]);

  const finishCategory = useCallback(async (categoryId, done = true) => {
    await flush();
    await ensureDay();
    const { error } = await supabase.rpc('stok_selesai_kategori', { p_day: todayRef.current, p_category: categoryId, p_done: done });
    if (error) fail(error, 'Gagal menandai kategori');
    setDay((cur) => {
      const list = (cur?.done_categories || []).filter((id) => id !== categoryId);
      return { ...(cur || { day: todayRef.current, saved_at: null, saved_by: null }), done_categories: done ? [...list, categoryId] : list };
    });
  }, [flush, ensureDay]);

  const save = useCallback(async (by) => {
    await flush();
    const { error } = await supabase.rpc('stok_simpan', { p_day: todayRef.current, p_by: by || '' });
    if (error) fail(error, 'Gagal menyimpan hasil stok');
    await reload();
  }, [flush, reload]);

  const reopenDay = useCallback(async () => {
    const { error } = await supabase.rpc('stok_buka_kembali', { p_day: todayRef.current });
    if (error) fail(error, 'Gagal membuka kembali');
    await reload();
  }, [reload]);

  /* ── master (owner) ───────────────────────────────────────────────── */
  const addCategory = useCallback(async (name) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Nama kategori wajib diisi.');
    const { error } = await supabase.from('stock_categories').insert({ name: clean, sort_order: categories.length });
    if (error) fail(error, 'Gagal menambah kategori');
    await reload();
  }, [categories.length, reload]);

  const renameCategory = useCallback(async (id, name) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Nama kategori wajib diisi.');
    const { error } = await supabase.from('stock_categories').update({ name: clean }).eq('id', id);
    if (error) fail(error, 'Gagal mengubah kategori');
    setCategories((cur) => cur.map((c) => (c.id === id ? { ...c, name: clean } : c)));
  }, []);

  const deleteCategory = useCallback(async (id) => {
    const { error } = await supabase.from('stock_categories').delete().eq('id', id);
    if (error) fail(error, 'Gagal menghapus kategori');
    await reload();
  }, [reload]);

  const writeOrder = useCallback(async (table, ids) => {
    const results = await Promise.all(ids.map((id, idx) => supabase.from(table).update({ sort_order: idx }).eq('id', id)));
    const bad = results.find((r) => r.error);
    if (bad) fail(bad.error, 'Gagal menyimpan urutan');
  }, []);

  const moveCategory = useCallback(async (id, dir) => {
    const cur = categories.map((c) => c.id);
    const ids = moveId(cur, id, dir);
    if (ids === cur) return;   // sudah di ujung
    await writeOrder('stock_categories', ids);
    await reload();
  }, [categories, writeOrder, reload]);

  const addItem = useCallback(async (categoryId, { name, unit, min_qty = 0, required = true }) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Nama item wajib diisi.');
    const { error } = await supabase.from('stock_items').insert({
      category_id: categoryId, name: clean, unit: String(unit || '').trim() || 'pcs', min_qty: Number(min_qty) || 0, required,
      sort_order: items.filter((i) => i.category_id === categoryId).length,
    });
    if (error) fail(error, 'Gagal menambah item');
    await reload();
  }, [items, reload]);

  const updateItem = useCallback(async (id, patch) => {
    const clean = { ...patch };
    if ('name' in clean) { clean.name = String(clean.name || '').trim(); if (!clean.name) throw new Error('Nama item wajib diisi.'); }
    if ('unit' in clean) clean.unit = String(clean.unit || '').trim() || 'pcs';
    if ('min_qty' in clean) clean.min_qty = Math.max(0, Number(clean.min_qty) || 0);
    const { error } = await supabase.from('stock_items').update(clean).eq('id', id);
    if (error) fail(error, 'Gagal mengubah item');
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...clean } : i)));
  }, []);

  const deleteItem = useCallback(async (id) => {
    const { error } = await supabase.from('stock_items').delete().eq('id', id);
    if (error) fail(error, 'Gagal menghapus item');
    delete countsRef.current[id]; dirtyRef.current.delete(id);
    await reload();
  }, [reload]);

  const moveItem = useCallback(async (itemId, dir) => {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    const cur = items.filter((i) => i.category_id === it.category_id).map((i) => i.id);
    const ids = moveId(cur, itemId, dir);
    if (ids === cur) return;
    await writeOrder('stock_items', ids);
    await reload();
  }, [items, writeOrder, reload]);

  return {
    ...status, master, day, today, counts, latest,
    locked: Boolean(day?.saved_at), doneIds: day?.done_categories || [],
    reload, setCount, persist, flush, finishCategory, save, reopenDay,
    addCategory, renameCategory, deleteCategory, moveCategory, addItem, updateItem, deleteItem, moveItem,
  };
}

/** Riwayat beberapa hari terakhir yang SUDAH disimpan: [{ day, saved_by, saved_at, counts: [{ item_id, qty }] }]. */
export function useStockHistory(enabled, limit = 14) {
  const [state, setState] = useState({ loading: false, error: '', rows: [] });
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const { data: days, error } = await supabase.from('stock_days').select('day, saved_by, saved_at').not('saved_at', 'is', null).order('day', { ascending: false }).limit(limit);
    if (error) { setState({ loading: false, error: isMissingTable(error) ? STOCK_MIGRATION_HINT : error.message, rows: [] }); return; }
    const list = days || [];
    let byDay = {};
    if (list.length) {
      const { data: cnt, error: e2 } = await supabase.from('stock_counts').select('day, item_id, qty').in('day', list.map((d) => d.day));
      if (e2) { setState({ loading: false, error: e2.message, rows: [] }); return; }
      for (const r of cnt || []) (byDay[r.day] = byDay[r.day] || []).push({ item_id: r.item_id, qty: num(r.qty) });
    }
    setState({ loading: false, error: '', rows: list.map((d) => ({ ...d, counts: byDay[d.day] || [] })) });
  }, [limit]);
  useEffect(() => { if (enabled) reload(); }, [enabled, reload]);
  return { ...state, reload };
}

/** Nama karyawan yang boleh dipilih sebagai pengisi checklist (dari tabel employees; lihat `pengisiNames`). */
export function useStockEmployees(today, enabled = true) {
  const [state, setState] = useState({ loading: true, error: '', names: [] });
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    const { data, error } = await supabase.from('employees').select('name, status, is_active, resign_date').order('name');
    if (error) { setState({ loading: false, error: error.message, names: [] }); return; }
    setState({ loading: false, error: '', names: pengisiNames(data || [], today) });
  }, [today]);
  useEffect(() => { if (enabled) reload(); }, [enabled, reload]);
  return { ...state, reload };
}

/**
 * Status Absen Pulang hari ini (true = terbuka). Memakai fungsi SQL `stok_gate_terbuka()` yang SAMA dengan web absensi,
 * jadi hasilnya pasti sama dengan yang dilihat karyawan. Diperbarui tiap 15 detik selama layarnya terbuka.
 */
export function useStockGate(enabled = true) {
  const [state, setState] = useState({ open: null, loading: true, error: '' });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const check = async () => {
      const { data, error } = await supabase.rpc('stok_gate_terbuka');
      if (!alive) return;
      if (error) setState({ open: null, loading: false, error: isMissingTable(error) ? STOCK_MIGRATION_HINT : error.message });
      else setState({ open: Boolean(data), loading: false, error: '' });
    };
    check();
    const t = setInterval(check, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [enabled]);
  return state;
}
