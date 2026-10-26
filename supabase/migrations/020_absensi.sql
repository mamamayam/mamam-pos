-- =====================================================================
-- Migrasi 020 — Absensi pindah ke project C (mamam-global dimatikan total).
-- Jalankan SEKALI di SQL Editor project C. Aman diulang.
--
-- Sebelumnya: web absensi (repo mamam-absensi) membaca daftar karyawan dari
-- app_config('employees') dan menulis log absen ke "attendanceLog" di project
-- lama (A / mamam-global); mamam-pos membaca log itu dari A. Karyawan harus
-- diurus di dua tempat.
--
-- Sesudahnya: semuanya di C.
--  1. attendance_log        : log absen (bentuk sama dengan "attendanceLog" di A:
--                             id + payload JSON), jadi mesin gaji tidak berubah.
--  2. absen_daftar_karyawan : daftar karyawan aktif untuk web absensi (HANYA id,
--                             nama, peran; tarif/alamat/telepon tidak ikut).
--  3. stock_checklists + 5 fungsi : checklist stok yang mengunci tombol Pulang
--                             di web absensi (dipindah apa adanya dari A).
--  4. app_settings key 'stockMaster' : master checklist (disalin skrip data).
--  5. bucket attendance-photos : foto selfie absen.
--  6. realtime untuk stock_checklists dan app_settings.
--
-- Urutan lengkap cutover: docs/migrasi-absensi.md
-- =====================================================================

