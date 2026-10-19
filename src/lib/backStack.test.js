import { describe, it, expect, vi } from 'vitest';
import { createBackStack } from './backStack.js';
import { buatBackStackHpp, setelahSinkron } from '../hpp/hppBackStack.js';

/**
 * Browser palsu yang meniru aturan riwayat sungguhan:
 *  - pushState membuang entri "maju" lalu menambah entri baru
 *  - go(n) ASINKRON; arah dihitung saat dijalankan; popstate dikirim sesudahnya
 *  - menuju entri "luar" (halaman sebelumnya) = keluar dari aplikasi, tanpa popstate
 *  - tap()/keydown disalurkan ke pendengar yang dipasang lewat addEventListener
 */
function fakeBrowser({ previousPage = true, staleEntries = [], navType } = {}) {
  const entries = [];
  if (previousPage) entries.push({ external: true, state: null });
  for (const st of staleEntries) entries.push({ state: st });
  entries.push({ state: null });                // entri aplikasi saat dimuat
  let index = entries.length - 1;
  let left = false;
  let dropGo = false;
  const listeners = [];                         // popstate
  const handlers = {};                          // jenis lain (click, keydown)
  const log = [];
  const fire = () => { log.push('pop'); [...listeners].forEach((fn) => fn({ state: entries[index].state })); };
  const win = {
    history: {
      get state() { return entries[index].state; },
      pushState(state) { entries.splice(index + 1); entries.push({ state }); index = entries.length - 1; log.push('push'); },
      replaceState(state) { entries[index].state = state; log.push('replace'); },
      go(n) {
        log.push(`go${n}`);
        if (dropGo) return;
        setTimeout(() => {
          const next = index + n;
          if (next < 0 || next >= entries.length) return;
          index = next;
          if (entries[index].external) { left = true; return; }
          fire();
        }, 0);
      },
      back() { win.history.go(-1); },
    },
    addEventListener(type, fn) {
      if (type === 'popstate') listeners.push(fn);
      else (handlers[type] = handlers[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'popstate') { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }
      else if (handlers[type]) handlers[type] = handlers[type].filter((f) => f !== fn);
    },
    ...(navType ? { performance: { getEntriesByType: () => [{ type: navType }] } } : {}),
  };
  return {
    win, log,
    get index() { return index; },
    get left() { return left; },
    get length() { return entries.length; },
    get listeners() { return listeners.length; },
    get gestureListeners() { return Object.values(handlers).reduce((n, a) => n + a.length, 0); },
    get state() { return entries[index].state; },
    set dropGo(v) { dropGo = v; },
    userBack: () => win.history.go(-1),         // tombol Back / geser mundur
    userForward: () => win.history.go(1),
    tap: (type = 'click', extra = {}) => [...(handlers[type] || [])].forEach((fn) => fn({ type, ...extra })),
  };
}


const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const WINDOW = 80;   // jendela "ketuk lagi untuk keluar" di tes (ms); produksi memakai 2000

function make(opts, stackOpts) {
  const b = fakeBrowser(opts);
  const bs = createBackStack(b.win, { exitWindowMs: WINDOW, ...stackOpts });
  return { b, bs };
}

/** Di Beranda tanpa lapisan: Back pertama menampilkan notif, Back kedua keluar dari aplikasi. */
async function doubleBackExits(b, bs) {
  b.userBack(); await tick();
  expect(b.left).toBe(false);
  expect(bs.snapshot().exitArmed).toBe(true);
  b.userBack(); await tick();
  expect(b.left).toBe(true);
}

describe('backStack — dasar', () => {
  it('sebelum pengguna menyentuh apa pun: belum ada jangkar; Back dari Beranda langsung keluar', async () => {
    const { b, bs } = make(); bs.init(); await tick();
    expect(b.log).toEqual(['replace']);                          // hanya menandai entri dasar
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0, exitArmed: false });
    b.userBack(); await tick();
    expect(b.left).toBe(true);
  });

  it('satu lapisan: dibuat 1 entri; Back menutup lapisan (close sekali) dan TIDAK keluar', async () => {
    const { b, bs } = make();
    let closed = 0; bs.register(() => { closed += 1; }); await tick();
    // tandai dasar, jangkar, entri dasar baru, entri lapisan; belum ada pop: tidak ada traversal
    expect(b.log).toEqual(['replace', 'replace', 'push', 'push']);
    expect(b.length).toBe(4);                                    // [halaman lain, jangkar, dasar, lapisan]
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1 });
    b.userBack(); await tick();
    expect(closed).toBe(1);
    expect(b.left).toBe(false);
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0, exitArmed: false });   // menutup lapisan bukan "mau keluar"
    await doubleBackExits(b, bs);                                // Back berikutnya: notif, lalu keluar
    expect(closed).toBe(1);
  });

  it('dua lapisan: yang terakhir dibuka ditutup duluan (LIFO)', async () => {
    const { b, bs } = make(); const order = [];
    bs.register(() => order.push('A')); bs.register(() => order.push('B')); await tick();
    expect(bs.snapshot()).toMatchObject({ layers: 2, depth: 2 });
    b.userBack(); await tick(); expect(order).toEqual(['B']);
    b.userBack(); await tick(); expect(order).toEqual(['B', 'A']);
    expect(b.left).toBe(false);
    await doubleBackExits(b, bs);
  });
});

