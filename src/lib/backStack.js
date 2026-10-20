/**
 * backStack — menyambungkan tombol Back browser/HP (dan geser-mundur di iPhone)
 * ke "lapisan" di dalam aplikasi, supaya Back MENUTUP lapisan teratas, bukan
 * langsung keluar dari aplikasi.
 *
 * Lapisan = apa pun yang bisa "ditutup" pengguna:
 *   - sub-layar / layar root selain Beranda (didaftarkan oleh App.jsx),
 *   - modal, laci keranjang, pembayaran, dsb. (didaftarkan lewat useBackLayer).
 * Urutan tutup: yang terakhir dibuka ditutup duluan (LIFO).
 *
 * Cara kerja: setiap lapisan punya SATU entri riwayat browser. Jumlah entri
 * (`depth`) selalu disamakan dengan jumlah lapisan:
 *   - lapisan bertambah  -> history.pushState
 *   - lapisan ditutup lewat tombol di layar (X, Batal, tap Beranda) -> history.go(-n)
 *     supaya tidak ada entri sisa yang membuat Back "tidak terjadi apa-apa"
 *   - pengguna menekan Back -> popstate -> lapisan teratas ditutup lewat close()
 *
 * KETUK DUA KALI UNTUK KELUAR (di Beranda tanpa lapisan terbuka):
 * di bawah entri dasar ada satu entri "jangkar". Back dari Beranda mendarat di jangkar:
 *   - Back pertama  -> aplikasi TIDAK keluar; `exitHint` menyala (UI menampilkan
 *     "Ketuk lagi untuk keluar") selama `exitWindowMs`.
 *   - Back kedua dalam jendela itu -> tidak ada entri lagi di belakang, jadi browser/HP
 *     menutup aplikasi seperti biasa (jangkar adalah entri pertama dokumen ini).
 *   - tidak ada Back kedua / pengguna menyentuh aplikasi lagi -> notif padam dan entri dasar
 *     dipulihkan lewat history.go(1) (bukan pushState, jadi riwayat tidak bertambah).
 * Jangkar baru dibuat pada sentuhan/ketikan pertama pengguna, bukan saat halaman dimuat:
 * Chrome melewati entri yang ditambahkan halaman tanpa interaksi pengguna, sehingga
 * jangkar yang dibuat diam-diam bisa dilompati dan notif tidak pernah muncul.
 *
 * history.go() bersifat ASINKRON. Supaya pushState tidak menabrak go() yang
 * belum selesai, semua perubahan diserialkan: selama menunggu popstate dari go()
 * buatan sendiri (`traversing`), perubahan berikutnya ditunda lalu disamakan lagi.
 * Perubahan dalam satu tarikan napas (tutup modal + buka layar) digabung lewat
 * microtask, jadi tidak menghasilkan go() + pushState yang sia-sia.
 *
 * LAPISAN YANG BOLEH MENOLAK (`register(close, { guard })`): form yang isiannya belum disimpan tidak boleh tertutup
 * begitu saja. Saat pengguna menekan Back dan `guard()` bernilai true, lapisan TIDAK dibuang: `close()` tetap dipanggil
 * (induk menampilkan konfirmasi) dan entri riwayat yang baru saja dilepas browser langsung didorong lagi, SINKRON di
 * handler popstate yang sama. Tidak boleh menunggu render React lalu mendaftar ulang: Back kedua yang datang cepat
 * (ketuk dua kali) akan mendarat di entri dasar/jangkar dan membuat aplikasi keluar.
 *
 * Modul ini tidak mengimpor React; `win` bisa diganti objek palsu untuk tes.
 */
const GESTURE_EVENTS = ['click', 'keydown'];   // peristiwa yang dihitung browser sebagai interaksi pengguna

