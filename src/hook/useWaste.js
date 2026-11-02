import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { isMissingTable } from './deviceLogic';
import { businessDate, moveId } from '../features/stock/stockMath';
import { toStoredRows, wasteTotals } from '../features/stock/wasteMath';
import { lastDayOfMonth } from '../features/stock/opnameMath';

/**
 * Data Waste (migrasi 022): pilihan jenis ayam (+ harga per porsi) dan penyaluran (diatur owner), catatan waste (dicatat staf).
 * Online-first. Migrasi belum dijalankan: `ready` = false, layar menampilkan petunjuk (bukan galat mentah).
 */
export const WASTE_MIGRATION_HINT = 'Waste belum aktif: jalankan supabase/migrations/022_stok_opname_waste.sql di SQL Editor dulu.';
const fail = (error, aksi) => { throw new Error(`${aksi}: ${error.message}`); };
const numRow = (c) => ({ ...c, total_qty: Number(c.total_qty) || 0, total_value: Number(c.total_value) || 0, day: String(c.day).slice(0, 10) });

/** Pilihan form (jenis + penyaluran) dan catatan satu bulan ('YYYY-MM'; kosong = tanpa catatan). Owner mengatur pilihan, staf hanya mencatat. */
export function useWaste({ month = '', withNotes = true } = {}) {
  const [state, setState] = useState({ loading: true, ready: true, error: '', jenis: [], penyaluran: [], catatan: [] });
  const jenisRef = useRef([]);

  const reload = useCallback(async () => {
    const monthStart = month ? `${month}-01` : null;
    const monthEnd = month ? lastDayOfMonth(month) : null;
    const [j, p, c] = await Promise.all([
      supabase.from('waste_jenis').select('*').order('sort_order').order('created_at'),
      supabase.from('waste_penyaluran').select('*').order('sort_order').order('created_at'),
      withNotes
        ? fetchAllPages((from, to) => {
          let q = supabase.from('waste_catatan').select('*');
          if (monthStart) q = q.gte('day', monthStart).lte('day', monthEnd);
          return q.order('day', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to);
        }, 'catatan waste').then((data) => ({ data, error: null }), (error) => ({ data: [], error }))
        : Promise.resolve({ data: [], error: null }),
    ]);
    const error = [j, p, c].find((r) => r.error)?.error;
    if (error) {
      setState((s) => ({ ...s, loading: false, ready: !isMissingTable(error), error: isMissingTable(error) ? WASTE_MIGRATION_HINT : error.message }));
      return;
    }
    jenisRef.current = (j.data || []).map((x) => ({ ...x, price: Number(x.price) || 0 }));
    setState({ loading: false, ready: true, error: '', jenis: jenisRef.current, penyaluran: p.data || [], catatan: (c.data || []).map(numRow) });
  }, [month, withNotes]);

  useEffect(() => { setState((s) => ({ ...s, loading: true })); reload(); }, [reload]);

  /** Catat waste (staf). `rows` = baris isian form; harga per jenis disalin dari daftar jenis. Mengembalikan catatan tersimpan. */
  const addNote = useCallback(async ({ rows, penyaluran, by }) => {
    const stored = toStoredRows(rows, jenisRef.current);
    if (!stored.length) throw new Error('Isi jenis dan porsi dulu.');
    if (!penyaluran) throw new Error('Pilih penyaluran.');
    if (!String(by || '').trim()) throw new Error('Pilih nama pengisi.');
    const t = wasteTotals(stored);
    const { data, error } = await supabase.from('waste_catatan').insert({
      day: businessDate(), recorded_by: String(by).trim(), penyaluran, rows: stored, total_qty: t.qty, total_value: t.value,
    }).select('*').single();
    if (error) fail(error, 'Gagal mencatat waste');
    setState((s) => ({ ...s, catatan: [numRow(data), ...s.catatan] }));
    return data;
  }, []);

  /* ── pilihan (owner) ───────────────────────────────────────────────── */
  const addJenis = useCallback(async (name, price = 0) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Nama jenis wajib diisi.');
    if (jenisRef.current.some((j) => j.name.toLowerCase() === clean.toLowerCase())) throw new Error('Jenis itu sudah ada.');
    const { error } = await supabase.from('waste_jenis').insert({ name: clean, price: Math.max(0, Math.round(Number(price) || 0)), sort_order: jenisRef.current.length });
    if (error) fail(error, 'Gagal menambah jenis');
    await reload();
  }, [reload]);

  const updateJenis = useCallback(async (id, patch) => {
    const clean = { ...patch };
    if ('name' in clean) { clean.name = String(clean.name || '').trim(); if (!clean.name) throw new Error('Nama jenis wajib diisi.'); }
    if ('price' in clean) clean.price = Math.max(0, Math.round(Number(clean.price) || 0));
    const { error } = await supabase.from('waste_jenis').update(clean).eq('id', id);
    if (error) fail(error, 'Gagal mengubah jenis');
    await reload();
  }, [reload]);

  const deleteJenis = useCallback(async (id) => {
    const { error } = await supabase.from('waste_jenis').delete().eq('id', id);
    if (error) fail(error, 'Gagal menghapus jenis');
    await reload();
  }, [reload]);

  const addPenyaluran = useCallback(async (name) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Nama penyaluran wajib diisi.');
    const { error } = await supabase.from('waste_penyaluran').insert({ name: clean, sort_order: state.penyaluran.length });
    if (error) fail(error, 'Gagal menambah penyaluran');
    await reload();
  }, [reload, state.penyaluran.length]);

  const updatePenyaluran = useCallback(async (id, name) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Nama penyaluran wajib diisi.');
    const { error } = await supabase.from('waste_penyaluran').update({ name: clean }).eq('id', id);
    if (error) fail(error, 'Gagal mengubah penyaluran');
    await reload();
  }, [reload]);

  const deletePenyaluran = useCallback(async (id) => {
    const { error } = await supabase.from('waste_penyaluran').delete().eq('id', id);
    if (error) fail(error, 'Gagal menghapus penyaluran');
    await reload();
  }, [reload]);

  const moveRow = useCallback(async (table, list, id, dir) => {
    const cur = list.map((x) => x.id);
    const ids = moveId(cur, id, dir);
    if (ids === cur) return;   // sudah di ujung
    const results = await Promise.all(ids.map((rid, idx) => supabase.from(table).update({ sort_order: idx }).eq('id', rid)));
    const bad = results.find((r) => r.error);
    if (bad) fail(bad.error, 'Gagal menyimpan urutan');
    await reload();
  }, [reload]);

  return {
    ...state, reload, addNote,
    addJenis, updateJenis, deleteJenis, moveJenis: (id, dir) => moveRow('waste_jenis', state.jenis, id, dir),
    addPenyaluran, updatePenyaluran, deletePenyaluran, movePenyaluran: (id, dir) => moveRow('waste_penyaluran', state.penyaluran, id, dir),
  };
}

/** Catatan waste dalam rentang tanggal (inklusif; null = tanpa batas) untuk Income Statement. Gagal / migrasi belum jalan = daftar kosong. */
export function useWasteRange({ fromDate, toDate, enabled = true }) {
  const [state, setState] = useState({ loading: false, catatan: [] });
  useEffect(() => {
    if (!enabled) { setState({ loading: false, catatan: [] }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetchAllPages((from, to) => {
      let q = supabase.from('waste_catatan').select('day, penyaluran, total_qty, total_value, rows');
      if (fromDate) q = q.gte('day', fromDate);
      if (toDate) q = q.lte('day', toDate);
      return q.order('day', { ascending: false }).order('id').range(from, to);
    }, 'catatan waste').then(
      (data) => { if (alive) setState({ loading: false, catatan: data.map(numRow) }); },
      () => { if (alive) setState({ loading: false, catatan: [] }); },
    );
    return () => { alive = false; };
  }, [fromDate, toDate, enabled]);
  return state;
}
