import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Check, Lock, Unlock, Minus, Plus, Save, ExternalLink, UserRound } from 'lucide-react';
import { Card, Button, Select, Modal, EmptyState, Alert } from '../../components/ui';
import { useStockEmployees } from '../../hook/useStockData';
import { showToast } from '../../lib/toast';
import { readPengisi, savePengisi } from './stockPengisi';
import { ABSENSI_URL } from './stockLinks';
import {
  parseQty, formatQty, categoryProgress, categoryReady, gatingCategories, saveCheck,
} from './stockMath';

/**
 * StockFill — tab Isi (khusus staf): isian stok HARI INI per kategori. Owner tidak mengisi (tab Bypass dan Riwayat).
 * Sebelum mengisi, pengisi MEMILIH namanya dulu dari data karyawan (bukan otomatis dari siapa yang membuka Dompet; lihat stockPengisi.js).
 * Setelah semua kategori selesai dan hasil DISIMPAN, gate Absen Pulang di web absensi terbuka (hasil tetap di
 * aplikasi, tidak dikirim ke WhatsApp) dan muncul tautan ke web absensi.
 */
const LBL = 'text-slate-400 dark:text-slate-500';
const STEP_BTN = 'w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center active:scale-95 disabled:opacity-40';

const toastError = (e) => showToast(e?.message || 'Terjadi kesalahan', { type: 'error' });