export function createBackStack(win, { exitWindowMs = 2000 } = {}) {
  const layers = [];        // [{ id, close, guard }] urutan dibuka
  let nextId = 1;
  let depth = 0;            // entri riwayat yang sudah kita buat di atas entri dasar
  let traversing = false;   // menunggu popstate dari history.go() buatan sendiri
  let scheduled = false;
  let started = false;
  let hopTried = false;
  let guardTimer = null;

  // --- jangkar + ketuk dua kali untuk keluar ---
  let anchorOwned = false;    // ada entri jangkar tepat di bawah entri dasar
  let anchorPending = false;  // jangkar belum dibuat; menunggu interaksi pertama
  let atAnchor = false;       // sedang berdiri di entri jangkar (menunggu Back kedua)
  let exitArmed = false;      // notif "ketuk lagi untuk keluar" sedang tampil
  let exitTimer = null;
  const hintListeners = new Set();

  // Penanda unik muatan halaman ini. Entri riwayat dari muatan sebelumnya (mis. sebelum
  // refresh) membawa penanda lain, sehingga bisa dikenali sebagai entri BASI.
  const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const usable = Boolean(win && win.history && typeof win.addEventListener === 'function');

  function start() {
    if (started || !usable) return;
    const st = win.history.state;
    const base = st && typeof st === 'object' ? st : {};

    // Halaman di-REFRESH saat berada di entri dalam (mis. di Kasir): entri riwayat sisa
    // dari muatan sebelumnya masih ada di belakang. Kalau dibiarkan, Back pertama hanya
    // memuat ulang aplikasi di entri sisa itu. Lompat langsung ke entri dasar; aplikasi
    // dimuat ulang di sana dengan riwayat yang bersih (satu Back = keluar).
    if (!hopTried && navigationType() === 'reload' && typeof base.mdr === 'number' && base.mdr > 0 && base.sid !== sid) {
      if (hopToBase(base.mdr)) return;
    }

    started = true;
    if (base.anchor === true) {
      // Dimuat tepat di entri jangkar (mis. di-refresh saat notif keluar sedang tampil):
      // jangkar dipakai ulang dan entri dasar dibuat lagi di atasnya.
      try {
        win.history.replaceState({ anchor: true, sid }, '');
        win.history.pushState({ mdr: 0, sid, anchored: true }, '');
        anchorOwned = true;
      } catch { /* tanpa jangkar: Back keluar seperti biasa */ }
    } else {
      // Entri dasar = posisi saat aplikasi dimuat. Kalau halaman di-refresh saat
      // sedang di entri dalam, entri itu dijadikan dasar baru; entri-entri di
      // belakangnya tetap membawa penanda lama (basi) dan dilewati saat Back.
      try { win.history.replaceState({ ...base, mdr: 0, sid }, ''); } catch { /* abaikan */ }
      if (base.anchored === true) anchorOwned = true;   // refresh di entri dasar: jangkar masih di bawahnya
      else watchFirstGesture();
    }
    win.addEventListener('popstate', onPop);
  }

  /**
   * Lompat mundur ke entri dasar. Di Chrome lompatan ini TIDAK memuat dokumen baru: dokumen yang
   * sama menerima popstate di entri dasar, jadi permulaan dilanjutkan di sana (kalau tidak,
   * Back berikutnya mendarat di jangkar tanpa ada yang mendengarkan). Kalau popstate tak datang
   * (browser memuat dokumen baru, atau lompatan gagal), pewaktu melanjutkan agar tidak macet.
   */
  function hopToBase(steps) {
    hopTried = true;
    try { win.history.go(-steps); } catch { return false; }   // gagal: lanjut tanpa lompatan
    let resumed = false;
    let timer = null;
    const resume = () => {
      if (resumed) return;
      resumed = true;
      clearTimeout(timer);
      win.removeEventListener('popstate', resume);
      start();
    };
    timer = setTimeout(resume, 1500);
    win.addEventListener('popstate', resume);
    return true;
  }

  function navigationType() {
    try { return win.performance.getEntriesByType('navigation')[0].type; } catch { return undefined; }
  }

  function onGesture(e) {
    if (e && e.type === 'keydown' && e.key === 'Escape') return;   // Esc tidak dihitung sebagai interaksi
    ensureAnchor();
  }

  function watchFirstGesture() {
    anchorPending = true;
    for (const type of GESTURE_EVENTS) win.addEventListener(type, onGesture, true);
  }

  function stopWatchingGesture() {
    if (typeof win.removeEventListener !== 'function') return;
    for (const type of GESTURE_EVENTS) win.removeEventListener(type, onGesture, true);
  }

  /** Buat jangkar: entri sekarang jadi jangkar, entri dasar baru didorong di atasnya. */
  function ensureAnchor() {
    // Pengaman: tak terjangkau lewat API publik (jangkar selalu dibuat sebelum entri lapisan pertama
    // dan sebelum traversal apa pun), tetapi kalau posisi riwayat sedang tidak pasti, tunda saja.
    if (!anchorPending || !started || traversing || depth !== 0) return;   // coba lagi pada interaksi berikutnya
    anchorPending = false;
    stopWatchingGesture();
    try {
      win.history.replaceState({ anchor: true, sid }, '');
      win.history.pushState({ mdr: 0, sid, anchored: true }, '');
      anchorOwned = true;
    } catch {
      // Gagal (mis. batas Safari): kembalikan entri dasar supaya Back berperilaku biasa.
      try { win.history.replaceState({ mdr: 0, sid }, ''); } catch { /* abaikan */ }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(() => { scheduled = false; sync(); });
  }

  /** Mulai traversal buatan sendiri; semua perubahan riwayat lain menunggu popstate-nya. */
  function beginTraversal(delta, onTimeout) {
    traversing = true;
    clearTimeout(guardTimer);
    // Jaga-jaga kalau popstate tidak pernah datang: jangan macet selamanya.
    guardTimer = setTimeout(() => {
      if (!traversing) return;
      traversing = false;
      onTimeout();
      schedule();
    }, 1500);
    try { win.history.go(delta); } catch { /* guardTimer yang melepas */ }
  }

  /** Samakan jumlah entri riwayat dengan jumlah lapisan. */
  function sync() {
    if (!started || traversing) return;
    if (layers.length > depth) ensureAnchor();   // jangkar harus ada SEBELUM entri lapisan pertama
    while (depth < layers.length) {
      depth += 1;
      try {
        win.history.pushState({ mdr: depth, sid }, '');
      } catch {
        depth -= 1;   // mis. batas pushState Safari: lanjut tanpa entri (Back biasa)
        break;
      }
    }
    if (depth > layers.length) {
      const diff = depth - layers.length;
      beginTraversal(-diff, () => { depth = layers.length; });
    }
  }

  /**
   * Tutup lapisan dari atas sampai tersisa `n`. Dengan `respectGuard`, lapisan yang `guard()`-nya true menolak:
   * `close()`-nya dipanggil (untuk bertanya) tetapi lapisan tetap ada dan penutupan berhenti di situ.
   */
  function closeDownTo(n, respectGuard = false) {
    while (layers.length > n) {
      const top = layers[layers.length - 1];
      if (respectGuard && top.guard && top.guard()) {
        try { top.close(); } catch (err) { console.error('[backStack] close gagal:', err); }
        return;
      }
      layers.pop();
      try { top.close(); } catch (err) { console.error('[backStack] close gagal:', err); }
    }
  }

  // ---------- ketuk dua kali untuk keluar ----------
  function setArmed(value) {
    if (exitArmed === value) return;
    exitArmed = value;
    hintListeners.forEach((fn) => { try { fn(value); } catch (err) { console.error('[backStack] exitHint gagal:', err); } });
  }

  /** Pengguna menekan Back dari entri dasar dan mendarat di jangkar. */
  function onAnchor() {
    traversing = false;
    clearTimeout(guardTimer);
    depth = 0;
    if (layers.some((l) => l.guard && l.guard())) {
      // Ada form belum tersimpan yang menolak ditutup, tapi Back sudah mendarat di jangkar (mis. Back kedua datang
      // sebelum popstate pertama sampai karena HP sedang sibuk). Jangan keluar: dorong entri dasar lagi di atas
      // jangkar, tanya konfirmasi lewat lapisan itu, dan pulihkan entri lapisan yang tersisa.
      try {
        win.history.pushState({ mdr: 0, sid, anchored: true }, '');
      } catch { anchorOwned = false; }
      atAnchor = false;
      clearTimeout(exitTimer);
      setArmed(false);
      closeDownTo(0, true);
      sync();
      return;
    }
    closeDownTo(0);        // kalau pengguna melompat jauh di riwayat, semua lapisan ikut ditutup
    atAnchor = true;
    setArmed(true);
    clearTimeout(exitTimer);
    exitTimer = setTimeout(disarmExit, exitWindowMs);
  }

  /** Padamkan notif; kalau masih berdiri di jangkar, kembali ke entri dasar. */
  function disarmExit() {
    clearTimeout(exitTimer);
    setArmed(false);
    if (!atAnchor) return;
    atAnchor = false;
    // go(1) memakai entri dasar yang masih ada di depan; riwayat tidak bertambah.
    // Kalau popstate-nya tak datang kita masih di jangkar: entri dasar dibuat lagi di atasnya
    // (kalau itu pun gagal, jangkar dilepas dan Back kembali berperilaku biasa).
    beginTraversal(1, () => {
      try { win.history.pushState({ mdr: 0, sid, anchored: true }, ''); } catch { anchorOwned = false; }
    });
  }

  function onPop(e) {
    const st = e && e.state;

    // Mendarat di jangkar = Back dari Beranda.
    if (anchorOwned && st && st.anchor === true) { onAnchor(); return; }

    const mine = Boolean(st) && st.sid === sid && typeof st.mdr === 'number';

    // Hasil dari history.go() buatan sendiri.
    if (traversing) {
      traversing = false;
      clearTimeout(guardTimer);
      depth = mine ? st.mdr : 0;
      sync();
      return;
    }

    // Dari pengguna (Back / Forward / geser mundur).
    if (atAnchor) {            // mis. Forward dari jangkar ke entri dasar
      atAnchor = false;
      clearTimeout(exitTimer);
      setArmed(false);
    }
    if (!mine) {
      // Mendarat di entri basi (sisa muatan sebelumnya): tutup semua lapisan lalu
      // lanjutkan mundur, supaya satu kali Back tetap berarti "keluar dari aplikasi".
      depth = 0;
      closeDownTo(0);
      anchorOwned = false;   // sudah melewati jangkar kita: jangkar lama di belakang bukan lagi urusan kita
      try { win.history.back(); } catch { /* abaikan */ }
      return;
    }
    const target = st.mdr;
    depth = target;
    closeDownTo(target, true);
    // Kalau pengguna menekan Forward (target > jumlah lapisan), dikembalikan di sini.
    // Lapisan yang menolak ditutup (guard) masih ada, jadi entri riwayatnya didorong lagi di sini juga, tanpa jeda.
    sync();
  }

  /**
   * Daftarkan lapisan baru. `close` dipanggil saat pengguna menekan Back. Mengembalikan id.
   * `guard` (opsional): fungsi; selama mengembalikan true, Back TIDAK menutup lapisan ini, hanya memanggil `close()`
   * (dipakai form yang minta konfirmasi sebelum ditutup, lihat catatan di atas).
   */
  function register(close, { guard } = {}) {
    start();
    disarmExit();   // pengguna kembali memakai aplikasi: batalkan "ketuk lagi untuk keluar"
    const id = nextId++;
    layers.push({ id, close, guard });
    schedule();
    return id;
  }

  /** Lapisan sudah ditutup lewat cara lain (tombol di layar). Aman dipanggil berulang. */
  function unregister(id) {
    const i = layers.findIndex((l) => l.id === id);
    if (i === -1) return;
    layers.splice(i, 1);
    schedule();
  }

  const has = (id) => layers.some((l) => l.id === id);
  const snapshot = () => ({ layers: layers.length, depth, traversing, atAnchor, exitArmed });

  /** Berlangganan perubahan notif keluar (true = tampilkan). Mengembalikan fungsi berhenti. */
  function subscribeExitHint(fn) {
    hintListeners.add(fn);
    return () => hintListeners.delete(fn);
  }
  const getExitHint = () => exitArmed;

  return { init: start, register, unregister, has, snapshot, subscribeExitHint, getExitHint };
}

/** Instans tunggal untuk aplikasi (tidak melakukan apa-apa di luar browser). */
export const backStack = createBackStack(typeof window !== 'undefined' ? window : null);
