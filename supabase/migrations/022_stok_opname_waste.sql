-- 022: Stok Opname (hitungan penuh + harga modal), mode opname, dan Waste (Stok Belanja). Aman dijalankan berulang.
-- Jalankan SETELAH 021_stok_belanja.sql, di SQL Editor project yang sama (project C).
--
-- 1. stock_items.unit_cost      : harga modal per satuan (owner saja yang mengisi; null = belum ada harga).
-- 2. stock_counts.unit_cost     : salinan harga modal saat hitungan penuh disimpan (nilai bulan lama tidak ikut berubah kalau harga diganti).
--                                 Item yang belum punya harga saat disimpan dibiarkan null: nilainya mengikuti harga item SEKARANG (belum "dibekukan").
-- 3. stock_days.full_count      : true = SEMUA item punya angka waktu hari itu disimpan = "hitungan penuh" (dasar stok awal/akhir bulan).
--                                 Hitungan penuh PALING AKHIR dalam satu bulan = stok akhir bulan itu = stok awal bulan berikutnya.
-- 4. stock_settings.opname_aktif: mode stok opname. Aktif = SEMUA item wajib diisi (klien dan stok_simpan di server).
--                                 Menyalakannya membuka kembali hasil hari ini kalau belum hitungan penuh (Absen Pulang terkunci sampai dihitung ulang).
-- 5. waste_jenis / waste_penyaluran : pilihan di form Waste (diatur owner). waste_catatan: satu baris per catatan staf.
--
-- Harga waste per jenis disalin ke tiap catatan (rows jsonb), jadi mengubah harga tidak mengubah catatan lama.

alter table stock_items  add column if not exists unit_cost numeric check (unit_cost is null or unit_cost >= 0);
alter table stock_counts add column if not exists unit_cost numeric;
alter table stock_days   add column if not exists full_count boolean not null default false;

create table if not exists stock_settings (
  id            integer primary key default 1 check (id = 1),     -- satu baris saja
  opname_aktif  boolean not null default false,
  updated_at    timestamptz not null default now()
);
insert into stock_settings (id) values (1) on conflict (id) do nothing;