describe('backStack — lapisan ditutup lewat tombol di layar', () => {
  it('unregister: entri riwayat ikut dibuang (go -1), close TIDAK dipanggil, Back berikutnya memunculkan notif keluar', async () => {
    const { b, bs } = make();
    let closed = 0; const id = bs.register(() => { closed += 1; }); await tick();
    bs.unregister(id); await tick();
    expect(b.log).toContain('go-1');
    expect(closed).toBe(0);
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0, traversing: false });
    await doubleBackExits(b, bs);                                // tidak ada "Back yang tidak terjadi apa-apa"
  });

  it('tutup lapisan lalu buka lapisan lain dalam satu tarikan napas: tidak ada go()/push sia-sia', async () => {
    const { b, bs } = make();
    const a = bs.register(() => {}); await tick();
    const before = b.log.length;
    bs.unregister(a); bs.register(() => {}); await tick();
    expect(b.log.length).toBe(before);                           // tidak ada operasi riwayat baru
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1 });
  });

  it('menutup lapisan yang BUKAN teratas: jumlah entri tetap cocok, Back menutup yang tersisa', async () => {
    const { b, bs } = make(); const order = [];
    const a = bs.register(() => order.push('A')); bs.register(() => order.push('B')); await tick();
    bs.unregister(a); await tick();
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1 });
    b.userBack(); await tick();
    expect(order).toEqual(['B']);
    expect(b.left).toBe(false);
  });

  it('close() yang memanggil unregister sendiri (seperti modal sungguhan) tidak menggandakan go()', async () => {
    const { b, bs } = make();
    let id; id = bs.register(() => { bs.unregister(id); }); await tick();
    const gosBefore = b.log.filter((l) => l.startsWith('go')).length;
    b.userBack(); await tick();
    expect(b.log.filter((l) => l.startsWith('go')).length).toBe(gosBefore + 1);   // hanya go dari pengguna
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0 });
    expect(b.left).toBe(false);
  });
});

describe('backStack — lapisan yang menolak ditutup (form belum disimpan, lihat useBackLayer `rearm`)', () => {
  /** Meniru useBackLayer({ rearm: true }): close() menampilkan konfirmasi lalu mendaftarkan lapisan lagi. */
  function guardedLayer(bs, { onAsk, onDiscard }) {
    let alive = true;
    const attach = () => bs.register(() => {
      if (!alive) return;
      onAsk();
      queueMicrotask(() => { if (alive) attach(); });   // effect React yang memasang ulang lapisan
    });
    attach();
    return { discard: () => { alive = false; onDiscard(); } };
  }

  it('Back pertama hanya memunculkan konfirmasi (form tetap terbuka); Back berikutnya muncul lagi, TIDAK keluar aplikasi', async () => {
    const { b, bs } = make(); let asked = 0;
    guardedLayer(bs, { onAsk: () => { asked += 1; }, onDiscard: () => {} }); await tick();
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1 });
    b.userBack(); await tick();
    expect(asked).toBe(1);
    expect(b.left).toBe(false);
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1, exitArmed: false });   // lapisan terpasang lagi, riwayat tidak bocor
    b.userBack(); await tick();
    expect(asked).toBe(2);
    expect(b.left).toBe(false);
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1 });
  });

  it('konfirmasi di atas form: Back menutup konfirmasi dulu (Lanjut Isi), form tetap ada; riwayat tetap sinkron', async () => {
    const { b, bs } = make(); const log = [];
    // form (menolak ditutup) + konfirmasi yang muncul sesudahnya (lapisan di atasnya)
    let confirmClosed = false;
    const form = guardedLayer(bs, {
      onAsk: () => { log.push('ask'); },
      onDiscard: () => {},
    }); await tick();
    // tombol X di layar memunculkan konfirmasi: lapisan konfirmasi ditambah di atas form
    const confirmId = bs.register(() => { confirmClosed = true; log.push('keep'); }); await tick();
    expect(bs.snapshot()).toMatchObject({ layers: 2, depth: 2 });
    b.userBack(); await tick();
    expect(confirmClosed).toBe(true);                           // konfirmasi tertutup = Lanjut Isi
    expect(log).toEqual(['keep']);                              // form TIDAK bertanya lagi
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1 });
    expect(bs.has(confirmId)).toBe(false);
    expect(b.left).toBe(false);
    form.discard();
  });

  it('Buang: lapisan dilepas, riwayat dirapikan, Back berikutnya memunculkan notif keluar seperti biasa', async () => {
    const { b, bs } = make(); let asked = 0;
    const form = guardedLayer(bs, { onAsk: () => { asked += 1; }, onDiscard: () => {} }); await tick();
    b.userBack(); await tick();                                 // konfirmasi tampil, lapisan terpasang ulang
    expect(asked).toBe(1);
    expect(bs.snapshot().layers).toBe(1);
    form.discard();                                             // "Buang": induk menutup form
    b.userBack(); await tick();                                 // close() tidak lagi bertanya karena form sudah ditutup
    expect(asked).toBe(1);
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0 });
    await doubleBackExits(b, bs);
  });
});

