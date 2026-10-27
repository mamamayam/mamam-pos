/**
 * stockBypass — kode bypass Absen Pulang: TOTP RFC 6238 (HMAC-SHA1, 6 digit, ganti tiap 30 detik), mirip
 * Google Authenticator. Hanya owner yang melihatnya (kartu di layar Stok Belanja). Web absensi TIDAK punya
 * rahasianya: ia bertanya ke RPC stok_bypass_cek() di database (migrasi 020), yang menghitung rumus yang sama.
 *
 * Rahasia (hex) = VITE_STOCK_BYPASS_SECRET, HARUS sama dengan isi tabel stock_secret di database.
 * Nilai VITE_* ikut terbundel ke JS (sama seperti PIN di pins.js): ini pagar alur kerja, bukan keamanan data.
 */
export const STEP_SECONDS = 30;

export const isValidSecret = (hex) => /^[0-9a-fA-F]{32,}$/.test(String(hex || '')) && String(hex).length % 2 === 0;

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Kode 6 digit untuk waktu `nowMs`. Mengembalikan Promise<string>. */
export async function totpCode(secretHex, nowMs = Date.now(), subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Peramban ini tidak mendukung kriptografi (HTTPS diperlukan).');
  if (!isValidSecret(secretHex)) throw new Error('Rahasia kode bypass tidak valid.');
  const counter = Math.floor(nowMs / 1000 / STEP_SECONDS);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setBigUint64(0, BigInt(counter));
  const key = await subtle.importKey('raw', hexToBytes(secretHex), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await subtle.sign('HMAC', key, msg));
  const o = mac[19] & 15;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Detik tersisa sampai kode berganti (1..30). */
export const secondsLeft = (nowMs = Date.now()) => STEP_SECONDS - (Math.floor(nowMs / 1000) % STEP_SECONDS);

/** "482913" -> "482 913" */
export const groupCode = (code) => (code && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code || '');

export const bypassSecret = () => import.meta.env.VITE_STOCK_BYPASS_SECRET || '';