-- 1. Log absen --------------------------------------------------------
create table if not exists attendance_log (
  id          text primary key,
  payload     jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists idx_attendance_log_datestr on attendance_log ((payload->>'dateStr'));
create index if not exists idx_attendance_log_employee on attendance_log ((payload->>'employeeId'));

create or replace function attendance_log_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_attendance_log_touch on attendance_log;
create trigger trg_attendance_log_touch before update on attendance_log
  for each row execute function attendance_log_touch();

alter table attendance_log enable row level security;
-- Web absensi karyawan tidak login (anon): boleh baca, tambah, dan ubah; TIDAK boleh hapus.
drop policy if exists "attendance_log_anon_select" on attendance_log;
create policy "attendance_log_anon_select" on attendance_log for select to anon using (true);
drop policy if exists "attendance_log_anon_insert" on attendance_log;
create policy "attendance_log_anon_insert" on attendance_log for insert to anon with check (true);
drop policy if exists "attendance_log_anon_update" on attendance_log;
create policy "attendance_log_anon_update" on attendance_log for update to anon using (true) with check (true);
-- mamam-pos setelah login Supabase (authenticated), sama longgarnya seperti tabel lain.
drop policy if exists "attendance_log_authenticated_all" on attendance_log;
create policy "attendance_log_authenticated_all" on attendance_log for all to authenticated using (true) with check (true);

-- 2. Daftar karyawan untuk web absensi ---------------------------------
-- security definer: web absensi tidak perlu (dan tidak boleh) membaca tabel employees penuh
-- (ada tarif upah, alamat, telepon). Hanya karyawan aktif/freelance yang bisa absen.
create or replace function absen_daftar_karyawan()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select e.id, trim(e.name) as name, e.role
  from employees e
  where e.is_active
    and e.status in ('aktif', 'freelance')
    and (e.resign_date is null or e.resign_date > current_date)
  order by trim(e.name);
$$;
revoke all on function absen_daftar_karyawan() from public;
grant execute on function absen_daftar_karyawan() to anon, authenticated;

-- 3. Stock checklist (dipindah apa adanya dari A) ------------------------
create table if not exists stock_checklists (
  key            text primary key,
  date_str       text not null,
  values         jsonb not null default '{}'::jsonb,
  category_done  jsonb not null default '{}'::jsonb,
  locked         boolean not null default false,
  submitted_at   timestamptz,
  submitted_by   text,
  shared_at      timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists idx_stock_checklists_date on stock_checklists (date_str);

alter table stock_checklists enable row level security;
drop policy if exists "stock_checklists_anon_select" on stock_checklists;
create policy "stock_checklists_anon_select" on stock_checklists for select to anon using (true);
drop policy if exists "stock_checklists_anon_insert" on stock_checklists;
create policy "stock_checklists_anon_insert" on stock_checklists for insert to anon with check (true);
drop policy if exists "stock_checklists_anon_update" on stock_checklists;
create policy "stock_checklists_anon_update" on stock_checklists for update to anon using (true) with check (true);
drop policy if exists "stock_checklists_authenticated_all" on stock_checklists;
create policy "stock_checklists_authenticated_all" on stock_checklists for all to authenticated using (true) with check (true);

create or replace function complete_stock_checklist_category(p_key text, p_date_str text, p_category_id text, p_values jsonb)
returns setof stock_checklists
language plpgsql as $$
begin
  -- Pastikan row ada dulu (kalau ini kategori pertama yang diisi hari ini).
  insert into stock_checklists (key, date_str, values, category_done, locked)
  values (p_key, p_date_str, '{}'::jsonb, '{}'::jsonb, false)
  on conflict (key) do nothing;

  -- Kalau sudah locked, jangan ubah apa-apa; cuma balikin state sekarang.
  return query
    update stock_checklists
    set
      values = values || p_values,
      category_done = jsonb_set(category_done, array[p_category_id], 'true'::jsonb, true),
      submitted_at = null,
      updated_at = now()
    where key = p_key
      and locked = false
    returning *;

  if not found then
    return query select * from stock_checklists where key = p_key;
  end if;
end;
$$;

create or replace function merge_stock_checklist_value(p_key text, p_date_str text, p_item_id text, p_qty text, p_skipped boolean)
returns setof stock_checklists
language plpgsql as $$
begin
  insert into stock_checklists (key, date_str, values, locked)
  values (p_key, p_date_str, '{}'::jsonb, false)
  on conflict (key) do nothing;

  return query
  update stock_checklists
  set
    values = jsonb_set(
      coalesce(values, '{}'::jsonb),
      array[p_item_id],
      jsonb_build_object('qty', p_qty, 'skipped', p_skipped),
      true
    ),
    submitted_at = null,
    updated_at = now()
  where key = p_key
    and locked = false
  returning *;
end;
$$;

create or replace function reopen_stock_checklist_category(p_key text, p_category_id text)
returns setof stock_checklists
language plpgsql as $$
begin
  return query
    update stock_checklists
    set
      category_done = jsonb_set(category_done, array[p_category_id], 'false'::jsonb, true),
      submitted_at = null,
      updated_at = now()
    where key = p_key
      and locked = false
    returning *;

  if not found then
    return query select * from stock_checklists where key = p_key;
  end if;
end;
$$;

create or replace function submit_stock_checklist(p_key text, p_submitted_by text)
returns setof stock_checklists
language plpgsql as $$
begin
  return query
    update stock_checklists
    set
      submitted_at = now(),
      submitted_by = p_submitted_by,
      updated_at = now()
    where key = p_key
      and locked = false
    returning *;

  if not found then
    return query select * from stock_checklists where key = p_key;
  end if;
end;
$$;

create or replace function share_stock_checklist(p_key text)
returns setof stock_checklists
language plpgsql as $$
begin
  return query
    update stock_checklists
    set
      locked = true,
      shared_at = now(),
      updated_at = now()
    where key = p_key
    returning *;

  if not found then
    return query select * from stock_checklists where key = p_key;
  end if;
end;
$$;

grant execute on function complete_stock_checklist_category(text, text, text, jsonb) to anon, authenticated;
grant execute on function merge_stock_checklist_value(text, text, text, text, boolean) to anon, authenticated;
grant execute on function reopen_stock_checklist_category(text, text) to anon, authenticated;
grant execute on function submit_stock_checklist(text, text) to anon, authenticated;
grant execute on function share_stock_checklist(text) to anon, authenticated;

-- 4. Master checklist memakai app_settings (key 'stockMaster'), tabel yang sudah ada di C.
--    Web absensi (anon) hanya boleh membaca dan menulis KEY ITU. Policy anon_all lama pada
--    app_settings (migrasi 008) sudah mengizinkan, jadi tidak ada policy baru di sini.

-- 5. Foto selfie absen -------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', true)
on conflict (id) do nothing;

drop policy if exists "attendance_photos_public_read" on storage.objects;
create policy "attendance_photos_public_read" on storage.objects for select to public
  using (bucket_id = 'attendance-photos');

drop policy if exists "attendance_photos_anon_upload" on storage.objects;
create policy "attendance_photos_anon_upload" on storage.objects for insert to anon
  with check (bucket_id = 'attendance-photos');

-- 6. Realtime (web absensi memantau checklist dan master stok) ---------
do $$
declare t text;
begin
  foreach t in array array['stock_checklists', 'app_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
