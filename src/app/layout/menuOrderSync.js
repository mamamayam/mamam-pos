import { normalizeLayout } from './menuOrder';

/**
 * menuOrderSync — simpan tata letak ikon menu ({ pinned, full }, lihat menuOrder.js) ke server (tabel app_settings,
 * satu baris per peran) supaya ikut ke HP/browser mana pun. Nilai lama berupa array id tetap terbaca.
 * Tidak butuh tabel/SQL baru: app_settings sudah ada (migrasi 008).
 * Fungsi menerima klien Supabase supaya bisa dites. Semua kegagalan jaringan DIAM-DIAM diabaikan:
 * urutan di perangkat ini (localStorage) tetap jalan, server menyusul di kesempatan berikutnya.
 */
export const menuOrderKey = (role) => `menu_order:${role || 'umum'}`;

/** Tata letak di server: { pinned, full }, null = belum pernah disimpan, undefined = tidak bisa dibaca (offline/galat). */
export async function fetchMenuOrder(client, role) {
  try {
    const { data, error } = await client.from('app_settings').select('value').eq('key', menuOrderKey(role));
    if (error) return undefined;
    return normalizeLayout(data?.[0]?.value);
  } catch { return undefined; }
}

export async function pushMenuOrder(client, role, layout) {
  try {
    const { error } = await client.from('app_settings')
      .upsert({ key: menuOrderKey(role), value: layout, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return !error;
  } catch { return false; }
}

export async function deleteMenuOrder(client, role) {
  try {
    const { error } = await client.from('app_settings').delete().eq('key', menuOrderKey(role));
    return !error;
  } catch { return false; }
}
