-- =====================================================================
-- Migrasi 021 — Stok Belanja (cek stok harian, pindahan dari web absensi).
-- Jalankan SEKALI di SQL Editor project C. Aman diulang. Butuh migrasi 020_absensi (tabel stock_checklists, app_settings).
--
-- 1. stock_categories / stock_items : master kategori + item (satuan, batas menipis, wajib/opsional).
-- 2. stock_days / stock_counts      : isian harian per tanggal bisnis (jumlah stok, dilewati, kategori selesai, disimpan oleh siapa).
-- 3. stock_latest (view)            : stok terakhir TERSIMPAN per item -> dasar status Habis / Menipis / Aman di tab Ringkasan.
-- 4. stok_gate_terbuka()            : dipanggil WEB ABSENSI untuk membuka/mengunci "Absen Pulang".
-- 5. stok_bypass_cek(kode)          : verifikasi kode bypass 6 digit (TOTP, ganti tiap 30 detik) milik owner.
--
-- DATA LAMA ikut dipindah (hanya kalau tabel baru masih kosong): master kategori/item dari app_settings('stockMaster')
-- (nama, satuan, wajib/opsional dipertahankan; batas menipis diisi 0, atur di Kelola) dan checklist lama yang sudah
-- DIBAGIKAN (locked) dari stock_checklists menjadi riwayat hari tersimpan, jadi tab Ringkasan langsung punya stok terakhir.
-- Tabel lama tidak diubah/dihapus. Kalau tidak ada master lama, dipakai daftar awal 51 item.
-- CEK setelah migrasi: item yang WAJIB menentukan gate Absen Pulang. Tanpa item wajib sama sekali, gate selalu terbuka.
--
-- Tanggal bisnis = tanggal WIB dikurangi 4 jam (hari baru mulai 04.00 WIB), supaya yang pulang lewat
-- tengah malam tidak tiba-tiba terkunci lagi. Rumus yang sama ada di src/features/stock/stockMath.js.
--
-- KODE BYPASS: rahasia dibuat SEKALI lalu dipasang di DUA tempat yang HARUS SAMA:
--   a) tabel stock_secret di database (tidak bisa dibaca anon), dan
--   b) VITE_STOCK_BYPASS_SECRET di .env.local / env Vercel project POS (owner melihat kodenya di layar Stok Belanja).
-- Buat rahasia (hex 40 karakter):   select encode(gen_random_bytes(20), 'hex');
-- Pasang di database:               insert into stock_secret (secret_hex) values ('<hex>')
--                                     on conflict (id) do update set secret_hex = excluded.secret_hex;
-- Web absensi TIDAK menyimpan rahasia; ia hanya bertanya ke stok_bypass_cek().
-- Ini pagar alur kerja (RLS tetap longgar seperti tabel lain), bukan keamanan data.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists stock_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 0,
  legacy_id  text,                                                 -- id kategori di stockMaster lama (hanya untuk impor)
  created_at timestamptz not null default now()
);

create table if not exists stock_items (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references stock_categories(id) on delete cascade,
  name        text not null,
  unit        text not null default 'pcs',
  min_qty     numeric not null default 0 check (min_qty >= 0),   -- stok <= angka ini = Menipis (0 = tidak pernah Menipis, hanya Habis)
  required    boolean not null default true,                      -- wajib diisi sebelum kategori bisa diselesaikan
  sort_order  integer not null default 0,
  legacy_id   text,                                               -- id item di stockMaster lama (hanya untuk impor)
  created_at  timestamptz not null default now()
);
create index if not exists idx_stock_items_category on stock_items (category_id);

create table if not exists stock_days (
  day             date primary key,                               -- tanggal bisnis (lihat stok_hari_bisnis)
  done_categories uuid[] not null default '{}',                   -- kategori yang sudah ditandai selesai hari itu
  saved_at        timestamptz,                                    -- terisi = hasil disimpan = gate Absen Pulang terbuka
  saved_by        text,
  created_at      timestamptz not null default now()
);

create table if not exists stock_counts (
  day        date    not null references stock_days(day) on delete cascade,
  item_id    uuid    not null references stock_items(id) on delete cascade,
  qty        numeric check (qty is null or qty >= 0),
  skipped    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (day, item_id)
);