describe('backStack — urutan operasi asinkron', () => {
  it('lapisan baru yang datang saat go() masih berjalan ditunda, lalu didorong sesudah popstate', async () => {
    const { b, bs } = make(); const order = [];
    const a = bs.register(() => {}); await tick();
    bs.unregister(a);
    await Promise.resolve(); await Promise.resolve();            // sync() jalan: go(-1) dikirim, menunggu popstate
    expect(bs.snapshot().traversing).toBe(true);
    // Dua lapisan baru datang di tengah go(): jumlah lapisan (2) > entri yang ada (1),
    // jadi tanpa serialisasi sync() akan langsung pushState menabrak go() yang belum selesai.
    bs.register(() => order.push('B')); bs.register(() => order.push('C'));
    await tick();
    // Urutan operasi riwayat harus: ... go-1, pop, push, push  (push TIDAK boleh menyelip sebelum pop dari go)
    const iGo = b.log.lastIndexOf('go-1');
    const iPopAfterGo = b.log.indexOf('pop', iGo);
    const iPushAfterGo = b.log.indexOf('push', iGo);
    expect(iPopAfterGo).toBeGreaterThan(iGo);
    expect(iPushAfterGo).toBeGreaterThan(iPopAfterGo);           // push SESUDAH go selesai, bukan menabraknya
    expect(bs.snapshot()).toMatchObject({ layers: 2, depth: 2, traversing: false });
    b.userBack(); await tick(); b.userBack(); await tick();
    expect(order).toEqual(['C', 'B']);                           // tetap rapi: C lalu B, tidak keluar
    expect(b.left).toBe(false);
    await doubleBackExits(b, bs);
  });

  it('pengguna menekan Forward setelah Back: tidak membuka ulang apa pun, dikembalikan ke posisi semula', async () => {
    const { b, bs } = make();
    let closed = 0; bs.register(() => { closed += 1; }); await tick();
    b.userBack(); await tick();
    expect(closed).toBe(1);
    const idxBase = b.index;
    b.userForward(); await tick(40);
    expect(closed).toBe(1);
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0, traversing: false });
    expect(b.index).toBe(idxBase);                               // kembali di entri dasar
  });
});