create table if not exists waste_jenis (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  price       numeric not null default 0 check (price >= 0),     -- nilai kerugian per porsi (rupiah)
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists waste_penyaluran (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists waste_catatan (
  id           uuid primary key default gen_random_uuid(),
  day          date not null,                                    -- tanggal bisnis (mulai 04.00 WIB, sama dengan stok)
  recorded_by  text not null,                                    -- nama karyawan pengisi
  penyaluran   text not null,                                    -- salinan nama penyaluran saat dicatat
  rows         jsonb not null,                                   -- [{ type, name, qty, price }]
  total_qty    numeric not null default 0,
  total_value  numeric not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_waste_catatan_day on waste_catatan (day);

alter table stock_settings   enable row level security;
alter table waste_jenis      enable row level security;
alter table waste_penyaluran enable row level security;
alter table waste_catatan    enable row level security;

drop policy if exists "anon_all_stock_settings" on stock_settings;
create policy "anon_all_stock_settings" on stock_settings for all to anon using (true) with check (true);
drop policy if exists "auth_all_stock_settings" on stock_settings;
create policy "auth_all_stock_settings" on stock_settings for all to authenticated using (true) with check (true);
drop policy if exists "anon_all_waste_jenis" on waste_jenis;
create policy "anon_all_waste_jenis" on waste_jenis for all to anon using (true) with check (true);
drop policy if exists "auth_all_waste_jenis" on waste_jenis;
create policy "auth_all_waste_jenis" on waste_jenis for all to authenticated using (true) with check (true);
drop policy if exists "anon_all_waste_penyaluran" on waste_penyaluran;
create policy "anon_all_waste_penyaluran" on waste_penyaluran for all to anon using (true) with check (true);
drop policy if exists "auth_all_waste_penyaluran" on waste_penyaluran;
create policy "auth_all_waste_penyaluran" on waste_penyaluran for all to authenticated using (true) with check (true);
drop policy if exists "anon_all_waste_catatan" on waste_catatan;
create policy "anon_all_waste_catatan" on waste_catatan for all to anon using (true) with check (true);
drop policy if exists "auth_all_waste_catatan" on waste_catatan;
create policy "auth_all_waste_catatan" on waste_catatan for all to authenticated using (true) with check (true);

-- Menyimpan hasil stok. BEDA dari 021: saat mode opname aktif SEMUA item wajib; dan hitungan penuh dicatat (full_count) beserta salinan harga modal.
create or replace function stok_simpan(p_day date, p_by text) returns void language plpgsql as $$
declare
  v_row stock_days%rowtype;
  v_missing int;
  v_opname boolean;
  v_full boolean;
begin
  select * into v_row from stock_days where day = p_day for update;
  if not found then raise exception 'Belum ada isian stok untuk tanggal ini'; end if;
  if v_row.saved_at is not null then return; end if;     -- sudah tersimpan: diam saja

  select coalesce((select opname_aktif from stock_settings where id = 1), false) into v_opname;

  select count(*) into v_missing
    from stock_categories c
   where exists (select 1 from stock_items i where i.category_id = c.id and (i.required or v_opname))
     and not (c.id = any (v_row.done_categories));
  if v_missing > 0 then raise exception 'Masih ada % kategori yang belum selesai', v_missing; end if;

  select count(*) into v_missing
    from stock_items i
   where (i.required or v_opname)
     and not exists (select 1 from stock_counts n where n.day = p_day and n.item_id = i.id and n.qty is not null);
  if v_missing > 0 then raise exception 'Masih ada % item wajib yang belum diisi', v_missing; end if;

  -- hitungan penuh = ada item, dan setiap item punya angka hari itu
  select exists (select 1 from stock_items)
     and not exists (select 1 from stock_items i
                      where not exists (select 1 from stock_counts n where n.day = p_day and n.item_id = i.id and n.qty is not null))
    into v_full;
  if v_full then
    update stock_counts n set unit_cost = i.unit_cost from stock_items i where n.day = p_day and n.item_id = i.id;
  end if;

  update stock_days set saved_at = now(), saved_by = nullif(trim(p_by), ''), full_count = v_full where day = p_day;
end $$;

-- Owner membuka kembali hasil yang sudah disimpan (salah isi). Gate Absen Pulang ikut terkunci lagi; hitungan penuh dihitung ulang saat disimpan lagi.
create or replace function stok_buka_kembali(p_day date) returns void language sql as $$
  update stock_days set saved_at = null, saved_by = null, full_count = false where day = p_day;
$$;

-- Menyalakan / mematikan mode stok opname. Menyalakan: hasil hari ini yang sudah disimpan tapi BUKAN hitungan penuh dibuka kembali.
create or replace function stok_opname_set(p_aktif boolean) returns void language plpgsql as $$
begin
  insert into stock_settings (id, opname_aktif, updated_at) values (1, coalesce(p_aktif, false), now())
  on conflict (id) do update set opname_aktif = excluded.opname_aktif, updated_at = now();
  if coalesce(p_aktif, false) then
    update stock_days set saved_at = null, saved_by = null
     where day = stok_hari_bisnis() and saved_at is not null and not full_count;
  end if;
end $$;

grant execute on function stok_simpan(date, text) to anon;
grant execute on function stok_simpan(date, text) to authenticated;
grant execute on function stok_buka_kembali(date) to anon;
grant execute on function stok_buka_kembali(date) to authenticated;
grant execute on function stok_opname_set(boolean) to anon;
grant execute on function stok_opname_set(boolean) to authenticated;

-- Data awal waste (hanya kalau masih kosong). Harga jenis ayam 0: owner mengisi di tab Waste > Pilihan waste.
insert into waste_jenis (name, price, sort_order)
select v.name, 0, v.ord from (values ('Dada', 0), ('Paha atas', 1), ('Paha bawah', 2), ('Sayap', 3)) as v(name, ord)
 where not exists (select 1 from waste_jenis);
insert into waste_penyaluran (name, sort_order)
select v.name, v.ord from (values ('Dimakan karyawan', 0), ('Disumbangkan', 1), ('Dibuang', 2)) as v(name, ord)
 where not exists (select 1 from waste_penyaluran);