create table if not exists stock_secret (
  id         boolean primary key default true check (id),         -- satu baris saja
  secret_hex text not null
);

create table if not exists stock_bypass_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null
);

alter table stock_categories enable row level security;
alter table stock_items      enable row level security;
alter table stock_days       enable row level security;
alter table stock_counts     enable row level security;
alter table stock_secret     enable row level security;   -- sengaja TANPA policy: anon/authenticated tidak bisa membaca
alter table stock_bypass_log enable row level security;   -- sengaja TANPA policy

drop policy if exists "anon_all_stock_categories" on stock_categories;
create policy "anon_all_stock_categories" on stock_categories for all to anon using (true) with check (true);
drop policy if exists "auth_all_stock_categories" on stock_categories;
create policy "auth_all_stock_categories" on stock_categories for all to authenticated using (true) with check (true);
drop policy if exists "anon_all_stock_items" on stock_items;
create policy "anon_all_stock_items" on stock_items for all to anon using (true) with check (true);
drop policy if exists "auth_all_stock_items" on stock_items;
create policy "auth_all_stock_items" on stock_items for all to authenticated using (true) with check (true);
drop policy if exists "anon_all_stock_days" on stock_days;
create policy "anon_all_stock_days" on stock_days for all to anon using (true) with check (true);
drop policy if exists "auth_all_stock_days" on stock_days;
create policy "auth_all_stock_days" on stock_days for all to authenticated using (true) with check (true);
drop policy if exists "anon_all_stock_counts" on stock_counts;
create policy "anon_all_stock_counts" on stock_counts for all to anon using (true) with check (true);
drop policy if exists "auth_all_stock_counts" on stock_counts;
create policy "auth_all_stock_counts" on stock_counts for all to authenticated using (true) with check (true);

-- Stok terakhir yang sudah DISIMPAN per item (hari tersimpan terbaru yang punya angka untuk item itu).
create or replace view stock_latest as
select distinct on (c.item_id)
       c.item_id, c.qty, c.day, d.saved_by, d.saved_at
  from stock_counts c
  join stock_days d on d.day = c.day
 where d.saved_at is not null and c.qty is not null and not c.skipped
 order by c.item_id, c.day desc;
grant select on stock_latest to anon;
grant select on stock_latest to authenticated;

create or replace function stok_hari_bisnis() returns date language sql stable as $$
  select ((now() at time zone 'Asia/Jakarta') - interval '4 hours')::date
$$;

-- Tandai / batalkan "selesai" satu kategori (atomik, aman kalau dua HP mengisi bersamaan).
create or replace function stok_selesai_kategori(p_day date, p_category uuid, p_done boolean) returns void language plpgsql as $$
begin
  insert into stock_days (day) values (p_day) on conflict (day) do nothing;
  update stock_days
     set done_categories = case when p_done
           then array_append(array_remove(done_categories, p_category), p_category)
           else array_remove(done_categories, p_category) end
   where day = p_day and saved_at is null;
end $$;

-- Simpan hasil hari itu. Server memeriksa ulang: semua kategori yang punya item wajib harus sudah selesai,
-- dan item wajib di dalamnya harus berisi angka (atau dilewati kalau opsional).
create or replace function stok_simpan(p_day date, p_by text) returns void language plpgsql as $$
declare
  v_row stock_days%rowtype;
  v_missing int;
begin
  select * into v_row from stock_days where day = p_day for update;
  if not found then raise exception 'Belum ada isian stok untuk tanggal ini'; end if;
  if v_row.saved_at is not null then return; end if;     -- sudah tersimpan: diam saja

  select count(*) into v_missing
    from stock_categories c
   where exists (select 1 from stock_items i where i.category_id = c.id and i.required)
     and not (c.id = any (v_row.done_categories));
  if v_missing > 0 then raise exception 'Masih ada % kategori yang belum selesai', v_missing; end if;

  select count(*) into v_missing
    from stock_items i
   where i.required
     and not exists (select 1 from stock_counts n where n.day = p_day and n.item_id = i.id and n.qty is not null);
  if v_missing > 0 then raise exception 'Masih ada % item wajib yang belum diisi', v_missing; end if;

  update stock_days set saved_at = now(), saved_by = nullif(trim(p_by), '') where day = p_day;
