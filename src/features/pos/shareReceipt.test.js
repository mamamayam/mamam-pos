import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/shareFile', () => ({ shareOrDownloadFile: vi.fn() }));
vi.mock('./receiptImage', () => ({ buildReceiptImage: vi.fn() }));
import { shareOrDownloadFile } from '../../lib/shareFile';
import { buildReceiptImage } from './receiptImage';
import { shareReceipt, shareReceiptWithAlert } from './shareReceipt.js';

const receipt = { number: 'A1B2C3D4', status: 'belum', customerName: 'Bu Rina', items: [{ name: 'Es Teh', note: '', qty: 1, price: 5000 }], subtotal: 5000, total: 5000 };
const opts = { formatRupiah: (n) => `Rp ${n}` };
const png = new Blob(['png'], { type: 'image/png' });

beforeEach(() => {
  shareOrDownloadFile.mockReset();
  buildReceiptImage.mockReset();
  buildReceiptImage.mockResolvedValue(png);
});

describe('shareReceipt', () => {
  it('membuat gambar PNG dan membagikannya (bukan PDF) dengan nama berkas dan judul yang benar', async () => {
    shareOrDownloadFile.mockResolvedValue('shared');
    expect(await shareReceipt(receipt, opts)).toBe('shared');
    expect(buildReceiptImage).toHaveBeenCalledWith(receipt, expect.objectContaining({ formatRupiah: opts.formatRupiah }));
    const [file, name, o] = shareOrDownloadFile.mock.calls[0];
    expect(file).toBe(png);
    expect(name).toBe('Tagihan-A1B2C3D4.png');
    expect(o.mime).toBe('image/png');
    expect(o.title).toBe('Tagihan #A1B2C3D4 · Bu Rina');
  });
});

describe('shareReceiptWithAlert', () => {
  it('dibagikan atau dibatalkan: tanpa pesan', async () => {
    const triggerAlert = vi.fn();
    shareOrDownloadFile.mockResolvedValueOnce('shared');
    expect(await shareReceiptWithAlert(receipt, { ...opts, triggerAlert })).toBe('shared');
    shareOrDownloadFile.mockResolvedValueOnce('cancelled');
    expect(await shareReceiptWithAlert(receipt, { ...opts, triggerAlert })).toBe('cancelled');
    expect(triggerAlert).not.toHaveBeenCalled();
  });
  it('terunduh: beri tahu; galat: pesan galat dan tidak melempar', async () => {
    const triggerAlert = vi.fn();
    shareOrDownloadFile.mockResolvedValueOnce('downloaded');
    expect(await shareReceiptWithAlert(receipt, { ...opts, triggerAlert })).toBe('downloaded');
    expect(triggerAlert).toHaveBeenCalledWith(expect.stringContaining('Gambar tersimpan di perangkat'));
    shareOrDownloadFile.mockRejectedValueOnce(new Error('boom'));
    expect(await shareReceiptWithAlert(receipt, { ...opts, triggerAlert })).toBe('error');
    expect(triggerAlert).toHaveBeenLastCalledWith('boom');
  });
});