describe('backStack — ketuk dua kali untuk keluar', () => {
  /** Aplikasi sudah dimulai dan pengguna sudah menyentuh layar (jangkar sudah ada). */
  async function started(opts, stackOpts) {
    const t = make(opts, stackOpts);
    t.bs.init(); t.b.tap('click'); await tick();
    return t;
  }

  it('sentuhan pertama membuat jangkar (jangkar + entri dasar baru), hanya sekali', async () => {
    const { b, bs } = make(); bs.init(); b.log.length = 0;
    expect(b.gestureListeners).toBe(2);                          // click + keydown
    b.tap('click');
    expect(b.log).toEqual(['replace', 'push']);
    expect(b.length).toBe(3);                                    // [halaman lain, jangkar, dasar]
    expect(b.state).toMatchObject({ mdr: 0, anchored: true });
    b.tap('click'); b.tap('keydown', { key: 'a' });
    expect(b.log).toEqual(['replace', 'push']);                  // tidak membuat jangkar kedua
    expect(b.gestureListeners).toBe(0);                          // pendengar sentuhan dilepas
  });

  it('tombol Esc tidak dihitung sebagai interaksi; tombol lain dihitung', async () => {
    const { b, bs } = make(); bs.init(); b.log.length = 0;
    b.tap('keydown', { key: 'Escape' });
    expect(b.log).toEqual([]);
    b.tap('keydown', { key: 'a' });
    expect(b.log).toEqual(['replace', 'push']);
  });

  it('Back pertama dari Beranda: TIDAK keluar, notif menyala', async () => {
    const { b, bs } = await started();
    const hints = []; bs.subscribeExitHint((v) => hints.push(v));
    expect(bs.getExitHint()).toBe(false);
    b.userBack(); await tick();
    expect(b.left).toBe(false);
    expect(hints).toEqual([true]);
    expect(bs.getExitHint()).toBe(true);
    expect(bs.snapshot()).toMatchObject({ atAnchor: true, exitArmed: true, layers: 0, depth: 0 });
  });

  it('Back kedua dalam jendela waktu: keluar dari aplikasi', async () => {
    const { b, bs } = await started();
    await doubleBackExits(b, bs);
  });

  it('tidak ada Back kedua: notif padam sendiri, entri dasar dipulihkan tanpa menambah riwayat, lalu bisa diulang', async () => {
    const { b, bs } = await started();
    const baseIndex = b.index; const len = b.length;
    const hints = []; bs.subscribeExitHint((v) => hints.push(v));
    b.userBack(); await tick();
    expect(hints).toEqual([true]);
    await tick(WINDOW + 60);
    expect(hints).toEqual([true, false]);                        // notif hilang sendiri
    expect(b.index).toBe(baseIndex);                             // kembali di entri dasar
    expect(b.length).toBe(len);                                  // riwayat tidak bertambah
    expect(b.log.filter((l) => l === 'push').length).toBe(1);    // hanya push saat jangkar dibuat
    expect(bs.snapshot()).toMatchObject({ atAnchor: false, traversing: false, depth: 0, exitArmed: false });
    // Back berikutnya kembali memunculkan notif (dijaga lagi), baru Back kedua keluar
    b.userBack(); await tick();
    expect(hints).toEqual([true, false, true]);
    expect(b.left).toBe(false);
    b.userBack(); await tick();
    expect(b.left).toBe(true);
  });

  it('siklus notif diulang berkali-kali: riwayat tidak pernah tumbuh', async () => {
    const { b, bs } = await started();
    const baseIndex = b.index; const len = b.length;
    for (let i = 0; i < 4; i += 1) {
      b.userBack(); await tick();
      expect(bs.snapshot().exitArmed).toBe(true);
      await tick(WINDOW + 60);
      expect(bs.snapshot()).toMatchObject({ exitArmed: false, atAnchor: false, traversing: false });
      expect(b.index).toBe(baseIndex);
      expect(b.length).toBe(len);
    }
    expect(b.left).toBe(false);
  });

  it('pengguna membuka layar/modal saat notif tampil: notif padam, dasar dipulihkan, lapisan didorong di atasnya', async () => {
    const { b, bs } = await started();
    const hints = []; bs.subscribeExitHint((v) => hints.push(v));
    b.userBack(); await tick();
    expect(hints).toEqual([true]);
    let closed = 0; bs.register(() => { closed += 1; }); await tick(30);
    expect(hints).toEqual([true, false]);
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1, atAnchor: false, traversing: false });
    expect(b.length).toBe(4);                                    // [halaman lain, jangkar, dasar, lapisan]
    expect(b.index).toBe(3);
    await tick(WINDOW + 60);
    expect(hints).toEqual([true, false]);                        // pewaktu lama tidak menyala lagi
    b.userBack(); await tick();
    expect(closed).toBe(1);                                      // Back menutup lapisan
    expect(b.left).toBe(false);
    expect(hints).toEqual([true, false]);                        // bukan "mau keluar"
    b.userBack(); await tick();
    expect(hints).toEqual([true, false, true]);                  // sekarang baru di Beranda: notif lagi
  });

  it('lapisan terbuka: Back menutup lapisan dulu, notif keluar TIDAK muncul', async () => {
    const { b, bs } = await started();
    const hints = []; bs.subscribeExitHint((v) => hints.push(v));   // sebelum register: panggilan liar ikut tercatat
    let closed = 0; bs.register(() => { closed += 1; }); await tick();
    b.userBack(); await tick();
    expect(closed).toBe(1);
    expect(hints).toEqual([]);
    expect(b.left).toBe(false);
  });

  it('Forward dari jangkar oleh pengguna: notif padam dan kembali di entri dasar', async () => {
    const { b, bs } = await started();
    const baseIndex = b.index;
    const hints = []; bs.subscribeExitHint((v) => hints.push(v));
    b.userBack(); await tick();
    b.userForward(); await tick();
    expect(hints).toEqual([true, false]);
    expect(b.index).toBe(baseIndex);
    expect(bs.snapshot()).toMatchObject({ atAnchor: false, exitArmed: false, depth: 0 });
    await tick(WINDOW + 60);
    expect(b.index).toBe(baseIndex);                             // pewaktu tidak melakukan go(1) lagi
  });

  it('popstate dari go(1) tak pernah datang: tidak macet; entri dasar dibuat lagi dan Back tetap benar', async () => {
    const { b, bs } = await started();
    b.userBack(); await tick();
    b.dropGo = true;                                             // go(1) menghilang
    await tick(WINDOW + 40);
    expect(bs.snapshot().traversing).toBe(true);
    await tick(1600);                                            // pelindung 1,5 detik melepas
    expect(bs.snapshot()).toMatchObject({ traversing: false, atAnchor: false, depth: 0 });
    expect(b.state).toMatchObject({ mdr: 0, anchored: true });   // berdiri di entri dasar baru di atas jangkar
    b.dropGo = false;
    // lapisan yang dibuka sesudahnya ditutup Back dengan benar (tidak ikut keluar dari aplikasi)
    let closed = 0; bs.register(() => { closed += 1; }); await tick();
    b.userBack(); await tick();
    expect(closed).toBe(1);
    expect(b.left).toBe(false);
    await doubleBackExits(b, bs);                                // lalu Beranda tetap dijaga notif
  });

  it('pengguna melompat jauh ke jangkar saat lapisan terbuka: semua lapisan ditutup, notif menyala, hitungan entri bersih', async () => {
    const { b, bs } = await started();
    const closed = []; bs.register(() => closed.push('A')); bs.register(() => closed.push('B')); await tick();
    expect(b.length).toBe(5);                                    // [halaman lain, jangkar, dasar, A, B]
    b.win.history.go(-3); await tick();                          // lompat dari B langsung ke jangkar
    expect(closed).toEqual(['B', 'A']);
    expect(bs.getExitHint()).toBe(true);
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0, atAnchor: true });
    await tick(WINDOW + 60);                                     // notif padam, kembali ke dasar
    expect(b.index).toBe(2);
    let again = 0; bs.register(() => { again += 1; }); await tick();
    expect(b.index).toBe(3);                                     // lapisan baru tepat di atas dasar
    b.userBack(); await tick();
    expect(again).toBe(1);
    expect(b.left).toBe(false);
  });

  it('jendela bawaan 2 detik', async () => {
    vi.useFakeTimers();
    try {
      const b = fakeBrowser();
      const bs = createBackStack(b.win);                         // tanpa opsi: pakai bawaan
      bs.init(); b.tap('click');
      b.userBack(); await vi.advanceTimersByTimeAsync(1);
      expect(bs.getExitHint()).toBe(true);
      await vi.advanceTimersByTimeAsync(1950);
      expect(bs.getExitHint()).toBe(true);
      await vi.advanceTimersByTimeAsync(100);
      expect(bs.getExitHint()).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('berhenti berlangganan: pendengar tidak dipanggil lagi; pendengar yang melempar error tidak merusak', async () => {
    const { b, bs } = await started();
    const seen = []; const off = bs.subscribeExitHint((v) => seen.push(v));
    bs.subscribeExitHint(() => { throw new Error('boom'); });
    const spy = console.error; console.error = () => {};
    try {
      b.userBack(); await tick();
      expect(seen).toEqual([true]);
      off();
      await tick(WINDOW + 60);
      expect(seen).toEqual([true]);                              // sesudah off(): tidak ada panggilan baru
      expect(bs.getExitHint()).toBe(false);                      // namun pendengar rusak tak menghentikan pemulihan
    } finally { console.error = spy; }
  });

  it('pushState gagal saat membuat jangkar: entri dikembalikan, tanpa notif, Back keluar seperti biasa', async () => {
    const { b, bs } = make(); bs.init();
    b.win.history.pushState = () => { throw new Error('SecurityError'); };
    expect(() => b.tap('click')).not.toThrow();
    expect(b.state).toMatchObject({ mdr: 0 });
    expect(b.state.anchor).toBeUndefined();
    b.userBack(); await tick();
    expect(b.left).toBe(true);
    expect(bs.getExitHint()).toBe(false);
  });

  it('refresh di entri dasar yang punya jangkar: jangkar lama (penanda basi) tetap dikenali', async () => {
    const b = fakeBrowser({ navType: 'reload', staleEntries: [{ anchor: true, sid: 'lama' }] });
    b.win.history.replaceState({ mdr: 0, sid: 'lama', anchored: true });
    const bs = createBackStack(b.win, { exitWindowMs: WINDOW });
    bs.init(); await tick();
    expect(b.gestureListeners).toBe(0);                          // tidak membuat jangkar kedua
    b.userBack(); await tick();
    expect(b.left).toBe(false);
    expect(bs.getExitHint()).toBe(true);
    b.userBack(); await tick();
    expect(b.left).toBe(true);
  });

  it('dimuat tepat di entri jangkar: jangkar dipakai ulang, entri dasar baru dibuat di atasnya', async () => {
    const b = fakeBrowser();
    b.win.history.replaceState({ anchor: true, sid: 'lama' }); b.log.length = 0;
    const bs = createBackStack(b.win, { exitWindowMs: WINDOW });
    bs.init(); await tick();
    expect(b.log).toEqual(['replace', 'push']);
    expect(b.length).toBe(3);
    expect(b.state).toMatchObject({ mdr: 0, anchored: true });
    expect(b.gestureListeners).toBe(0);
    await doubleBackExits(b, bs);
  });

  it('jangkar dari muatan halaman sebelumnya TIDAK dianggap jangkar kita sendiri (tanpa penanda anchored)', async () => {
    // [halaman lain, jangkar lama, dasar lama, entri aplikasi]; halaman dibuka lewat navigasi baru
    const b = fakeBrowser({ staleEntries: [{ anchor: true, sid: 'lama' }, { mdr: 0, sid: 'lama', anchored: true }] });
    const bs = createBackStack(b.win, { exitWindowMs: WINDOW });
    bs.init(); b.tap('click'); await tick();                     // jangkar baru dibuat
    await doubleBackExits(b, bs);                                // keluar lewat jangkar baru
    // Setelah keluar dari jangkar kita, entri-entri lama di belakangnya hanya ditelusuri mundur biasa.
    expect(b.index).toBeLessThan(b.length);
  });
});

describe('backStack — refresh dan entri basi', () => {
  it('halaman di-refresh saat di entri dalam: Back tetap berujung keluar dari aplikasi', async () => {
    // riwayat sebelum refresh: [halaman lain, dasar(0), dalam(1), dalam(2)]; refresh terjadi di entri terakhir
    const b = fakeBrowser({ staleEntries: [{ mdr: 0, sid: 'lama' }, { mdr: 1, sid: 'lama' }] });
    b.win.history.replaceState({ mdr: 2, sid: 'lama' });         // entri aplikasi saat dimuat membawa state lama
    const bs = createBackStack(b.win, { exitWindowMs: WINDOW });
    bs.register(() => {}); await tick();                         // aplikasi mulai: entri dijadikan dasar baru
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1 });
    bs.unregister(1); await tick();                              // layar kembali ke Beranda
    b.userBack(); await tick();                                  // Beranda: notif keluar
    expect(b.left).toBe(false);
    expect(bs.getExitHint()).toBe(true);
    b.userBack(); await tick(80);                                // Back kedua melewati semua entri basi, keluar
    expect(b.left).toBe(true);
  });

  it('lapisan terbuka lalu Back menembus ke entri basi: lapisan ikut ditutup, lalu keluar', async () => {
    const { b, bs } = make({ staleEntries: [{ mdr: 0, sid: 'lama' }] });
    let closed = 0;
    bs.register(() => { closed += 1; }); await tick();
    b.userBack(); await tick();                                  // menutup lapisan (entri dasar baru)
    expect(closed).toBe(1); expect(b.left).toBe(false);
    b.userBack(); await tick();                                  // Beranda: notif keluar
    expect(b.left).toBe(false);
    b.userBack(); await tick(80);                                // entri basi → dilewati → keluar
    expect(b.left).toBe(true);
  });

  it('lingkungan tanpa window/history (mis. server): tidak error dan tidak melakukan apa-apa', async () => {
    const bs = createBackStack(null);
    const id = bs.register(() => {}); bs.unregister(id); await tick();
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0 });
  });
});

