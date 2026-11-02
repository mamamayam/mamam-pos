import { useMemo, useState } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Trash2, AlertTriangle } from 'lucide-react';
import { Card, Button, Input, Select, Alert, Badge } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { useWaste } from '../../hook/useWaste';
import { useStockEmployees } from '../../hook/useStockData';
import { showToast } from '../../lib/toast';
import { shiftMonthKey, monthLabel } from '../reports/reportsMath';
import { businessDate, dayLabel, formatQty } from './stockMath';
import { monthOf } from './opnameMath';
import {
  CUSTOM_WASTE, emptyWasteRow, wasteCheck, formQty, describeWaste, sumWaste, wasteByJenis, wasteByPenyaluran,
  jenisWithoutPrice, wasteUnpriced,
} from './wasteMath';

/**
 * WasteView — tab Waste di Stok Belanja (migrasi 022).
 *  - Staf: HANYA mencatat. Form: rincian ayam (jenis × porsi, bisa tambah baris, pola Potong Ayam), SATU penyaluran, diisi oleh siapa, Simpan.
 *    Tanpa harga/nilai kerugian dan tanpa ubah/hapus. Form TAMBAH: setelah simpan toast lalu form dikosongkan untuk catatan berikutnya.
 *  - Owner (`manage`, izin `stok.kelola`): total kerugian per bulan (‹ ›), rekap per jenis dan penyaluran, daftar catatan beserta nilainya,
 *    dan "Pilihan waste" (jenis ayam + harga per porsi, penyaluran) yang menentukan isi form staf.
 * Harga per porsi disalin ke tiap catatan saat dicatat, jadi mengubah harga tidak mengubah catatan lama.
 */
const LBL = 'text-slate-400 dark:text-slate-500';
const FIELD = 'min-w-0 px-2.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 placeholder:text-slate-300 dark:placeholder:text-slate-600';
const REMOVE = 'shrink-0 mt-1.5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 active:bg-slate-100 dark:active:bg-slate-800';
const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const toastError = (e) => showToast(e?.message || 'Terjadi kesalahan', { type: 'error' });
const run = (fn, okMsg) => Promise.resolve().then(fn).then(() => { if (okMsg) showToast(okMsg); }).catch(toastError);

/** Teks isian porsi: angka dengan satu koma/titik desimal, maksimal 3 angka di belakangnya (sama dengan Potong Ayam). */
const cleanQty = (v) => {
  const s = String(v).replace(/[^\d.,]/g, '');
  const i = s.search(/[.,]/);
  return i === -1 ? s : `${s.slice(0, i + 1)}${s.slice(i + 1).replace(/[.,]/g, '').slice(0, 3)}`;
};

