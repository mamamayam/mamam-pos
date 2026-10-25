import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Lock, LockKeyhole, UserRound, ArrowLeft, RefreshCw } from 'lucide-react';
import { Card, Button, Badge, EmptyState, PillTabs } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { usePayrollData } from '../../hook/usePayrollData';
import { useAppSettings } from '../../hook/useAppSettings';
import { useEmployeePins } from '../../hook/useEmployeePins';
import PinPad from '../../auth/PinPad';
import { EMPLOYEE_ATTEMPT_RULES, readAttempts, recordAttempt, isLocked, secondsLeft, attemptsLeft } from '../../auth/authLogic';
import { weekPeriodForDate, shiftWeek, monthPeriod, formatIsoDate } from './payrollEngine';
import { toLocalDateString } from '../../utils/formatters';

/**
 * MyPayroll — Penggajian untuk STAF. Karyawan memilih namanya, memasukkan PIN,
 * lalu melihat gajinya sendiri (mingguan / bulanan), hanya-lihat.
 *
 * Catatan keamanan (level "Longgar"): ini pagar tampilan antar-karyawan di
 * perangkat toko. Data gaji semua orang tetap bisa dibaca lewat API oleh siapa
 * pun yang punya akses database (lihat docs/auth-setup.md).
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MON_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const fmtDay = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
const fmtDayYear = (iso) => `${fmtDay(iso)} ${iso.slice(0, 4)}`;
const fmtHM = (min) => `${Math.floor(min / 60)}j ${String(min % 60).padStart(2, '0')}m`;
const fmtLock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const shiftMonth = (key, delta) => formatIsoDate(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + delta, 1))).slice(0, 7);

const STATUS_LABEL = { hadir: 'Hadir', libur: 'Libur', belumAbsen: 'Belum absen', belumPulang: 'Belum pulang', perluKlarifikasi: 'Perlu klarifikasi' };
const STATUS_VARIANT = { hadir: 'success', libur: 'neutral', belumAbsen: 'neutral', belumPulang: 'warning', perluKlarifikasi: 'danger' };

const ATTEMPTS_KEY = 'mamam-pos-emp-attempts';
const readMap = () => { try { return JSON.parse(window.localStorage.getItem(ATTEMPTS_KEY)) || {}; } catch { return {}; } };
const writeMap = (m) => { try { window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(m)); } catch { /* abaikan */ } };
const attemptsFor = (id) => readAttempts(JSON.stringify(readMap()[id]), Date.now(), EMPLOYEE_ATTEMPT_RULES);

const ROOT = 'p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out';

export default function MyPayroll() {
  const { settings, loading: settingsLoading } = useAppSettings();
  const dir = useEmployeePins();
  const [who, setWho] = useState(null);             // { id, name } karyawan yang sudah membuka kunci

  if (settingsLoading || dir.loading) return <div className={ROOT}><p className="text-center text-sm text-slate-400 py-10">Memuat...</p></div>;

  if (dir.error) {
    return (
      <div className={ROOT}><Card className="text-center space-y-2 max-w-3xl">
        <p className="text-sm font-semibold text-red-500">Gagal memuat</p><p className="text-xs text-slate-400">{dir.error}</p>
        <Button onClick={dir.reload} icon={<RefreshCw className="w-4 h-4" />}>Coba Lagi</Button>
      </Card></div>
    );
  }

  if (!settings.employee_pin_enabled) {
    return (
      <div className={ROOT}><div className="max-w-3xl w-full" data-testid="pin-dimatikan">
        <EmptyState icon={<Lock className="w-12 h-12" />} title="Melihat gaji lewat PIN sedang dimatikan. Hubungi owner." />
      </div></div>
    );
  }

  if (!who) return <PinGate people={dir.people} verifyPin={dir.verifyPin} onUnlock={setWho} />;
  return <MySalary employee={who} minutes={settings.employee_pin_view_minutes} onLock={() => setWho(null)} />;
}