describe('backStack — refresh di entri dalam (lompat ke entri dasar)', () => {
  const lama = { mdr: 2, sid: 'lama' };
  // riwayat sebelum refresh: [halaman lain, jangkar, dasar(0), dalam(1), dalam(2)]
  const stale = [{ anchor: true, sid: 'lama' }, { mdr: 0, sid: 'lama', anchored: true }, { mdr: 1, sid: 'lama' }];

  it('di-refresh saat di entri dalam: langsung go(-mdr) ke entri dasar, belum mulai (tidak replace, tanpa pendengar Back)', async () => {
    const b = fakeBrowser({ navType: 'reload', staleEntries: stale });
    b.win.history.replaceState(lama); b.log.length = 0;
    const bs = createBackStack(b.win);
    bs.init();
    expect(b.log).toEqual(['go-2']);
    expect(b.listeners).toBe(1);                                  // hanya pendengar "lanjutkan setelah lompatan"
    expect(b.gestureListeners).toBe(0);
  });

  it('lompatan selesai di dokumen yang sama (perilaku Chrome): permulaan dilanjutkan; Back pertama notif, kedua keluar', async () => {
    const b = fakeBrowser({ navType: 'reload', staleEntries: stale });
    b.win.history.replaceState(lama);
    const bs = createBackStack(b.win, { exitWindowMs: WINDOW });
    bs.init(); await tick();                                      // go(-2) selesai -> popstate -> dilanjutkan
    expect(b.index).toBe(2);                                      // berhenti di entri dasar (basi)
    expect(b.listeners).toBe(1);                                  // pendengar sementara diganti pendengar Back biasa
    expect(b.gestureListeners).toBe(0);                           // jangkar lama dipakai, tidak membuat jangkar kedua
    expect(b.state).toMatchObject({ mdr: 0, anchored: true });
    expect(b.state.sid).not.toBe('lama');                         // entri dasar kini milik muatan ini
    await doubleBackExits(b, bs);
  });

  it('popstate lompatan tak pernah datang: pewaktu 1,5 detik tetap melanjutkan permulaan', async () => {
    const b = fakeBrowser({ navType: 'reload', staleEntries: stale });
    b.win.history.replaceState(lama); b.log.length = 0;
    b.dropGo = true;
    const bs = createBackStack(b.win, { exitWindowMs: WINDOW });
    bs.init(); await tick(80);
    expect(b.listeners).toBe(1);
    expect(b.log).toEqual(['go-2']);                              // belum mulai: tidak ada replace
    await tick(1600);
    expect(b.listeners).toBe(1);                                  // sekarang pendengar Back biasa
    expect(b.log).toContain('replace');                           // entri dijadikan dasar baru
    expect(bs.snapshot()).toMatchObject({ layers: 0, depth: 0 });
  });

  it('dokumen baru dimuat di entri dasar yang punya jangkar (back_forward): Back pertama notif, kedua keluar', async () => {
    const b = fakeBrowser({ navType: 'back_forward', staleEntries: [{ anchor: true, sid: 'lama' }] });
    b.win.history.replaceState({ mdr: 0, sid: 'lama', anchored: true });
    const bs = createBackStack(b.win, { exitWindowMs: WINDOW });
    bs.init();
    expect(b.listeners).toBe(1);
    expect(b.state).toMatchObject({ mdr: 0 });
    await doubleBackExits(b, bs);
  });

  it('jenis navigasi bukan reload (buka lewat link / back_forward): TIDAK lompat, entri jadi dasar baru', async () => {
    for (const type of ['navigate', 'back_forward', 'prerender']) {
      const b = fakeBrowser({ navType: type });
      b.win.history.replaceState(lama); b.log.length = 0;
      const bs = createBackStack(b.win); bs.init();
      expect(b.log).toEqual(['replace']);
      expect(b.state).toMatchObject({ mdr: 0 });
      expect(b.listeners).toBe(1);
    }
  });

  it('di-refresh di entri dasar (mdr 0 / tanpa state): tidak lompat', async () => {
    for (const st of [null, { mdr: 0, sid: 'lama' }]) {
      const b = fakeBrowser({ navType: 'reload' });
      b.win.history.replaceState(st); b.log.length = 0;
      createBackStack(b.win).init();
      expect(b.log).toEqual(['replace']);
    }
  });

  it('browser tanpa Performance API: tidak error, jalan seperti biasa tanpa lompat', async () => {
    const b = fakeBrowser();                                      // tanpa performance sama sekali
    b.win.history.replaceState(lama); b.log.length = 0;
    expect(() => createBackStack(b.win).init()).not.toThrow();
    expect(b.log).toEqual(['replace']);
  });

  it('history.go melempar error saat lompat: lanjut mulai normal, tidak macet', async () => {
    const b = fakeBrowser({ navType: 'reload' });
    b.win.history.replaceState(lama);
    b.win.history.go = () => { throw new Error('SecurityError'); };
    const bs = createBackStack(b.win);
    expect(() => bs.init()).not.toThrow();
    expect(b.listeners).toBe(1);
    bs.register(() => {}); await tick();
    expect(bs.snapshot()).toMatchObject({ layers: 1, depth: 1 });
  });

  it('lompat hanya dicoba SEKALI per muatan halaman (init lalu register tidak melompat dua kali)', async () => {
    const b = fakeBrowser({ navType: 'reload', staleEntries: stale });
    b.win.history.replaceState(lama); b.log.length = 0;
    const bs = createBackStack(b.win);
    bs.init(); bs.register(() => {});
    expect(b.log.filter((l) => l === 'go-2').length).toBe(1);
  });
});