/* ── Form catat (staf) ─────────────────────────────────────────────────── */
function WasteForm({ waste, today }) {
  const { names, loading: namesLoading, error: namesError } = useStockEmployees(today);
  const first = waste.jenis[0]?.name || CUSTOM_WASTE;
  const [rows, setRows] = useState(() => [emptyWasteRow(first)]);
  const [penyaluran, setPenyaluran] = useState('');
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);
  const check = wasteCheck({ rows, penyaluran, by });
  const jenisNames = waste.jenis.map((j) => j.name);

  const patch = (i, p) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const remove = (i) => setRows((cur) => (cur.length === 1 ? [emptyWasteRow(first)] : cur.filter((_, j) => j !== i)));

  const submit = async () => {
    if (!check.ok || busy) return;
    setBusy(true);
    try {
      await waste.addNote({ rows, penyaluran, by });
      showToast('Waste tersimpan');
      setRows([emptyWasteRow(first)]); setPenyaluran(''); setBy('');   // form TAMBAH: dikosongkan untuk catatan berikutnya
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <Card padding="md" className="space-y-4" data-testid="waste-form">
      <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50">Catat Waste</p>

      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3 space-y-2.5" data-testid="waste-rincian">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Jenis ayam × porsi</span>
        {rows.map((r, i) => (
          <div key={i} className="space-y-1.5" data-testid="waste-baris">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <Select value={r.type} onChange={(e) => patch(i, { type: e.target.value, name: '' })} aria-label="Jenis ayam" title="Jenis ayam">
                  {jenisNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={CUSTOM_WASTE}>{CUSTOM_WASTE}</option>
                </Select>
              </div>
              <div className="w-24 shrink-0">
                <Input type="text" inputMode="decimal" placeholder="Porsi" value={r.qty} onChange={(e) => patch(i, { qty: cleanQty(e.target.value) })} aria-label="Jumlah porsi" />
              </div>
              <button type="button" aria-label="Hapus baris" onClick={() => remove(i)} className={REMOVE}><X className="w-4 h-4" /></button>
            </div>
            {r.type === CUSTOM_WASTE && <Input placeholder="Nama potongan (mis. Kepala ayam)" value={r.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Nama potongan" />}
          </div>
        ))}
        <button type="button" onClick={() => setRows((cur) => [...cur, emptyWasteRow(first)])} data-testid="waste-tambah-baris"
          className="flex items-center gap-1.5 text-sm font-semibold text-accent-600 dark:text-accent-400 active:opacity-70"><Plus className="w-4 h-4" /> Tambah baris</button>
        <div className="flex items-baseline justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Total waste</span>
          <span className="font-bold text-slate-800 dark:text-slate-100" data-testid="waste-total">{formatQty(formQty(rows)) || '0'} porsi</span>
        </div>
      </div>

      <Select label="Penyaluran" title="Penyaluran" value={penyaluran} onChange={(e) => setPenyaluran(e.target.value)} disabled={!waste.penyaluran.length} data-testid="waste-penyaluran">
        <option value="">{waste.penyaluran.length ? 'Pilih penyaluran' : 'Belum ada pilihan penyaluran'}</option>
        {waste.penyaluran.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
      </Select>

      {namesError
        ? <Alert type="banner" variant="error">Daftar karyawan belum bisa dimuat: {namesError}</Alert>
        : (
          <Select label="Diisi oleh" title="Diisi oleh" value={by} onChange={(e) => setBy(e.target.value)} disabled={namesLoading || names.length === 0} data-testid="waste-pengisi">
            <option value="">{namesLoading ? 'Memuat...' : names.length === 0 ? 'Belum ada karyawan aktif' : 'Pilih nama karyawan'}</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        )}

      <div>
        <Button size="full" disabled={!check.ok || busy} onClick={submit} data-testid="waste-simpan">{busy ? 'Menyimpan...' : 'Simpan Waste'}</Button>
        {!check.ok && <p className={`text-xs text-center mt-1.5 ${LBL}`} data-testid="waste-kurang">Belum bisa disimpan: {check.reason}.</p>}
      </div>
    </Card>
  );
}

/** Catatan hari ini untuk staf: tanpa harga, tanpa tombol ubah/hapus. */
function TodayNotes({ catatan, today }) {
  const list = catatan.filter((c) => c.day === today);
  if (!list.length) return null;
  return (
    <Card padding="md" data-testid="waste-hari-ini">
      <p className="text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500 mb-1">DICATAT HARI INI</p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((c) => (
          <div key={c.id} className="py-2.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{describeWaste(c.rows)}</p>
            <p className={`text-xs ${LBL}`}>{c.penyaluran} · {c.recorded_by}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Pilihan waste (owner) ─────────────────────────────────────────────── */
function Options({ waste }) {
  const { triggerConfirm } = useAppContext();
  const [jn, setJn] = useState({ name: '', price: '' });
  const [pn, setPn] = useState('');
  const noPrice = jenisWithoutPrice(waste.jenis);
  return (
    <Card padding="md" className="space-y-4" data-testid="waste-pilihan">
      <div>
        <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50">Pilihan waste</p>
        <p className={`text-xs ${LBL}`}>Ini yang muncul di form staf. Harga per porsi dipakai menghitung nilai kerugian; mengubahnya tidak mengubah catatan lama.</p>
      </div>
      {noPrice.length > 0 && (
        <p className="flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2" data-testid="waste-tanpa-harga">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {noPrice.length} jenis belum punya harga ({noPrice.map((j) => j.name).join(', ')}): kerugiannya dihitung Rp 0 sampai diisi.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Jenis ayam</p>
        {waste.jenis.map((j) => (
          <div key={j.id} className="flex items-center gap-2" data-testid={`waste-jenis-${j.id}`}>
            <input key={`n-${j.id}-${j.name}`} defaultValue={j.name} aria-label="Nama jenis" className={`${FIELD} flex-1`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== j.name) run(() => waste.updateJenis(j.id, { name: v })); else e.target.value = j.name; }} />
            <span className={`text-xs ${LBL}`}>Rp</span>
            <input key={`p-${j.id}-${j.price}`} defaultValue={j.price ? String(j.price) : ''} inputMode="numeric" placeholder="harga" aria-label={`Harga per porsi ${j.name}`}
              className={`${FIELD} w-20 text-right ${j.price > 0 ? '' : 'border-red-300 dark:border-red-500/50 bg-red-50 dark:bg-red-500/10'}`}
              onBlur={(e) => { const v = Number(e.target.value.replace(/[^\d]/g, '')) || 0; if (v !== j.price) run(() => waste.updateJenis(j.id, { price: v })); }} />
            <button type="button" aria-label={`Hapus ${j.name}`} className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 active:scale-95"
              onClick={() => triggerConfirm(`Hapus jenis "${j.name}" dari pilihan? Catatan lama tetap utuh.`, () => run(() => waste.deleteJenis(j.id), 'Jenis dihapus'))}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input value={jn.name} onChange={(e) => setJn({ ...jn, name: e.target.value })} placeholder="Jenis baru" aria-label="Jenis baru" className={`${FIELD} flex-1`} />
          <input value={jn.price} onChange={(e) => setJn({ ...jn, price: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" placeholder="harga" aria-label="Harga jenis baru" className={`${FIELD} w-20 text-right`} />
          <Button size="sm" disabled={!jn.name.trim()} aria-label="Tambah jenis" icon={<Plus className="w-4 h-4" />}
            onClick={() => run(async () => { await waste.addJenis(jn.name, jn.price); setJn({ name: '', price: '' }); }, 'Jenis ditambah')} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Penyaluran</p>
        {waste.penyaluran.map((p) => (
          <div key={p.id} className="flex items-center gap-2" data-testid={`waste-penyaluran-${p.id}`}>
            <input key={`s-${p.id}-${p.name}`} defaultValue={p.name} aria-label="Nama penyaluran" className={`${FIELD} flex-1`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) run(() => waste.updatePenyaluran(p.id, v)); else e.target.value = p.name; }} />
            <button type="button" aria-label={`Hapus ${p.name}`} className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 active:scale-95"
              onClick={() => triggerConfirm(`Hapus penyaluran "${p.name}" dari pilihan? Catatan lama tetap utuh.`, () => run(() => waste.deletePenyaluran(p.id), 'Penyaluran dihapus'))}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input value={pn} onChange={(e) => setPn(e.target.value)} placeholder="Penyaluran baru" aria-label="Penyaluran baru" className={`${FIELD} flex-1`} />
          <Button size="sm" disabled={!pn.trim()} aria-label="Tambah penyaluran" icon={<Plus className="w-4 h-4" />}
            onClick={() => run(async () => { await waste.addPenyaluran(pn); setPn(''); }, 'Penyaluran ditambah')} />
        </div>
      </div>
    </Card>
  );
}

/* ── Ringkasan + catatan (owner) ───────────────────────────────────────── */
function OwnerSummary({ waste, ym, onShift, canNext }) {
  const total = useMemo(() => sumWaste(waste.catatan), [waste.catatan]);
  const byJenis = useMemo(() => wasteByJenis(waste.catatan), [waste.catatan]);
  const bySalur = useMemo(() => wasteByPenyaluran(waste.catatan), [waste.catatan]);
  const max = byJenis[0]?.value || 1;
  return (
    <>
      <Card padding="md" className="space-y-3" data-testid="waste-ringkasan">
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Bulan sebelumnya" onClick={() => onShift(-1)} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50">Waste {monthLabel(ym)}</p>
          <button type="button" aria-label="Bulan berikutnya" disabled={!canNext} onClick={() => onShift(1)} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Total kerugian</span>
          <span className="font-heading text-lg font-bold text-slate-900 dark:text-slate-50" data-testid="waste-nilai">{rp(total.value)}</span>
        </div>
        <p className={`text-xs ${LBL}`}>{total.count} catatan · {formatQty(total.qty) || '0'} porsi</p>
        {byJenis.map((j) => (
          <div key={j.name}>
            <div className="flex justify-between text-sm"><span>{j.name} <span className={`text-xs ${LBL}`}>· {formatQty(j.qty)} porsi</span></span><span className="font-bold">{rp(j.value)}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-accent-500/70" style={{ width: `${Math.round((j.value / max) * 100)}%` }} /></div>
          </div>
        ))}
        {bySalur.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex flex-wrap gap-1.5">
            {bySalur.map((s) => <Badge key={s.name} variant="neutral">{s.name} · {formatQty(s.qty)} porsi</Badge>)}
          </div>
        )}
      </Card>
      <Card padding="md" data-testid="waste-catatan">
        <p className="text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500 mb-1">CATATAN</p>
        {waste.catatan.length === 0 && <p className={`text-sm text-center py-4 ${LBL}`}>Belum ada catatan di bulan ini.</p>}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {waste.catatan.map((c) => (
            <div key={c.id} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{describeWaste(c.rows)}</p>
                <span className="text-sm font-bold shrink-0">{rp(c.total_value)}</span>
              </div>
              <p className={`text-xs ${LBL}`}>{dayLabel(c.day)} · {c.penyaluran} · {c.recorded_by}{wasteUnpriced(c) ? ' · ada baris tanpa harga' : ''}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

export default function WasteView({ manage = false }) {
  const today = businessDate();
  const current = monthOf(today);
  const [ym, setYm] = useState(current);
  const waste = useWaste({ month: manage ? ym : current });

  if (waste.loading && !waste.jenis.length && !waste.penyaluran.length) return <p className="text-center text-sm text-slate-400 py-10">Memuat...</p>;
  if (!waste.ready) return <Alert type="banner" variant="warning" className="!text-left !font-medium">{waste.error}</Alert>;
  if (waste.error) {
    return (
      <div className="space-y-3">
        <Alert type="banner" variant="error">{waste.error}</Alert>
        <Button variant="secondary" size="full" onClick={waste.reload}>Coba lagi</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="stok-waste">
      {!manage && (
        <>
          <WasteForm waste={waste} today={today} />
          <TodayNotes catatan={waste.catatan} today={today} />
          <p className={`text-xs text-center ${LBL}`}>Catatan waste tidak bisa diubah atau dihapus oleh staf.</p>
        </>
      )}
      {manage && (
        <>
          <OwnerSummary waste={waste} ym={ym} onShift={(d) => setYm(shiftMonthKey(ym, d))} canNext={ym < current} />
          <Options waste={waste} />
        </>
      )}
    </div>
  );
}
