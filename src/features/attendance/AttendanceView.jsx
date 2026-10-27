import { useState } from 'react';
import { RefreshCw, Fingerprint, Pencil } from 'lucide-react';
import { Card, Badge, Button, EditedMark, EmptyState } from '../../components/ui';
import { useAttendanceDay } from '../../hook/useAttendanceDay';
import PeriodNav from '../../components/PeriodNav';
import { parseIsoDate, formatIsoDate } from '../payroll/payrollEngine';
import { toLocalDateString } from '../../utils/formatters';
import { useAuth } from '../../auth/AuthContext';
import AttendanceEditSheet from './AttendanceEditSheet';

/**
 * AttendanceView — Absensi. Papan BACA-SAJA: siapa sedang jaga, bolong, belum
 * absen, sudah pulang, atau libur pada satu hari. Data dari sistem absensi;
 * absen dilakukan di sana, bukan di sini.
 */
const STATUS = {
  sedangJaga: { label: 'Sedang Jaga', variant: 'success' },
  bolong: { label: 'Sedang Bolong', variant: 'warning' },
  perluKlarifikasi: { label: 'Perlu Klarifikasi', variant: 'danger' },
  lupaPulang: { label: 'Lupa Absen Pulang?', variant: 'danger' },
  belumAbsen: { label: 'Belum Absen', variant: 'neutral' },
  sudahPulang: { label: 'Sudah Pulang', variant: 'info' },
  libur: { label: 'Libur', variant: 'neutral' },
};
const fmtHM = (min) => `${Math.floor(min / 60)}j ${String(min % 60).padStart(2, '0')}m`;
const shiftDay = (iso, n) => formatIsoDate(new Date(parseIsoDate(iso).getTime() + n * 86400000));
const longDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };

export default function AttendanceView() {
  const today = toLocalDateString();
  const [date, setDate] = useState(today);
  const { loading, error, board, info, updatedAt, reload, overrideKeys } = useAttendanceDay({ date });
  const { can } = useAuth();
  const canEdit = can('absensi.edit');
  const [editRow, setEditRow] = useState(null);

  // Pilihan hari: besok + 45 hari ke belakang (tanggal yang lebih jauh lewat kolom kalender).
  const dayOptions = Array.from({ length: 47 }, (_, i) => {
    const iso = shiftDay(today, 1 - i);
    return { value: iso, label: longDate(iso), tag: i === 1 ? 'Hari ini' : i === 2 ? 'Kemarin' : undefined };
  });

  const warnings = [];
  if (info) {
    if (info.unknownEmployees.length) warnings.push(`Ada absensi dari ${info.unknownEmployees.length} orang yang belum ada di daftar Karyawan: ${info.unknownEmployees.slice(0, 4).map(u => u.name).join(', ')}${info.unknownEmployees.length > 4 ? ', dst' : ''}.`);
  }

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      <div className="max-w-3xl w-full space-y-4 pb-10">
        <Card className="space-y-2">
          <PeriodNav
            label={longDate(date)} labelTestId="att-date"
            onPrev={() => setDate(shiftDay(date, -1))} onNext={() => setDate(shiftDay(date, 1))}
            prevLabel="Hari sebelumnya" nextLabel="Hari berikutnya"
            onToday={() => setDate(today)} isCurrent={date === today}
            picker={{
              title: 'Pilih Tanggal', value: date, onChange: setDate,
              options: dayOptions,
              dateInput: { value: date, onChange: setDate, label: 'Atau pilih tanggal lain' },
            }}
          />
          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
            <span data-testid="att-updated">{updatedAt ? `Diperbarui ${updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Memuat...'}</span>
            <button onClick={reload} className="flex items-center gap-1 font-bold text-accent-600 dark:text-accent-400"><RefreshCw className="w-3 h-3" /> Perbarui</button>
          </div>
        </Card>

        {error && (
          <Card className="text-center space-y-2 border-2 border-red-200 dark:border-red-500/30">
            <p className="text-sm font-semibold text-red-500">Gagal membaca absensi</p><p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
            <Button onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Coba Lagi</Button>
          </Card>
        )}
        {loading && !board && !error && <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">Membaca absensi...</div>}

        {board && (
          <>
            {warnings.length > 0 && (
              <Card className="space-y-1.5 border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5">
                {warnings.map((w, i) => <p key={i} className="text-xs text-amber-800 dark:text-amber-300">• {w}</p>)}
              </Card>
            )}

            {board.rows.length === 0 ? (
              <EmptyState icon={<Fingerprint className="w-12 h-12" />} title="Belum ada karyawan. Tambah atau impor di menu Karyawan." />
            ) : board.rows.map(r => (
              <div key={r.employee.id} data-testid={`att-${r.employee.name}`} className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 ${r.status === 'perluKlarifikasi' || r.status === 'lupaPulang' ? 'border-red-300 dark:border-red-500/40' : 'border-slate-100 dark:border-slate-800'}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-slate-800 dark:text-slate-100 truncate">{r.employee.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{r.employee.role}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.edited && <EditedMark label="Diedit owner" data-testid={`diedit-${r.employee.name}`} />}
                    <Badge size="sm" variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    {canEdit && <button type="button" aria-label={`Edit absen ${r.employee.name}`} data-testid={`edit-${r.employee.name}`} onClick={() => setEditRow(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-accent-600 active:scale-90 transition-all"><Pencil className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
                {(r.masuk || r.pulang || r.bolongs.length > 0) && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {r.masuk && <span>Masuk <b className="text-slate-800 dark:text-slate-100">{r.masuk}</b></span>}
                    {r.bolongs.map((b, i) => <span key={i}>Bolong <b className="text-slate-800 dark:text-slate-100">{b.from}</b>{b.to ? <> → <b className="text-slate-800 dark:text-slate-100">{b.to}</b></> : ' (belum kembali)'}</span>)}
                    {r.pulang && <span>Pulang <b className="text-slate-800 dark:text-slate-100">{r.pulang}</b></span>}
                    {r.status === 'sudahPulang' && <span className="text-slate-500">· {fmtHM(r.workedMinutes)}{r.overtimeMinutes > 0 && ` · lembur ${r.overtimeMinutes}m`}</span>}
                  </div>
                )}
                {r.note && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">{r.note}</p>}
                {(r.status === 'perluKlarifikasi' || r.status === 'lupaPulang') && (
                  <div className="mt-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 p-3 flex items-center justify-between gap-3" data-testid={`klarifikasi-${r.employee.name}`}>
                    <p className="text-xs text-red-700 dark:text-red-300 min-w-0">
                      {r.status === 'perluKlarifikasi'
                        ? `Bolong ${r.bolongs.find(b => !b.to)?.from ?? ''} belum ada masuk-lagi, tapi sudah ada jam pulang${r.pulang ? ` ${r.pulang}` : ''}. Mana yang benar?`
                        : 'Ada jam masuk tapi tidak ada jam pulang.'}
                      {!canEdit && ' Minta owner untuk mengoreksi.'}
                    </p>
                    {canEdit && <Button size="xs" className="shrink-0" onClick={() => setEditRow(r)} data-testid={`selesaikan-${r.employee.name}`}>Selesaikan</Button>}
                  </div>
                )}
                {r.autoLibur && <p className="text-xs text-slate-400 mt-1.5">libur otomatis (tidak ada absen)</p>}
              </div>
            ))}
          </>
        )}
      </div>

      {editRow && (
        <AttendanceEditSheet
          isOpen onClose={() => setEditRow(null)} employee={editRow.employee} date={date}
          initial={{ masuk: editRow.masuk || '', pulang: editRow.pulang || '', bolongs: editRow.bolongs.map(b => ({ from: b.from, to: b.to || '' })), libur: editRow.status === 'libur' }}
          hasOverride={overrideKeys.has(`${editRow.employee.id}|${date}`)} onSaved={reload}
        />
      )}
    </div>
  );
}