describe('backStack — kegagalan yang tidak boleh menjatuhkan aplikasi', () => {
  it('pushState melempar error (batas Safari): tidak macet, tidak error, Back berperilaku biasa', async () => {
    const b = fakeBrowser(); const orig = b.win.history.pushState; let n = 0;
    b.win.history.pushState = () => { n += 1; throw new Error('SecurityError'); };
    const bs = createBackStack(b.win);
    bs.register(() => {}); await tick();
    expect(n).toBeGreaterThan(0);
    expect(bs.snapshot().depth).toBe(0);                         // tidak mengaku punya entri yang tidak ada
    b.win.history.pushState = orig;
  });

  it('close() yang melempar error tidak menghentikan penutupan lapisan lain', async () => {
    const { b, bs } = make(); const order = [];
    bs.register(() => order.push('A'));
    bs.register(() => { order.push('B'); throw new Error('boom'); }); await tick();
    const spy = console.error; console.error = () => {};
    try { b.userBack(); await tick(); b.userBack(); await tick(); } finally { console.error = spy; }
    expect(order).toEqual(['B', 'A']);
  });
});

describe('stack navigasi HPP — tab dan popup (buatBackStackHpp)', () => {
  const siap = () => { const b = fakeBrowser(); const bs = buatBackStackHpp(b.win); return { b, bs }; };

  it('Back berurutan: popup ditutup dulu, lalu tab Harga bahan kembali ke Menu, lalu notif, lalu keluar ke POS', async () => {
    const { b, bs } = siap(); const urutan = [];
    bs.register(() => urutan.push('tab'));      // tab Harga bahan dibuka
    await tick();
    bs.register(() => urutan.push('popup'));    // popup dibuka di atasnya
    await tick();
    expect(b.length).toBe(5);                   // [POS, jangkar, dasar, tab, popup]
    b.userBack(); await tick();
    expect(urutan).toEqual(['popup']);
    b.userBack(); await tick();
    expect(urutan).toEqual(['popup', 'tab']);
    expect(b.left).toBe(false);
    expect(bs.snapshot().exitArmed).toBe(false);
    b.userBack(); await tick();                 // dari Menu: notif "Ketuk lagi untuk keluar", BELUM keluar
    expect(b.left).toBe(false);
    expect(bs.snapshot().exitArmed).toBe(true);
    b.userBack(); await tick();                 // Back kedua: meninggalkan HPP (kembali ke POS)
    expect(b.left).toBe(true);
  });

  it('di Menu tanpa lapisan: Back pertama menyalakan notif (useExitHint), tanpa Back kedua notif padam sendiri', async () => {
    const b = fakeBrowser(); const bs = buatBackStackHpp(b.win, { exitWindowMs: WINDOW });
    const nilai = []; bs.subscribeExitHint((v) => nilai.push(v));
    bs.init(); b.tap('click'); await tick();    // sentuhan pertama membuat jangkar
    b.userBack(); await tick();
    expect(b.left).toBe(false);
    expect(bs.getExitHint()).toBe(true);
    await tick(WINDOW + 40);
    expect(bs.getExitHint()).toBe(false);
    expect(nilai).toEqual([true, false]);
  });

  it('popup ditutup lewat X / tarik ke bawah (unregister): entri ikut dibuang, Back berikutnya menutup tab', async () => {
    const { b, bs } = siap(); let tabDitutup = 0;
    bs.register(() => { tabDitutup += 1; }); await tick();
    const popup = bs.register(() => {}); await tick();
    bs.unregister(popup); await tick();
    expect(b.index).toBe(3);                    // mundur satu entri: berdiri di entri tab (entri popup tinggal "maju" yang akan dibuang)
    b.userBack(); await tick();
    expect(tabDitutup).toBe(1);
  });

  it('pindah tab lewat tombol (Harga bahan -> Menu -> Harga bahan berkali-kali): riwayat tidak menumpuk', async () => {
    const { b, bs } = siap();
    for (let i = 0; i < 4; i += 1) {
      const id = bs.register(() => {}); await tick();
      bs.unregister(id); await tick();
    }
    expect(b.index).toBe(2);                    // kembali di entri dasar (di atas jangkar)
    b.userBack(); await tick();
    expect(bs.snapshot().exitArmed).toBe(true); // satu Back = notif, bukan tumpukan entri sisa
  });

  it('alamat tab dipertahankan: state entri (mdr, sid) tidak hilang saat URL diganti dengan replaceState', async () => {
    const { b, bs } = siap();
    bs.register(() => {}); await tick();
    const state = b.state;
    b.win.history.replaceState(b.win.history.state, '/hpp/bahan');   // seperti efek URL di HppApp
    expect(b.state).toBe(state);
    expect(state).toMatchObject({ mdr: 1 });
  });

  it('setelahSinkron: fn jalan SESUDAH entri lapisan didorong (alamat tab menempel di entri lapisan, bukan entri Menu)', async () => {
    const { b, bs } = siap(); let saat = null;
    bs.register(() => {});
    setelahSinkron(() => { saat = b.index; }, bs);
    await tick();
    expect(saat).toBe(3);                       // [POS, jangkar, dasar, lapisan]: sudah di entri lapisan
  });

  it('setelahSinkron: lapisan baru dibuang -> menunggu go(-1) selesai, baru jalan (di entri dasar)', async () => {
    const { b, bs } = siap(); let saat = null;
    const id = bs.register(() => {}); await tick();
    bs.unregister(id);
    setelahSinkron(() => { saat = b.index; }, bs);
    await tick(80);
    expect(saat).toBe(2);                       // sudah kembali di entri dasar
  });
});
