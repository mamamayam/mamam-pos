import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getDeviceId, deviceCode, setDeviceFeature, cacheStatus, getCachedStatus } from '../lib/deviceId';
import { STATUS, isMissingTable, needsSeenUpdate } from './deviceLogic';

/**
 * useDeviceStatus — status HP ini di tabel `devices` (didaftarkan owner di Pengaturan > Perangkat).
 * Dijalankan setelah login (semua peran): HP baru otomatis masuk daftar "menunggu".
 * Sambil terkunci, status dicek ulang tiap 15 detik dan saat app kembali dibuka.
 */
export function useDeviceStatus(enabled) {
  const [state, setState] = useState({ status: STATUS.LOADING, name: '' });
  const busy = useRef(false);
  const id = getDeviceId();
  const code = deviceCode(id);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { error: upErr } = await supabase.from('devices')
        .upsert({ id, code, user_agent: String(navigator.userAgent || '').slice(0, 200) }, { onConflict: 'id', ignoreDuplicates: true });
      if (upErr && isMissingTable(upErr)) { setDeviceFeature(false); setState({ status: STATUS.OFF, name: '' }); return; }
      const { data, error } = upErr ? { data: null, error: upErr } : await supabase.from('devices').select('status, name, last_seen_at').eq('id', id).maybeSingle();
      if (error || !data) {
        // Server tidak terjangkau: HP yang tadinya terdaftar tetap boleh jalan, selebihnya terkunci.
        const cached = getCachedStatus(id);
        if (cached === STATUS.OK) setDeviceFeature(true);   // tabel `devices` pernah terbukti ada: tetap kirim device_id
        setState({ status: cached === STATUS.OK ? STATUS.OK : STATUS.FAILED, name: '' });
        return;
      }
      setDeviceFeature(true);
      cacheStatus(id, data.status);
      setState({ status: data.status, name: data.name || '' });
      if (data.status === STATUS.OK && needsSeenUpdate(data.last_seen_at)) {
        supabase.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', id).then(() => {}, () => {});
      }
    } finally { busy.current = false; }
  }, [id, code]);

  useEffect(() => { if (enabled) check(); }, [enabled, check]);

  const locked = enabled && state.status !== STATUS.OK && state.status !== STATUS.OFF;
  useEffect(() => {
    if (!locked) return undefined;
    const t = setInterval(check, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [locked, check]);

  return { ...state, code, id, refresh: check };
}
