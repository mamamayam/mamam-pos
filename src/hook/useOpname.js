import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { isMissingTable } from './deviceLogic';
import { businessDate } from '../features/stock/stockMath';
import {
  latestFullByMonth, opnameValue, recentMonths, statementStock, monthOf, reminderFor, opnamePhase, lastDayOfMonth,
} from '../features/stock/opnameMath';
import { shiftMonthKey } from '../features/reports/reportsMath';

/**
 * Data Stok Opname (migrasi 022): hitungan penuh per bulan, nilai stok untuk Income Statement, dan pengingat H-1 / H untuk owner.
 * Online-first. Kalau migrasi 022 belum dijalankan, kolom/tabelnya belum ada: hook mengembalikan `ready: false` (bukan galat mentah).
 */
export const OPNAME_MIGRATION_HINT = 'Stok Opname belum aktif: jalankan supabase/migrations/022_stok_opname_waste.sql di SQL Editor dulu.';
const num = (v) => (v === null || v === undefined ? null : Number(v));

/** Hari penuh tersimpan: [{ day, saved_by, saved_at }] (terbaru dulu). */
async function fetchFullDays({ from = null, to = null, limit = 400 } = {}) {
  let q = supabase.from('stock_days').select('day, saved_by, saved_at').eq('full_count', true).not('saved_at', 'is', null);
  if (from) q = q.gte('day', from);
  if (to) q = q.lte('day', to);
  const { data, error } = await q.order('day', { ascending: false }).limit(limit);
  return { data: data || [], error };
}

/** Isian (qty + salinan harga) untuk daftar hari. Satu hari maksimal sebanyak item (puluhan), jadi aman di bawah batas 1000 baris untuk <= 14 hari. */
async function fetchCounts(days) {
  if (!days.length) return { data: [], error: null };
  const { data, error } = await supabase.from('stock_counts').select('day, item_id, qty, unit_cost').in('day', days);
  return { data: (data || []).map((r) => ({ ...r, qty: num(r.qty), unit_cost: num(r.unit_cost) })), error };
}

const groupByDay = (rows) => rows.reduce((m, r) => { (m[r.day] = m[r.day] || []).push(r); return m; }, {});

/**
 * Riwayat opname untuk tab Riwayat (owner): 3 bulan terakhir (bulan berjalan ke belakang) + daftar semua bulan yang pernah dihitung.
 * `items` = item stok (dengan unit_cost) untuk harga cadangan.
 */
export function useOpnameHistory({ enabled, items, today = businessDate() }) {
  const [state, setState] = useState({ loading: false, ready: true, error: '', full: {}, counts: {} });
  const ym = monthOf(today);
  const shown = useMemo(() => recentMonths(ym, 3), [ym]);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const { data: days, error } = await fetchFullDays();
    if (error) { setState({ loading: false, ready: !isMissingTable(error), error: isMissingTable(error) ? OPNAME_MIGRATION_HINT : error.message, full: {}, counts: {} }); return; }
    const full = latestFullByMonth(days);
    const want = shown.map((k) => full[k]?.day).filter(Boolean);
    const { data: cnt, error: e2 } = await fetchCounts(want);
    if (e2) { setState({ loading: false, ready: true, error: e2.message, full, counts: {} }); return; }
    setState({ loading: false, ready: true, error: '', full, counts: groupByDay(cnt) });
  }, [shown]);

  useEffect(() => { if (enabled) reload(); }, [enabled, reload]);

  const months = useMemo(() => shown.map((k) => {
    const row = state.full[k] || null;
    const v = row ? opnameValue(state.counts[row.day] || [], items || []) : null;
    return { ym: k, row, total: v?.total ?? null, missing: v?.missing ?? 0 };
  }), [shown, state.full, state.counts, items]);

  /** Semua bulan yang pernah dihitung penuh (terbaru dulu), untuk "Pilih bulan lain". */
  const allMonths = useMemo(() => Object.keys(state.full).sort().reverse().map((k) => ({ ym: k, row: state.full[k] })), [state.full]);

  /** Isian satu hari (untuk sheet detail). */
  const loadDetail = useCallback(async (day) => {
    const { data, error } = await fetchCounts([day]);
    if (error) throw new Error(error.message);
    return data;
  }, []);

  return { ...state, months, allMonths, loadDetail, reload };
}

/**
 * Angka stok untuk Income Statement bulan `ym` ('YYYY-MM'): { awal, akhir } (rupiah; null = belum dihitung penuh).
 * `ym` kosong (periode bukan bulanan) = tidak membaca apa pun, hasil null.
 */
export function useStatementStock(ym, enabled = true) {
  const [state, setState] = useState({ loading: false, stock: null });
  useEffect(() => {
    if (!enabled || !ym) { setState({ loading: false, stock: null }); return undefined; }
    let alive = true;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      const prev = shiftMonthKey(ym, -1);
      const { data: days, error } = await fetchFullDays({ from: `${prev}-01`, to: lastDayOfMonth(ym), limit: 70 });
      if (!alive) return;
      if (error) { setState({ loading: false, stock: null }); return; }
      const full = latestFullByMonth(days);
      const pick = [prev, ym].map((k) => full[k]?.day).filter(Boolean);
      const [cnt, its] = await Promise.all([fetchCounts(pick), supabase.from('stock_items').select('id, unit_cost')]);
      if (!alive) return;
      if (cnt.error || its.error) { setState({ loading: false, stock: null }); return; }
      const byDay = groupByDay(cnt.data);
      const items = (its.data || []).map((i) => ({ id: i.id, unit_cost: num(i.unit_cost) }));
      const values = {};
      for (const k of [prev, ym]) if (full[k]) values[k] = opnameValue(byDay[full[k].day] || [], items).total;
      setState({ loading: false, stock: statementStock(values, ym) });
    })();
    return () => { alive = false; };
  }, [ym, enabled]);
  return state;
}

/**
 * Pengingat opname untuk owner (Beranda): hanya membaca database kalau hari ini H atau H-1.
 * Hasil `phase` = 'h1' | 'h' | null. `activate()` menyalakan mode opname lewat RPC `stok_opname_set`.
 */
export function useOpnameReminder(enabled, today = businessDate()) {
  const hasPhase = Boolean(opnamePhase(today));
  const [state, setState] = useState({ phase: null, loading: false });
  useEffect(() => {
    if (!enabled || !hasPhase) { setState({ phase: null, loading: false }); return undefined; }
    let alive = true;
    (async () => {
      setState({ phase: null, loading: true });
      const [settings, full] = await Promise.all([
        supabase.from('stock_settings').select('opname_aktif').eq('id', 1).maybeSingle(),
        fetchFullDays({ from: today, to: today, limit: 1 }),
      ]);
      if (!alive) return;
      if (settings.error || full.error) { setState({ phase: null, loading: false }); return; }   // migrasi belum jalan / gagal baca: diam saja
      setState({
        phase: reminderFor(today, { opnameOn: Boolean(settings.data?.opname_aktif), fullDays: full.data.map((d) => d.day) }),
        loading: false,
      });
    })();
    return () => { alive = false; };
  }, [enabled, hasPhase, today]);

  const activate = useCallback(async () => {
    const { error } = await supabase.rpc('stok_opname_set', { p_aktif: true });
    if (error) throw new Error(isMissingTable(error) ? OPNAME_MIGRATION_HINT : `Gagal menyalakan stok opname: ${error.message}`);
    setState({ phase: null, loading: false });
  }, []);
  const dismiss = useCallback(() => setState((s) => ({ ...s, phase: null })), []);
  return { ...state, activate, dismiss };
}