// ── 1. Pilih nama + PIN ─────────────────────────────────────────────
function PinGate({ people, verifyPin, onUnlock }) {
  const [picked, setPicked] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [att, setAtt] = useState(null);
  const [now, setNow] = useState(Date.now());

  const withPin = people.filter((p) => p.hasPin);
  const locked = att ? isLocked(att, now) : false;

  useEffect(() => {
    if (!locked) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [locked]);

  const pick = (p) => { setPicked(p); setMessage(''); setAtt(attemptsFor(p.id)); setNow(Date.now()); };

  const onComplete = async (pin, reset) => {
    const t = Date.now();
    const cur = attemptsFor(picked.id);
    if (isLocked(cur, t)) { setAtt(cur); setNow(t); reset(); return; }
    setBusy(true);
    let ok = false;
    try { ok = await verifyPin(picked.id, pin); } catch (e) { setBusy(false); setMessage(e.message); reset(); return; }
    setBusy(false);
    const next = recordAttempt(cur, ok, Date.now(), EMPLOYEE_ATTEMPT_RULES);
    writeMap({ ...readMap(), [picked.id]: next });
    setAtt(next); setNow(Date.now()); reset();
    if (ok) { onUnlock({ id: picked.id, name: picked.name }); return; }
    setMessage(isLocked(next, Date.now()) ? '' : `PIN salah. Sisa percobaan ${attemptsLeft(next, EMPLOYEE_ATTEMPT_RULES)}.`);
  };

  if (!picked) {
    return (
      <div className={ROOT}>
        <div className="max-w-3xl w-full space-y-4" data-testid="pin-gate">
          <div className="text-center pt-2">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><LockKeyhole className="w-6 h-6 text-slate-500" /></div>
            <h2 className="font-heading font-bold text-lg text-slate-800 dark:text-slate-100">Gaji Saya</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Pilih namamu, lalu masukkan PIN.</p>
          </div>
          {withPin.length === 0 ? (
            <EmptyState icon={<UserRound className="w-12 h-12" />} title="Belum ada karyawan yang punya PIN. Minta owner mengatur di Pengaturan." />
          ) : withPin.map((p) => (
            <button key={p.id} onClick={() => pick(p)} data-testid={`pilih-${p.name}`}
              className="w-full text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 font-heading font-bold text-slate-800 dark:text-slate-100 active:scale-[0.99] transition-all">{p.name}</button>
          ))}
        </div>
      </div>
    );
  }

  const shown = locked ? `PIN salah ${EMPLOYEE_ATTEMPT_RULES.max}x. Dikunci, coba lagi dalam ${fmtLock(secondsLeft(att, now))}. Atau minta owner mengganti PIN.` : message;
  return (
    <div className={ROOT}>
      <div className="max-w-3xl w-full space-y-6" data-testid="pin-gate-pad">
        <button onClick={() => setPicked(null)} className="flex items-center gap-1 text-xs font-bold text-slate-500"><ArrowLeft className="w-4 h-4" /> Ganti nama</button>
        <div className="text-center">
          <h2 className="font-heading font-bold text-lg text-slate-800 dark:text-slate-100">{picked.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Masukkan PIN</p>
        </div>
        <PinPad key={picked.id} onComplete={onComplete} disabled={locked || busy} />
        <p role="alert" data-testid="pin-gate-message" className="min-h-5 text-sm font-semibold text-red-500 text-center">{shown}</p>
      </div>
    </div>
  );
}

// ── 2. Gaji sendiri (hanya-lihat) ───────────────────────────────────
function MySalary({ employee, minutes, onLock }) {
  const { formatRupiah } = useAppContext();
  const today = toLocalDateString();
  const [mode, setMode] = useState('minggu');
  const [anchor, setAnchor] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const period = useMemo(() => (mode === 'minggu' ? weekPeriodForDate(anchor) : monthPeriod(month)), [mode, anchor, month]);
  const { loading, error, status, attendance, results, reload, isLocked: periodClosed } = usePayrollData({ period });

  // Kunci lagi otomatis kalau tidak disentuh selama `minutes` menit.
  const lastTouch = useRef(Date.now());
  const touch = useCallback(() => { lastTouch.current = Date.now(); }, []);
  useEffect(() => {
    const id = setInterval(() => { if (Date.now() - lastTouch.current >= minutes * 60 * 1000) onLock(); }, 5000);
    return () => clearInterval(id);
  }, [minutes, onLock]);

  const goPrev = () => (mode === 'minggu' ? setAnchor(shiftWeek(period, -7).start) : setMonth(shiftMonth(month, -1)));
  const goNext = () => (mode === 'minggu' ? setAnchor(shiftWeek(period, 7).start) : setMonth(shiftMonth(month, 1)));
  const goToday = () => { setAnchor(today); setMonth(today.slice(0, 7)); };
  const label = mode === 'minggu' ? `${fmtDay(period.start)} – ${fmtDayYear(period.end)}` : `${MON_FULL[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

  const mine = results.find((r) => r.employee.id === employee.id) || null;
  const ready = status === 'ready' || status === 'closed';

  return (
    <div className={ROOT} onPointerDown={touch} onKeyDown={touch} onScroll={touch}>
      <div className="max-w-3xl w-full space-y-4 pb-10" data-testid="my-salary">
        <Card className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Gaji saya</p>
            <p className="font-heading font-bold text-slate-800 dark:text-slate-100 truncate" data-testid="my-name">{employee.name}</p>
          </div>
          <Button size="sm" variant="secondary" icon={<Lock className="w-4 h-4" />} onClick={onLock} data-testid="kunci-lagi">Kunci</Button>
        </Card>

        <Card className="space-y-3">
          <PillTabs value={mode} onChange={setMode} options={[{ value: 'minggu', label: 'Mingguan' }, { value: 'bulan', label: 'Bulanan' }]} />
          <div className="flex items-center justify-between gap-2">
            <button onClick={goPrev} aria-label="Sebelumnya" className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 active:scale-95 transition-all"><ChevronLeft className="w-4 h-4" /></button>
            <div className="text-center min-w-0">
              <p className="font-heading font-bold text-slate-800 dark:text-slate-100 text-sm truncate" data-testid="period-label">{label}</p>
              <button onClick={goToday} className="text-xs font-bold text-accent-600 dark:text-accent-400">Ke hari ini</button>
            </div>
            <button onClick={goNext} aria-label="Berikutnya" className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 active:scale-95 transition-all"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </Card>

        {loading && <p className="text-center text-sm text-slate-400 py-8">Memuat gaji...</p>}
        {error && (
          <Card className="text-center space-y-2"><p className="text-sm font-semibold text-red-500">Gagal memuat data</p><p className="text-xs text-slate-400">{error}</p>
            <Button onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Coba Lagi</Button></Card>
        )}
        {status === 'error' && (
          <Card className="text-center space-y-2"><p className="text-sm font-semibold text-red-500">Absensi gagal dibaca</p><p className="text-xs text-slate-400">{attendance.error}</p>
            <Button onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Coba Lagi</Button></Card>
        )}

        {ready && !mine && <EmptyState icon={<UserRound className="w-12 h-12" />} title="Tidak ada data gaji untuk periode ini." />}

        {ready && mine && (() => {
          const p = mine.payroll, a = p.attendance;
          return (
            <>
              {periodClosed && <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 shrink-0" /> Periode ini sudah ditutup owner, angkanya final.</p>}
              {!periodClosed && <p className="text-xs text-slate-400">Periode berjalan: angka bisa berubah sampai owner menutup periode.</p>}

              <Card className="space-y-1.5 text-sm" data-testid="my-ringkasan">
                <Row k={`Upah (${fmtHM(a.totalWorkedMinutes)} / ${a.hadirDays} hari kerja)`} v={a.wagePay} f={formatRupiah} />
                <Row k={`Lembur (${a.overtimeBlocks30Min} blok)`} v={a.overtimePay} f={formatRupiah} />
                <Row k={`Bonus Full Time (${a.fullTimeDays} hari)`} v={a.fullTimeBonusPay} f={formatRupiah} />
                <Row k="Tambahan" v={p.additionsTotal} f={formatRupiah} />
                <Row k="Potongan" v={-p.deductionsTotal} f={formatRupiah} />
                {period.monthKey && p.openingBalance !== 0 && <Row k={p.openingBalance < 0 ? 'Sisa bulan lalu (kurang bayar)' : 'Hutang bulan lalu'} v={-p.openingBalance} f={formatRupiah} />}
                <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-200 dark:border-slate-700"><span>Gaji Bersih</span><span data-testid="my-net" className={p.netPay < 0 ? 'text-red-500' : 'text-accent-600 dark:text-accent-400'}>{formatRupiah(p.netPay)}</span></div>
              </Card>

              {mine.needsClarification.length > 0 && (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{mine.needsClarification.length} hari belum dibayar karena absennya perlu diklarifikasi owner ({mine.needsClarification.map((d) => fmtDay(d.date)).join(', ')}).</p>
              )}

              <Card className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Rincian Harian</p>
                {a.dayRows.length === 0 ? <p className="text-xs text-slate-400">Tidak ada absensi pada periode ini.</p> : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {a.dayRows.map((d) => (
                      <div key={d.date} className="py-2 flex justify-between items-center gap-2 text-xs" data-testid="my-day-row">
                        <div className="min-w-0"><span className="font-bold text-slate-700 dark:text-slate-200">{fmtDay(d.date)}</span> <Badge size="sm" variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status]}</Badge></div>
                        {d.status === 'hadir' && <div className="text-right text-slate-500 dark:text-slate-400 shrink-0">{fmtHM(d.workedMinutes)}{d.overtimeMinutes > 0 && ` · lembur ${d.overtimeMinutes}m`}{d.bolongMinutes > 0 && ` · bolong ${d.bolongMinutes}m`}{d.fullTimeBonus && ' · FT'}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {(p.additions.length > 0 || p.deductions.length > 0) && (
                <Card className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tambahan &amp; Potongan</p>
                  {[...p.additions.map((x) => ['tambahan', x]), ...p.deductions.map((x) => ['potongan', x])].map(([kind, it]) => (
                    <div key={kind + it.id} className="flex justify-between items-center gap-2 bg-slate-50 dark:bg-slate-950 rounded-xl p-2.5 text-xs">
                      <div className="min-w-0"><Badge size="sm" variant={kind === 'tambahan' ? 'success' : 'danger'}>{it.category}</Badge> <span className="font-semibold">{it.label}</span> <span className="text-slate-400">{fmtDay(it.date)}</span></div>
                      <span className={`font-bold shrink-0 ${kind === 'tambahan' ? 'text-emerald-600' : 'text-red-500'}`}>{kind === 'tambahan' ? '+' : '-'}{formatRupiah(it.amount)}</span>
                    </div>
                  ))}
                </Card>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function Row({ k, v, f }) {
  return <div className="flex justify-between gap-3"><span className="text-slate-500 dark:text-slate-400">{k}</span><span className="font-bold text-slate-800 dark:text-slate-100 shrink-0">{f(v)}</span></div>;
}
