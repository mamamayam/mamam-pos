import { shareOrDownloadFile } from '../../lib/shareFile';
import { buildReceiptImage } from './receiptImage';
import { receiptFilename, receiptShareTitle } from './receiptModel';

/**
 * shareReceipt — buat gambar (PNG) struk/tagihan di perangkat lalu bagikan lewat menu share HP
 * (atau diunduh kalau tidak ada menu share). `receipt` = bentuk dari receiptModel.js.
 * Mengembalikan 'shared' | 'cancelled' | 'downloaded'; galat dilempar ke pemanggil.
 */
export async function shareReceipt(receipt, { formatRupiah, business } = {}) {
  const image = await buildReceiptImage(receipt, { formatRupiah, business });
  return shareOrDownloadFile(image, receiptFilename(receipt), { mime: 'image/png', title: receiptShareTitle(receipt) });
}

/** Versi untuk tombol UI: galat dan "terunduh" jadi pesan lewat `triggerAlert`; tidak pernah melempar. */
export async function shareReceiptWithAlert(receipt, { formatRupiah, triggerAlert, business } = {}) {
  try {
    const result = await shareReceipt(receipt, { formatRupiah, business });
    if (result === 'downloaded') triggerAlert?.('Gambar tersimpan di perangkat ini (menu share tidak tersedia).');
    return result;
  } catch (e) {
    triggerAlert?.(e?.message || 'Gagal membuat gambar struk.');
    return 'error';
  }
}