end $$;

-- Owner membuka kembali hasil yang sudah disimpan (salah isi). Gate Absen Pulang ikut terkunci lagi.
create or replace function stok_buka_kembali(p_day date) returns void language sql as $$
  update stock_days set saved_at = null, saved_by = null where day = p_day;
$$;

-- Dipanggil web absensi: true = Absen Pulang boleh dibuka.
create or replace function stok_gate_terbuka() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select saved_at is not null from stock_days where day = stok_hari_bisnis()), false)
      or not exists (select 1 from stock_items where required)
$$;

-- TOTP RFC 6238 (HMAC-SHA1, 6 digit, langkah 30 detik). Rumus yang sama: src/features/stock/stockBypass.js.
create or replace function stok_totp(p_secret_hex text, p_counter bigint) returns text language plpgsql immutable set search_path = public, extensions as $$
declare
  h bytea; o int; bin bigint;
begin
  h := hmac(decode(lpad(to_hex(p_counter), 16, '0'), 'hex'), decode(p_secret_hex, 'hex'), 'sha1');
  o := get_byte(h, 19) & 15;
  bin := ((get_byte(h, o) & 127)::bigint << 24) | (get_byte(h, o + 1)::bigint << 16) | (get_byte(h, o + 2)::bigint << 8) | get_byte(h, o + 3)::bigint;
  return lpad((bin % 1000000)::text, 6, '0');
end $$;

-- Dipanggil web absensi: true = kode benar (jendela sekarang atau 30 detik sebelumnya). Gagal >= 10x dalam 5 menit
-- (semua pemanggil digabung) = ditolak sementara, supaya kode 6 digit tidak bisa ditebak beruntun.
create or replace function stok_bypass_cek(p_kode text) returns boolean language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_secret text; v_counter bigint; v_ok boolean;
begin
  delete from stock_bypass_log where at < now() - interval '1 day';
  if (select count(*) from stock_bypass_log l where not l.ok and l.at > now() - interval '5 minutes') >= 10 then
    raise exception 'Terlalu banyak percobaan. Coba lagi beberapa menit.';
  end if;
  select secret_hex into v_secret from stock_secret limit 1;
  v_counter := floor(extract(epoch from now()) / 30);
  v_ok := v_secret is not null and p_kode ~ '^[0-9]{6}$' and p_kode in (stok_totp(v_secret, v_counter), stok_totp(v_secret, v_counter - 1));
  insert into stock_bypass_log (ok) values (coalesce(v_ok, false));
  return coalesce(v_ok, false);
end $$;

grant execute on function stok_hari_bisnis() to anon;
grant execute on function stok_hari_bisnis() to authenticated;
grant execute on function stok_selesai_kategori(date, uuid, boolean) to anon;
grant execute on function stok_selesai_kategori(date, uuid, boolean) to authenticated;
grant execute on function stok_simpan(date, text) to anon;
grant execute on function stok_simpan(date, text) to authenticated;
grant execute on function stok_buka_kembali(date) to anon;
grant execute on function stok_buka_kembali(date) to authenticated;
grant execute on function stok_gate_terbuka() to anon;
grant execute on function stok_gate_terbuka() to authenticated;
grant execute on function stok_bypass_cek(text) to anon;
grant execute on function stok_bypass_cek(text) to authenticated;

-- Data awal, urutan: (1) master lama dari app_settings('stockMaster'), (2) kalau tidak ada, daftar stok fisik outlet
-- (51 item, semua wajib, satuan pcs, batas 0). Keduanya hanya berjalan kalau belum ada kategori.
do $$
declare
  v_master jsonb; e jsonb; itm jsonb; c record;
  cat_id uuid; nm text; k int; ci int := 0;
