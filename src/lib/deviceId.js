/**
 * deviceId — penanda HP ini untuk fitur Perangkat terdaftar.
 *
 * Browser tidak bisa membaca ID perangkat keras, jadi "perangkat" = UUID acak yang disimpan di
 * localStorage saat app pertama dibuka. Hapus data browser / pasang ulang PWA = HP dianggap baru
 * (harus didaftarkan lagi oleh owner). Ini jejak audit, bukan keamanan data.
 */
const ID_KEY = 'mamam-pos-device-id';
const STATUS_KEY = 'mamam-pos-device-status';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID_RE.test(String(v || ''));

export function newUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** Kode pendek untuk mencocokkan HP di layar kunci dengan kartu "menunggu" milik owner: XXXX-XXXX. */
export function deviceCode(id) {
  const hex = String(id || '').replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase().padEnd(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

const safeStorage = () => { try { return window.localStorage; } catch { return null; } };

/** Ambil ID tersimpan; kalau belum ada / rusak, buat baru dan simpan. Penyimpanan diblokir = ID hanya di memori. */
export function readOrCreateId(storage, create = newUuid) {
  let id = null;
  try { id = storage?.getItem(ID_KEY) || null; } catch { /* diblokir */ }
  if (isUuid(id)) return id;
  id = create();
  try { storage?.setItem(ID_KEY, id); } catch { /* diblokir */ }
  return id;
}

let memoryId = null;
export function getDeviceId() {
  if (memoryId) return memoryId;
  memoryId = readOrCreateId(safeStorage());
  return memoryId;
}

/** Status terakhir yang diketahui (untuk HP terdaftar yang sedang offline). */
export function readCachedStatus(storage, id) {
  try {
    const v = JSON.parse(storage?.getItem(STATUS_KEY) || 'null');
    return v && v.id === id ? v.status : null;
  } catch { return null; }
}
export const cacheStatus = (id, status) => { try { safeStorage()?.setItem(STATUS_KEY, JSON.stringify({ id, status })); } catch { /* abaikan */ } };
export const getCachedStatus = (id) => readCachedStatus(safeStorage(), id);

// Kolom device_id baru dikirim setelah dipastikan tabel `devices` ada (migrasi 011 sudah dijalankan);
// sebelum itu, kolom yang belum ada akan membuat simpan transaksi gagal.
/**
 * Fitur dianggap sudah menyala kalau HP ini pernah berhasil memeriksa tabel `devices` (status tersimpan di localStorage untuk ID yang sama).
 * Tanpa ini, `featureOn` baru true setelah pemeriksaan pertama selesai: catatan yang dikirim sebelum itu (app baru dibuka) atau saat
 * pemeriksaan gagal (sinyal putus-nyambung) tidak membawa device_id, lalu DITOLAK server kalau "Kunci di server" aktif.
 */
export function cachedFeatureOn(storage) {
  try {
    const v = JSON.parse(storage?.getItem(STATUS_KEY) || 'null');
    return Boolean(v && isUuid(v.id) && v.id === storage.getItem(ID_KEY));
  } catch { return false; }
}

let featureOn = cachedFeatureOn(safeStorage());
export const setDeviceFeature = (on) => { featureOn = Boolean(on); };
export const deviceFeatureOn = () => featureOn;

// Penanda "pemeriksaan perangkat sudah selesai" (berhasil ATAU gagal). Jalur tulis (catat pengeluaran, bayar, simpan pesanan, potongan)
// menunggu ini sebentar sebelum menyusun payload, supaya device_id tidak terlewat hanya karena pemeriksaan di awal app belum kembali (latensi biasa).
let deviceChecked = false;
let waiters = [];
export const markDeviceChecked = () => { deviceChecked = true; const w = waiters; waiters = []; w.forEach((fn) => fn()); };
/**
 * Resolve begitu pemeriksaan perangkat selesai, atau langsung kalau fitur sudah menyala dari status tersimpan, atau setelah `timeoutMs`
 * (jaringan sangat lambat: lanjut apa adanya, jangan menahan kasir). Tidak pernah menolak.
 */
export function deviceReady(timeoutMs = 4000) {
  if (deviceChecked || featureOn) return Promise.resolve();
  return new Promise((resolve) => {
    let t;
    const selesai = () => { clearTimeout(t); resolve(); };
    t = setTimeout(() => { waiters = waiters.filter((fn) => fn !== selesai); resolve(); }, timeoutMs);
    waiters.push(selesai);
  });
}
/** Hanya untuk tes: kembalikan ke keadaan awal. */
export const resetDeviceReadyForTest = () => { deviceChecked = false; waiters = []; };

/** Sisipkan ke payload insert transactions / expenses. */
export const deviceStamp = () => (featureOn ? { device_id: getDeviceId() } : {});
/** Sisipkan ke argumen RPC catat_potongan. */
export const deviceRpcArg = () => (featureOn ? { p_device_id: getDeviceId() } : {});
