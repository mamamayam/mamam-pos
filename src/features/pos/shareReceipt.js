import { shareOrDownloadFile } from '../../lib/shareFile';
import { buildReceiptPdf } from './receiptPdf';
import { receiptFilename, receiptShareTitle } from './receiptModel';

/**
 * shareReceipt — buat PDF struk/tagihan di perangkat lalu bagikan lewat menu share HP
 * (atau diunduh kalau tidak ada menu share). `receipt` = bentuk dari receiptModel.js.
 * Mengembalikan 'shared' | 'cancelled' | 'downloaded'; galat dilempar ke pemanggil.
 */
export async function shareReceipt(receipt, { formatRupiah, business } = {}) {
  const bytes = buildReceiptPdf(receipt, { formatRupiah, business });
  return shareOrDownloadFile(bytes, receiptFilename(receipt), { title: receiptShareTitle(receipt) });
}

/** Versi untuk tombol UI: galat dan "terunduh" jadi pesan lewat `triggerAlert`; tidak pernah melempar. */
export async function shareReceiptWithAlert(receipt, { formatRupiah, triggerAlert, business } = {}) {
  try {
    const result = await shareReceipt(receipt, { formatRupiah, business });
    if (result === 'downloaded') triggerAlert?.('PDF tersimpan di perangkat ini (menu share tidak tersedia).');
    return result;
  } catch (e) {
    triggerAlert?.(e?.message || 'Gagal membuat PDF.');
    return 'error';
  }
}
