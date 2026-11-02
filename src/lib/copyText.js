/**
 * copyText — salin teks ke papan klip. Mengembalikan true kalau berhasil.
 * Memakai Clipboard API; kalau tidak ada atau ditolak (mis. WebView lama), jatuh ke textarea sementara + execCommand.
 */
export async function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ditolak: coba cara lama di bawah
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
