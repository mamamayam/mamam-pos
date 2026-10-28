import { useEffect, useState } from 'react';
import { KeyRound, Copy } from 'lucide-react';
import { Card, Alert } from '../../components/ui';
import { showToast } from '../../lib/toast';
import { bypassSecret, isValidSecret, totpCode, secondsLeft, groupCode, STEP_SECONDS } from './stockBypass';

/**
 * BypassCard — kode 6 digit (ganti tiap 30 detik) untuk membuka Absen Pulang di web absensi TANPA mengisi
 * Stok Belanja. Hanya dirender untuk owner (izin `stok.kelola`, dicek oleh pemanggil) di tab Bypass layar Absensi. Rahasianya
 * VITE_STOCK_BYPASS_SECRET harus sama dengan tabel stock_secret di database (lihat migrasi 020).
 */
export default function BypassCard() {
  const secret = bypassSecret();
  const configured = isValidSecret(secret);
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(() => secondsLeft());
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!configured) return undefined;
    let alive = true, lastWindow = -1;
    const tick = async () => {
      const now = Date.now();
      setLeft(secondsLeft(now));
      const w = Math.floor(now / 1000 / STEP_SECONDS);
      if (w === lastWindow) return;
      lastWindow = w;
      try { const c = await totpCode(secret, now); if (alive) { setCode(c); setErr(''); } }
      catch (e) { if (alive) setErr(e.message); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [configured, secret]);

  if (!configured) {
    return (
      <Alert type="banner" variant="warning" className="!text-left !font-medium">
        Kode bypass belum diatur. Isi <b>VITE_STOCK_BYPASS_SECRET</b> (hex, minimal 32 karakter) di .env.local / env Vercel dan pasang rahasia yang SAMA di tabel stock_secret (langkahnya ada di supabase/migrations/021_stok_belanja.sql).
      </Alert>
    );
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); showToast('Kode disalin'); }
    catch { showToast('Gagal menyalin kode', { type: 'error' }); }
  };

  return (
    <Card variant="dark" padding="md" data-testid="bypass-card">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound className="w-4 h-4 text-accent-400" />
        <p className="text-xs font-bold">Kode Bypass Absen Pulang</p>
      </div>
      <div className="flex items-center justify-between">
        <p className="font-heading text-3xl font-bold tracking-[0.15em] tabular-nums" data-testid="bypass-kode">{err ? '------' : groupCode(code) || '------'}</p>
        <button type="button" onClick={copy} disabled={!code} aria-label="Salin kode" className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center active:scale-95 disabled:opacity-40">
          <Copy className="w-4 h-4" />
        </button>
      </div>
      <div className="h-1 rounded-full bg-white/10 mt-3 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent-600 to-accent-500 transition-[width] duration-1000 ease-linear" style={{ width: `${(left / STEP_SECONDS) * 100}%` }} />
      </div>
      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
        {err || `Berganti dalam ${left} detik.`}
      </p>
    </Card>
  );
}
