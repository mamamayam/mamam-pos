import { supabase } from '../lib/supabase';
import { additionUpdateRow, additionChanged, mapAdditionRow } from '../features/home/quickEntryMath';

/**
 * additionEdit — owner mengubah Tambah (payroll_additions) dari mana pun: "Catatan Hari Ini" di Beranda
 * dan kartu pengajuan di sheet Persetujuan. Satu jalur supaya aturannya sama: status/persetujuan TIDAK berubah
 * (pengajuan tetap menunggu sampai owner menyetujui/menolak), periode gaji yang sudah ditutup ditolak database
 * (trigger migrasi 006), dan penanda "Diedit" (edited_at, migrasi 019) hanya diisi kalau isinya benar-benar berubah.
 */
const MIGRATION_HINT = 'Fitur ini butuh migrasi baru: jalankan supabase/migrations/009_catat_cepat.sql di SQL Editor dulu.';

export async function saveAdditionEdit(id, form, hadDetail = false) {
  const patch = additionUpdateRow(form, { hadDetail });
  const { data: before } = await supabase.from('payroll_additions').select('*').eq('id', id).maybeSingle();
  const changed = before ? additionChanged(mapAdditionRow(before), patch) : false;
  const run = (p) => supabase.from('payroll_additions').update(p).eq('id', id).select('id');
  let { data, error: e } = await run(changed ? { ...patch, edited_at: new Date().toISOString() } : patch);
  // Kolom edited_at belum ada (migrasi 019 belum dijalankan): simpan perubahannya saja, tanpa penanda.
  if (e && changed && ['PGRST204', '42703'].includes(e.code)) ({ data, error: e } = await run(patch));
  if (e) {
    if (['PGRST204', 'PGRST202', '42703', '42883'].includes(e.code) || /schema cache|does not exist/i.test(e.message || '')) throw new Error(MIGRATION_HINT);
    throw new Error(`Gagal mengubah tambahan: ${e.message}`);
  }
  return !!data && data.length > 0;   // false = barisnya sudah tidak ada (mis. dihapus dari HP lain)
}