function QtyRow({ item, count, ro, setCount, persist }) {
  const fromCount = count?.qty === null || count?.qty === undefined ? '' : formatQty(count.qty);
  const [text, setText] = useState(fromCount);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(fromCount); }, [fromCount]);
  const skipped = Boolean(count?.skipped);
  const filled = parseQty(text) !== null;

  const commit = (t) => { setText(t); setCount(item.id, { qty: parseQty(t), skipped: false }); };
  const step = (d) => { commit(formatQty(Math.max(0, (parseQty(text) ?? 0) + d))); persist(item.id).catch(toastError); };
  const zero = () => { commit('0'); persist(item.id).catch(toastError); };
  const toggleSkip = () => { setText(''); setCount(item.id, { qty: null, skipped: !skipped }); persist(item.id).catch(toastError); };

  return (
    <div className="py-3 border-b border-slate-100 dark:border-slate-800 last:border-0" data-testid={`stok-item-${item.id}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.name}</p>
          <p className={`text-xs ${item.required ? 'text-accent-600 dark:text-accent-400' : LBL}`}>{item.required ? 'Wajib' : 'Opsional'} · {item.unit}</p>
        </div>
        {skipped ? <span className={`text-xs ${LBL} pr-2`}>Dilewati</span> : (
          <div className="flex items-center gap-1">
            <button type="button" className={STEP_BTN} disabled={ro} onClick={() => step(-1)} aria-label={`Kurangi ${item.name}`}><Minus className="w-4 h-4" /></button>
            <input
              inputMode="decimal" placeholder="0" value={text} disabled={ro} aria-label={`Jumlah ${item.name}`}
              onFocus={() => { focused.current = true; }}
              onChange={(e) => commit(e.target.value.replace(/[^0-9.,]/g, ''))}
              onBlur={() => { focused.current = false; persist(item.id).catch(toastError); }}
              className={`w-14 h-9 text-center rounded-xl border text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-accent-500/20 disabled:opacity-60 ${filled ? 'border-emerald-300 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}
            />
            <button type="button" className={STEP_BTN} disabled={ro} onClick={() => step(1)} aria-label={`Tambah ${item.name}`}><Plus className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      {!ro && (
        <div className="flex gap-4 mt-1.5 justify-end text-xs font-medium">
          {!skipped && <button type="button" onClick={zero} className="text-slate-500 dark:text-slate-400 underline">Habis (0)</button>}
          {!item.required && <button type="button" onClick={toggleSkip} className="text-slate-500 dark:text-slate-400 underline">{skipped ? 'Isi lagi' : 'Lewati'}</button>}
        </div>
      )}
    </div>
  );
}

function SaveSheet({ open, onClose, onConfirm, master, counts, pengisi }) {
  const [busy, setBusy] = useState(false);
  const filled = master.flatMap((c) => c.items).filter((i) => counts[i.id]?.qty !== null && counts[i.id]?.qty !== undefined).length;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <Modal isOpen={open} onClose={onClose} sheet size="md">
      <div className="p-5 space-y-4" data-testid="stok-simpan-sheet">
        <div>
          <p className="font-heading font-bold text-slate-900 dark:text-slate-50 mb-1">Simpan hasil stok?</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{filled} item terisi di {master.length} kategori, diisi oleh <b>{pengisi}</b>. Setelah disimpan, isian terkunci dan Absen Pulang terbuka.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Periksa lagi</Button>
          <Button onClick={submit} disabled={busy} icon={<Save className="w-4 h-4" />}>{busy ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Kartu "siapa yang mengisi": nama WAJIB dipilih (dropdown dari data karyawan) sebelum kategori tampil. */
function PengisiCard({ initial, today, onSubmit }) {
  const { names, loading, error, reload } = useStockEmployees(today);
  const [picked, setPicked] = useState(initial);
  const shown = initial && !names.includes(initial) ? [initial, ...names] : names;   // nama lama yang tidak ada di daftar tetap bisa dipilih lagi
  return (
    <Card padding="md" className="space-y-3" data-testid="stok-pengisi-form">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400 flex items-center justify-center"><UserRound className="w-5 h-5" /></div>
        <div className="min-w-0">
          <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50">Siapa yang mengisi stok hari ini?</p>
          <p className={`text-xs ${LBL}`}>Pilih nama yang melakukan checklist, bisa beda dengan yang buka dompet.</p>
        </div>
      </div>
      {error ? (
        <div className="space-y-2">
          <Alert type="banner" variant="error">Daftar karyawan belum bisa dimuat: {error}</Alert>
          <Button variant="secondary" size="full" onClick={reload}>Coba lagi</Button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (picked) onSubmit(picked); }} className="space-y-3">
          <Select label="Nama pengisi" title="Nama pengisi" value={picked} onChange={(e) => setPicked(e.target.value)} disabled={loading || shown.length === 0} data-testid="stok-pengisi-select">
            <option value="">{loading ? 'Memuat...' : shown.length === 0 ? 'Belum ada karyawan aktif' : 'Pilih nama'}</option>
            {shown.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
          {!loading && shown.length === 0 && <p className={`text-xs ${LBL}`}>Minta owner menambahkan karyawan di layar Karyawan.</p>}
          <Button type="submit" size="full" disabled={!picked}>Mulai Isi</Button>
        </form>
      )}
    </Card>
  );
}

export default function StockFill({ stock }) {
  const { master, counts, doneIds, locked, day, today } = stock;
  const [pengisi, setPengisi] = useState(() => readPengisi(today));
  const [draft, setDraft] = useState('');                 // isi awal kolom nama saat "Ganti"
  useEffect(() => { setPengisi(readPengisi(today)); setDraft(''); }, [today]);   // ganti hari bisnis = tanya lagi
  const [openId, setOpenId] = useState(undefined);       // undefined = otomatis buka kategori pertama yang belum selesai
  const [sheet, setSheet] = useState(false);

  const gating = gatingCategories(master);
  const doneCount = gating.filter((c) => doneIds.includes(c.id)).length;
  const firstOpen = master.find((c) => !doneIds.includes(c.id));
  const open = openId === undefined ? firstOpen?.id : openId;
  const check = saveCheck(master, counts, doneIds);
  const pct = gating.length ? Math.round((doneCount / gating.length) * 100) : 100;

  const finish = async (c) => {
    try {
      await stock.finishCategory(c.id, true);
      const next = master.find((x) => x.id !== c.id && !doneIds.includes(x.id));
      setOpenId(next ? next.id : null);
      showToast('Kategori selesai');
    } catch (e) { toastError(e); }
  };
  const reopen = async (c) => { try { await stock.finishCategory(c.id, false); setOpenId(c.id); } catch (e) { toastError(e); } };
  const doSave = async () => {
    try { await stock.save(pengisi); setSheet(false); showToast('Tersimpan — Absen Pulang terbuka'); }
    catch (e) { toastError(e); throw e; }
  };
  const setName = (n) => { savePengisi(today, n); setPengisi(n); };
  const changeName = () => { setDraft(pengisi); savePengisi(today, ''); setPengisi(''); };

  if (!master.length) {
    return <EmptyState title="Belum ada item stok" description="Minta owner menambahkan item stok." />;
  }

  return (
    <div className="space-y-3" data-testid="stok-isi">
      <Card padding="md">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${locked ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
            {locked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50" data-testid="stok-gate-judul">{locked ? 'Absen pulang terbuka' : 'Absen pulang terkunci'}</p>
            <p className={`text-xs ${LBL}`}>{locked ? `Disimpan${day?.saved_by ? ` oleh ${day.saved_by}` : ''}` : `${doneCount}/${gating.length} kategori selesai · simpan hasil untuk membuka`}</p>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-3 overflow-hidden">
          <div className={`h-full rounded-full ${locked ? 'bg-emerald-500' : 'bg-gradient-to-r from-accent-600 to-accent-500'}`} style={{ width: `${locked ? 100 : pct}%` }} />
        </div>
      </Card>

      {locked && (
        <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl px-3.5 py-3 space-y-1" data-testid="stok-selesai">
          <p className="flex items-center gap-2"><Check className="w-4 h-4 shrink-0" /> Stok sudah selesai diisi.</p>
          <a href={ABSENSI_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold underline" data-testid="stok-link-absen">
            Isi absen pulang sekarang <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {!locked && !pengisi && <PengisiCard key={draft} initial={draft} today={today} onSubmit={setName} />}

      {!locked && pengisi && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs" data-testid="stok-pengisi">
          <p className={LBL}>Diisi oleh <span className="font-bold text-slate-700 dark:text-slate-200">{pengisi}</span></p>
          <button type="button" onClick={changeName} className="font-semibold text-accent-600 dark:text-accent-400 underline">Ganti</button>
        </div>
      )}

      {(locked || pengisi) && master.map((c) => {
        const done = doneIds.includes(c.id), ro = locked || done, isOpen = open === c.id;
        const { filled, total } = categoryProgress(c, counts);
        return (
          <Card key={c.id} padding="none" className="overflow-hidden" data-testid={`stok-kategori-${c.id}`}>
            <button type="button" onClick={() => setOpenId(isOpen ? null : c.id)} className="w-full flex items-center gap-3 p-4 text-left">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${done ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400'}`}>
                {done ? <Check className="w-4 h-4" /> : <span className="font-heading text-xs font-bold">{c.items.length}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{c.name}</p>
                <p className={`text-xs ${LBL}`}>{total ? `${filled}/${total} wajib terisi` : 'Semua opsional'} · {c.items.length} item</p>
              </div>
              {isOpen ? <ChevronUp className={`w-4 h-4 ${LBL}`} /> : <ChevronDown className={`w-4 h-4 ${LBL}`} />}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
                {c.items.length === 0 && <p className={`text-xs ${LBL} py-4 text-center`}>Kategori ini belum punya item.</p>}
                {c.items.map((i) => <QtyRow key={i.id} item={i} count={counts[i.id]} ro={ro} setCount={stock.setCount} persist={stock.persist} />)}
                {!locked && (done
                  ? <Button variant="secondary" size="full" className="mt-3" onClick={() => reopen(c)}>Ubah isian kategori ini</Button>
                  : <Button size="full" className="mt-3" disabled={!categoryReady(c, counts)} onClick={() => finish(c)}>{categoryReady(c, counts) ? 'Selesai Kategori Ini' : `Isi ${total - filled} item wajib lagi`}</Button>)}
              </div>
            )}
          </Card>
        );
      })}

      {!locked && pengisi && (
        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur border-t border-slate-100 dark:border-slate-900">
          <Button size="full" disabled={!check.ok} onClick={() => setSheet(true)} icon={<Save className="w-4 h-4" />} data-testid="stok-simpan">Simpan Hasil Stok</Button>
          {!check.ok && <p className={`text-xs text-center mt-1.5 ${LBL}`}>{check.reason}</p>}
        </div>
      )}

      <SaveSheet open={sheet} onClose={() => setSheet(false)} onConfirm={doSave} master={master} counts={counts} pengisi={pengisi} />
    </div>
  );
}