begin
  if exists (select 1 from stock_categories) then return; end if;
  if to_regclass('public.app_settings') is not null then
    execute 'select value from app_settings where key = ''stockMaster''' into v_master;
  end if;

  if v_master is not null and jsonb_typeof(v_master->'categories') = 'array' and jsonb_array_length(v_master->'categories') > 0 then
    for e in select x from jsonb_array_elements(v_master->'categories') as x loop
      insert into stock_categories (name, sort_order, legacy_id)
      values (coalesce(nullif(trim(e->>'name'), ''), 'Tanpa nama'), ci, e->>'id')
      returning id into cat_id;
      ci := ci + 1; k := 0;
      for itm in select y from jsonb_array_elements(coalesce(e->'items', '[]'::jsonb)) as y loop
        insert into stock_items (category_id, name, unit, required, sort_order, legacy_id)
        values (cat_id, coalesce(nullif(trim(itm->>'name'), ''), 'Tanpa nama'), coalesce(nullif(trim(itm->>'unit'), ''), 'pcs'),
                coalesce(itm->>'required' = 'true', false), k, itm->>'id');
        k := k + 1;
      end loop;
    end loop;
    return;
  end if;

  for c in
    select * from (values
      (0, 'Bahan Minuman', array['Nutrisari Mango','Nutrisari Strawberry','White Coffee','Milo','Susu Kental Manis','UHT','Yakult','Oreo','Es Batu',
        'Sedotan Besar','Sedotan Kecil','Cup','Plastik Cup Single','Plastik Cup Double','Air Galon','Plastik 24','Plastik 28','Plastik Besar','Sendok',
        'Plastik Sendok','Plastik Saos','Sarung Tangan Plastik','Saos Sachet','Lakban Bening','Lakban Gofood','Lakban Grabfood','Lakban Shopeefood',
        'Stiker M','Stiker L','Stiker Wings','Gas','Sterofoam Seblak']),
      (1, 'Meja Besar', array['Ricebox L','Ricebox M','Lunchbox L','Lunchbox M','Kertas Nasi','Bon Nori','Bon Cabe','Wijen','Minyak','Garam','Tali Ripet','Plastik 17']),
      (2, 'Kulkas', array['Sambal Matah','Sambal Geprek','Aqua','Teh Pucuk','Firesauce','Brownbutter','Mentai'])
    ) as t(ord, name, items)
  loop
    insert into stock_categories (name, sort_order) values (c.name, c.ord) returning id into cat_id;
    k := 0;
    foreach nm in array c.items loop
      insert into stock_items (category_id, name, sort_order) values (cat_id, nm, k);
      k := k + 1;
    end loop;
  end loop;
end $$;

-- Riwayat dari checklist lama yang sudah DIBAGIKAN (locked): satu baris stock_days per tanggal + jumlah per item.
-- Hanya item yang punya legacy_id (hasil impor master lama) yang ikut; hanya kalau stock_days masih kosong.
do $$
declare
  r record; v_day date;
begin
  if to_regclass('public.stock_checklists') is null or exists (select 1 from stock_days) then return; end if;
  for r in execute 'select date_str, "values" as vals, category_done as done, submitted_by as by_name, coalesce(shared_at, submitted_at, updated_at) as at_time
                      from stock_checklists where locked order by date_str, coalesce(shared_at, submitted_at, updated_at)'
  loop
    if r.date_str !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then continue; end if;
    v_day := r.date_str::date;
    insert into stock_days (day, done_categories, saved_at, saved_by)
    values (
      v_day,
      coalesce((select array_agg(c.id) from stock_categories c
                 where c.legacy_id in (select d.key from jsonb_each(coalesce(r.done, '{}'::jsonb)) as d where d.value = 'true'::jsonb)), '{}'),
      r.at_time, nullif(trim(r.by_name), '')
    )
    on conflict (day) do nothing;
    insert into stock_counts (day, item_id, qty, skipped)
    select v_day, i.id,
           case when x.q ~ '^[0-9]+(\.[0-9]+)?$' then x.q::numeric end,
           coalesce(j.value->>'skipped' = 'true', false)
      from jsonb_each(coalesce(r.vals, '{}'::jsonb)) as j
      join stock_items i on i.legacy_id = j.key
      cross join lateral (select replace(trim(coalesce(j.value->>'qty', '')), ',', '.') as q) x
    on conflict (day, item_id) do nothing;
  end loop;
end $$;
