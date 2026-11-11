import { describe, it, expect } from 'vitest';
import { terapkanItems, buatDenganItems } from './useHpp';

/** Pencatat panggilan palsu untuk terapkanItems. */
function pencatat({ gagalPada = null } = {}) {
  const log = [];
  const catat = (nama) => async (...a) => {
    log.push([nama, ...a]);
    if (gagalPada === nama) throw new Error(`gagal ${nama}`);
  };
  return { log, op: { hapus: catat('hapus'), ubah: catat('ubah'), tambah: catat('tambah') } };
}

const lama = [
  { id: 'a', urutan: 1, qty: 10 },
  { id: 'b', urutan: 2, qty: 20 },
  { id: 'c', urutan: 3, qty: 30 },
];

describe('terapkanItems: samakan baris komposisi di database dengan draft form', () => {
  it('tidak ada perubahan = tidak ada panggilan', async () => {
    const { log, op } = pencatat();
    await terapkanItems(lama, lama.map((l) => ({ id: l.id, qty: l.qty })), op);
    expect(log).toEqual([]);
  });

  it('baris yang hilang dihapus, takaran yang berubah diubah, baris baru ditambah di urutan paling akhir', async () => {
    const { log, op } = pencatat();
    const baru = [
      { id: 'a', qty: 15 },                         // diubah
      { id: 'c', qty: 30 },                         // tetap
      { id: null, bahanId: 'X', qty: 5 },           // baru
      { id: null, bahanId: 'Y', qty: 7 },           // baru
    ];                                              // 'b' dihapus
    await terapkanItems(lama, baru, op);
    expect(log).toEqual([
      ['hapus', 'b'],
      ['ubah', 'a', 15],
      ['tambah', baru[2], 4],
      ['tambah', baru[3], 5],
    ]);
  });

  it('hapus dijalankan lebih dulu daripada tambah (aman terhadap batas unik)', async () => {
    const { log, op } = pencatat();
    await terapkanItems([{ id: 'a', urutan: 1, qty: 1 }], [{ id: null, bahanId: 'X', qty: 2 }], op);
    expect(log.map((l) => l[0])).toEqual(['hapus', 'tambah']);
  });

  it('draft kosong menghapus semua; lama kosong menambah mulai urutan 1', async () => {
    const semua = pencatat();
    await terapkanItems(lama, [], semua.op);
    expect(semua.log).toEqual([['hapus', 'a'], ['hapus', 'b'], ['hapus', 'c']]);
    const baru = pencatat();
    await terapkanItems([], [{ id: null, bahanId: 'X', qty: 1 }], baru.op);
    expect(baru.log[0][2]).toBe(1);
  });

  it('galat pertama dilempar dan langkah berikutnya tidak dijalankan', async () => {
    const { log, op } = pencatat({ gagalPada: 'hapus' });
    await expect(terapkanItems(lama, [{ id: 'a', qty: 99 }], op)).rejects.toThrow('gagal hapus');
    expect(log).toEqual([['hapus', 'b']]);
  });
});

describe('buatDenganItems: induk baru + isinya, dibatalkan kalau isinya gagal', () => {
  const pasang = ({ gagalItemKe = null, gagalBatal = false } = {}) => {
    const log = [];
    return {
      log,
      op: {
        buat: async () => { log.push(['buat']); return { id: 'baru' }; },
        tambahItem: async (induk, it, urutan) => {
          log.push(['item', induk.id, it.ref, urutan]);
          if (gagalItemKe === urutan) throw new Error(`gagal item ${urutan}`);
        },
        batalkan: async (induk) => { log.push(['batal', induk.id]); if (gagalBatal) throw new Error('gagal batal'); },
      },
    };
  };
  const items = [{ ref: 'A' }, { ref: 'B' }, { ref: 'C' }];

  it('induk dibuat dulu, lalu item berurutan 1, 2, 3; mengembalikan induk', async () => {
    const { log, op } = pasang();
    const induk = await buatDenganItems({ ...op, items });
    expect(induk).toEqual({ id: 'baru' });
    expect(log).toEqual([['buat'], ['item', 'baru', 'A', 1], ['item', 'baru', 'B', 2], ['item', 'baru', 'C', 3]]);
  });

  it('tanpa isi: hanya membuat induk (resep/menu boleh diisi nanti)', async () => {
    const { log, op } = pasang();
    await buatDenganItems({ ...op, items: [] });
    expect(log).toEqual([['buat']]);
  });

  it('induk gagal dibuat: galat dilempar dan tidak ada item/pembatalan', async () => {
    const { log, op } = pasang();
    await expect(buatDenganItems({ ...op, buat: async () => { throw new Error('gagal buat'); }, items })).rejects.toThrow('gagal buat');
    expect(log).toEqual([]);
  });

  it('item ke-2 gagal: induk dibatalkan, item ke-3 tidak dicoba, galat item yang dilempar', async () => {
    const { log, op } = pasang({ gagalItemKe: 2 });
    await expect(buatDenganItems({ ...op, items })).rejects.toThrow('gagal item 2');
    expect(log).toEqual([['buat'], ['item', 'baru', 'A', 1], ['item', 'baru', 'B', 2], ['batal', 'baru']]);
  });

  it('pembatalan ikut gagal: galat item asli tetap yang dilempar (bukan galat pembatalan)', async () => {
    const { op } = pasang({ gagalItemKe: 1, gagalBatal: true });
    await expect(buatDenganItems({ ...op, items })).rejects.toThrow('gagal item 1');
  });
});
