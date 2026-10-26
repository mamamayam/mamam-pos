-- =====================================================================
-- Mamam POS (repo mamam-pos) — Supabase schema, gelombang 1
--
-- Cara pakai: Supabase Dashboard -> SQL Editor -> New query -> paste
-- seluruh file ini -> Run. Aman dijalankan ulang (IF NOT EXISTS).
--
-- Prinsip:
--  * Nama kolom SAMA dengan mamam-kasir (Flutter) supaya migrasi C -> B
--    tinggal mapping tipe data, bukan ganti struktur.
--    Tipe dinaikkan ke Postgres: TEXT id -> uuid, TEXT tanggal ->
--    timestamptz, INTEGER 0/1 -> boolean, TEXT json -> jsonb.
--  * HARD DELETE. Tidak ada deleted_at / recycle bin.
--  * Uang = integer rupiah (bukan desimal), sama dengan B.
--  * Snapshot: transactions/transaction_items menyimpan angka final
--    saat checkout, tidak dihitung ulang dari harga menu sekarang.
--  * Tabel BARU (belum ada di B): shifts. employees mengikuti model HRD A/B
--    (upah per jam). Absensi: tabel attendance_log (ditulis web mamam-absensi, migrasi 020).
--  * expenses meniru cash_expenses B TANPA ledger cash_movements.
-- =====================================================================

-- ---------------------------------------------------------------------
-- MENU
-- ---------------------------------------------------------------------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists menu_items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references categories(id),
  name         text not null,
  price        integer not null,
  hpp          integer,              -- diisi manual oleh admin
  unit         text not null default 'porsi',
  sort_order   integer not null default 0,   -- urutan dalam kategori (drag-urutkan)
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Kategori varian (mis. "Level Pedas", "Topping"). Di B belum ada; di A
-- disimpan sebagai daftar berurutan. Dibuat sebagai tabel supaya urutannya
-- bisa di-drag dan renaming satu tempat.
create table if not exists variant_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists variant_groups (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references variant_categories(id) on delete set null,
  name           text not null,
  sort_order     integer not null default 0,
  is_required    boolean not null default false,
  max_selection  integer not null default 1,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists variant_options (
  id                uuid primary key default gen_random_uuid(),
  variant_group_id  uuid not null references variant_groups(id) on delete cascade,
  name              text not null,
  extra_price       integer not null default 0,
  sort_order        integer not null default 0
);

-- Satu menu bisa terhubung ke banyak grup varian ("Koneksi Varian")
create table if not exists menu_item_variant_groups (
  menu_item_id      uuid not null references menu_items(id) on delete cascade,
  variant_group_id  uuid not null references variant_groups(id) on delete cascade,
  primary key (menu_item_id, variant_group_id)
);

-- ---------------------------------------------------------------------
-- PELANGGAN & VOUCHER
-- (tanpa poin — poin hidup di project mamam-global, integrasi menyusul)
-- ---------------------------------------------------------------------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists vouchers (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  discount_type   text not null check (discount_type in ('percent','fixed')),
  discount_value  integer not null,
  min_purchase    integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- TRANSAKSI (POS)
-- ---------------------------------------------------------------------
create table if not exists transactions (
  id                      uuid primary key default gen_random_uuid(),
  display_number          text not null,
  status                  text not null check (status in ('open','paid','canceled')),
  order_type              text not null check (order_type in ('Takeaway','Dine-in','Delivery','Ojol')),
  customer_id             uuid references customers(id) on delete set null,
  customer_name           text,      -- snapshot nama saat transaksi
  ojol_platform           text,
  ojol_order_number       text,
  subtotal                integer not null,
  voucher_id              uuid references vouchers(id) on delete set null,
  voucher_code            text,
  voucher_discount        integer not null default 0,
  manual_discount_type    text check (manual_discount_type in ('percent','fixed')),
  manual_discount_value   integer,
  manual_discount_amount  integer not null default 0,
  tax_amount              integer not null default 0,
  service_amount          integer not null default 0,
  delivery_fee            integer not null default 0,
  rounding_adjustment     integer not null default 0,
  total                   integer not null,
  payment_method          text check (payment_method in ('Tunai','QRIS','Transfer','Ojol','Split Payment')),
  amount_paid             integer,
  change_amount           integer,
  split_payments_json     jsonb,     -- hanya kalau payment_method = 'Split Payment'
  cash_holder_employee_id uuid,      -- kurir yang memegang uang tunai (COD), kalau ada
  cash_holder_name        text,      -- snapshot nama kurir
  created_at              timestamptz not null default now(),
  paid_at                 timestamptz,
  canceled_at             timestamptz,
  cancel_reason           text
);

create table if not exists transaction_items (
  id                     uuid primary key default gen_random_uuid(),
  transaction_id         uuid not null references transactions(id) on delete cascade,
  menu_item_id           uuid not null,   -- sengaja TANPA FK: histori tetap utuh walau menu dihapus
  name                   text not null,   -- snapshot
  variant_name           text,
  variant_selected_json  jsonb,
  price                  integer not null,
  hpp                    integer not null default 0,  -- snapshot, dipakai Laba Rugi
  qty                    integer not null,
  note                   text
);

create index if not exists idx_transactions_created_at on transactions (created_at desc);
create index if not exists idx_transactions_status     on transactions (status);
create index if not exists idx_transaction_items_tx    on transaction_items (transaction_id);

-- ---------------------------------------------------------------------
-- PENGELUARAN / PEMASUKAN LAIN
-- Meniru cash_expenses B, tanpa ledger cash_movements / cash_locations.
-- ---------------------------------------------------------------------
create table if not exists expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

insert into expense_categories (name, sort_order)
values ('Belanja', 0), ('Operasional', 1), ('Gaji', 2), ('Lainnya', 3)
on conflict (name) do nothing;

create table if not exists expenses (
  id                      uuid primary key default gen_random_uuid(),
  direction               text not null default 'pengeluaran'
                            check (direction in ('pemasukan','pengeluaran')),
  category                text not null,
  amount                  integer not null,
  transaction_date        date not null default current_date,
  store_or_supplier_name  text,
  detail                  text,
  payment_method          text not null default 'Tunai',
  cash_holder_employee_id uuid,      -- kurir yang membayar pakai uang tunainya, kalau ada
  cash_holder_name        text,
  created_at              timestamptz not null default now(),
  created_by              text
);

create index if not exists idx_expenses_date on expenses (transaction_date desc);

-- ---------------------------------------------------------------------
-- SHIFT (sederhana, angka polos) — TABEL BARU, belum ada di B
-- ---------------------------------------------------------------------
create table if not exists shifts (
  id               uuid primary key default gen_random_uuid(),
  opening_balance  integer not null default 0,
  closing_balance  integer,
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  note             text,
  code                    text,     -- mis. DOMPET-3F2A9C1B
  opened_by_employee_id   uuid,
  opened_by_employee_name text,
  expected_cash           integer,  -- saldo seharusnya saat ditutup
  difference              integer,  -- aktual - seharusnya
  stats_json              jsonb,    -- rincian dibekukan saat tutup
  courier_snapshot_json   jsonb     -- uang yang masih di kurir saat tutup (snapshot)
);

-- Hanya boleh ada SATU shift terbuka pada satu waktu. Ini penjaga di level
-- database supaya dua HP yang sama-sama "buka shift" tidak menghasilkan dua
-- shift aktif (akar masalah race condition di app lama).
create unique index if not exists uq_one_open_shift
  on shifts ((closed_at is null)) where closed_at is null;

create index if not exists idx_shifts_opened_at on shifts (opened_at desc);

-- ---------------------------------------------------------------------
-- HR: KARYAWAN & ABSENSI — TABEL BARU, belum ada di B
-- ---------------------------------------------------------------------
create table if not exists employees (
  id                       uuid primary key default gen_random_uuid(),
  external_id              text,                    -- id lama (EMP-xxxx) dari mamam-global / sistem absensi
  name                     text not null,
  phone                    text,
  address                  text,
  role                     text not null default 'kasir',   -- 'kasir' | 'kurir'
  status                   text not null default 'aktif'
                             check (status in ('aktif','freelance','cuti','resign')),
  wage_per_hour            integer not null default 0,
  bonus_full_time          integer not null default 0,
  overtime_rate_per_30_min integer not null default 5000,
  start_date               date,
  resign_date              date,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Satu id lama hanya boleh dipakai satu karyawan (mencegah impor ganda).
create unique index if not exists uq_employees_external_id on employees (external_id);

-- Referensi ke karyawan dipasang di sini (bukan di tabelnya masing-masing)
-- karena tabel employees baru dibuat SETELAH transactions/expenses/shifts.
-- ON DELETE SET NULL: menghapus karyawan tidak merusak histori; namanya
-- tetap ada lewat kolom salinan nama. Nama constraint sama dengan yang
-- dibuat migrasi 002, supaya instalasi baru == hasil upgrade.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_cash_holder_employee_id_fkey') then
    alter table transactions add constraint transactions_cash_holder_employee_id_fkey
      foreign key (cash_holder_employee_id) references employees(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_cash_holder_employee_id_fkey') then
    alter table expenses add constraint expenses_cash_holder_employee_id_fkey
      foreign key (cash_holder_employee_id) references employees(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shifts_opened_by_employee_id_fkey') then
    alter table shifts add constraint shifts_opened_by_employee_id_fkey
      foreign key (opened_by_employee_id) references employees(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- DATA GAJI (tambahan, potongan, saldo awal) — model HRD mamam-kasir.
-- employee_id ON DELETE RESTRICT: karyawan dengan data gaji tidak bisa dihapus.
-- Absensi TIDAK disimpan di sini (tabel attendance_log, migrasi 020).
-- ---------------------------------------------------------------------
create table if not exists payroll_additions (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete restrict,
  label        text not null,
  amount       integer not null check (amount > 0),
  date         date not null,
  category     text not null default 'Tambahan',
  source       text not null default 'owner' check (source in ('owner','staff')),
  approved_by  text,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- migrasi 009: persetujuan Tambahan (staf mengajukan, owner memutuskan; gaji hanya menghitung 'disetujui')
  status        text not null default 'disetujui' check (status in ('menunggu','disetujui','ditolak')),
  requested_by  text,
  reject_reason text
);
create index if not exists idx_payroll_additions_emp_date on payroll_additions (employee_id, date);
create index if not exists idx_payroll_additions_pending on payroll_additions (created_at) where status = 'menunggu';

create table if not exists payroll_deductions (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete restrict,
  label        text not null,
  amount       integer not null check (amount > 0),
  date         date not null,
  category     text not null default 'Potongan',
  created_at   timestamptz not null default now()
);
create index if not exists idx_payroll_deductions_emp_date on payroll_deductions (employee_id, date);

-- Migrasi 009: pengeluaran karyawan + tautan potongan <-> pengeluaran + catat_potongan()
alter table expenses add column if not exists employee_id uuid references employees(id) on delete set null;
alter table expenses add column if not exists employee_name text;
create index if not exists idx_expenses_employee on expenses (employee_id) where employee_id is not null;
alter table payroll_deductions add column if not exists expense_id uuid references expenses(id) on delete cascade;
create index if not exists idx_payroll_deductions_expense on payroll_deductions (expense_id) where expense_id is not null;

create or replace function catat_potongan(
  p_employee_id uuid, p_label text, p_amount integer, p_date date, p_category text, p_payment_method text
) returns uuid language plpgsql as $$
declare
  v_name text; v_cat text; v_label text; v_pay text; v_expense uuid; v_deduction uuid;
begin
  select name into v_name from employees where id = p_employee_id;
  if v_name is null then raise exception 'Karyawan tidak ditemukan'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  v_cat := nullif(trim(p_category), '');
  if v_cat is null then raise exception 'Kategori wajib diisi'; end if;
  v_label := coalesce(nullif(trim(p_label), ''), v_cat);
  v_pay := case when p_payment_method = 'Non-Tunai' then 'Non-Tunai' else 'Tunai' end;

  insert into expenses (direction, category, amount, transaction_date, store_or_supplier_name, detail, payment_method, employee_id, employee_name)
  values ('pengeluaran', v_cat, p_amount, p_date, v_name, v_label, v_pay, p_employee_id, v_name)
  returning id into v_expense;

  insert into payroll_deductions (employee_id, label, amount, date, category, expense_id)
  values (p_employee_id, v_label, p_amount, p_date, v_cat, v_expense)
  returning id into v_deduction;

  return v_deduction;
end $$;
grant execute on function catat_potongan(uuid, text, integer, date, text, text) to anon;
grant execute on function catat_potongan(uuid, text, integer, date, text, text) to authenticated;

-- Migrasi 010: ubah_potongan() — ubah potongan + pengeluaran karyawannya dalam satu transaksi
create or replace function ubah_potongan(
  p_deduction_id uuid, p_label text, p_amount integer, p_date date, p_category text, p_payment_method text
) returns uuid language plpgsql as $$
declare
  v_cat text; v_label text; v_pay text; v_expense uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  v_cat := nullif(trim(p_category), '');
  if v_cat is null then raise exception 'Kategori wajib diisi'; end if;
  v_label := coalesce(nullif(trim(p_label), ''), v_cat);
  v_pay := case when p_payment_method = 'Non-Tunai' then 'Non-Tunai' else 'Tunai' end;

  select expense_id into v_expense from payroll_deductions where id = p_deduction_id for update;
  if not found then raise exception 'Potongan tidak ditemukan (mungkin sudah dihapus)'; end if;

  update payroll_deductions
     set label = v_label, amount = p_amount, date = p_date, category = v_cat
   where id = p_deduction_id;

  if v_expense is not null then
    update expenses
       set category = v_cat, amount = p_amount, transaction_date = p_date,
           detail = v_label, payment_method = v_pay
     where id = v_expense;
  end if;

  return p_deduction_id;
end $$;
grant execute on function ubah_potongan(uuid, text, integer, date, text, text) to anon;
grant execute on function ubah_potongan(uuid, text, integer, date, text, text) to authenticated;

-- Saldo awal bulan: positif = karyawan berutang ke toko; negatif = toko berutang.
create table if not exists payroll_opening_balances (
  employee_id  uuid not null references employees(id) on delete restrict,
  month        text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount       integer not null default 0,
  primary key (employee_id, month)
);


-- ---------------------------------------------------------------------
-- TUTUP PERIODE GAJI (angka gaji dibekukan) — lihat supabase/migrations/006.
-- ---------------------------------------------------------------------
create table if not exists payroll_closings (
  id            uuid primary key default gen_random_uuid(),
  period_type   text not null check (period_type in ('minggu','bulan')),
  period_start  date not null,
  period_end    date not null,
  note          text,
  closed_at     timestamptz not null default now(),
  check (period_end >= period_start),
  unique (period_start, period_end)
);

create table if not exists payroll_closing_lines (
  id                    uuid primary key default gen_random_uuid(),
  closing_id            uuid not null references payroll_closings(id) on delete cascade,
  employee_id           uuid references employees(id) on delete set null,   -- nama tetap ada di employee_name
  employee_name         text not null,
  employee_external_id  text,
  role                  text,
  net_pay               integer not null,
  gross_cost            integer not null,       -- upah kotor untuk Laba Rugi (tanpa kasbon)
  kasbon_total          integer not null default 0,
  rates_json            jsonb not null,         -- tarif saat ditutup: upah/jam, bonus FT, lembur/30 mnt
  payroll_json          jsonb not null          -- hasil hitung lengkap (rincian harian, tambahan, potongan)
);
create index if not exists idx_closing_lines_closing on payroll_closing_lines (closing_id);

create or replace function close_payroll_period(
  p_type text, p_start date, p_end date, p_today date, p_note text, p_lines jsonb
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  if p_type not in ('minggu','bulan') then raise exception 'Jenis periode tidak valid'; end if;
  if p_end < p_start then raise exception 'Periode tidak valid'; end if;
  if p_end >= p_today then raise exception 'Periode belum selesai, belum bisa ditutup'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Tidak ada data gaji untuk ditutup';
  end if;

  insert into payroll_closings (period_type, period_start, period_end, note)
  values (p_type, p_start, p_end, nullif(trim(p_note), ''))
  returning id into v_id;

  insert into payroll_closing_lines
    (closing_id, employee_id, employee_name, employee_external_id, role, net_pay, gross_cost, kasbon_total, rates_json, payroll_json)
  select v_id, nullif(l->>'employee_id','')::uuid, l->>'employee_name', nullif(l->>'employee_external_id',''), l->>'role',
         (l->>'net_pay')::integer, (l->>'gross_cost')::integer, coalesce((l->>'kasbon_total')::integer, 0),
         l->'rates_json', l->'payroll_json'
  from jsonb_array_elements(p_lines) l;

  return v_id;
end $$;

-- Tambahan/potongan di periode tertutup tidak boleh berubah.
create or replace function block_closed_payroll_change() returns trigger language plpgsql as $$
declare d date;
begin
  foreach d in array array[
    case when tg_op in ('UPDATE','DELETE') then old.date end,
    case when tg_op in ('INSERT','UPDATE') then new.date end
  ] loop
    if d is not null and exists (select 1 from payroll_closings c where d between c.period_start and c.period_end) then
      raise exception 'Periode gaji ini sudah ditutup, jadi tambahan/potongan tidak bisa diubah. Buka kembali periodenya dulu kalau perlu koreksi.';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Saldo awal bulan yang sudah ditutup (penutupan jenis 'bulan') tidak boleh berubah.
create or replace function block_closed_opening_balance_change() returns trigger language plpgsql as $$
declare m text;
begin
  foreach m in array array[
    case when tg_op in ('UPDATE','DELETE') then old.month end,
    case when tg_op in ('INSERT','UPDATE') then new.month end
  ] loop
    if m is not null and exists (select 1 from payroll_closings c where c.period_type = 'bulan' and to_char(c.period_start, 'YYYY-MM') = m) then
      raise exception 'Bulan gaji ini sudah ditutup, jadi saldo awal tidak bisa diubah. Buka kembali periodenya dulu kalau perlu koreksi.';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_block_closed_additions on payroll_additions;
create trigger trg_block_closed_additions before insert or update or delete on payroll_additions
  for each row execute function block_closed_payroll_change();
drop trigger if exists trg_block_closed_deductions on payroll_deductions;
create trigger trg_block_closed_deductions before insert or update or delete on payroll_deductions
  for each row execute function block_closed_payroll_change();
drop trigger if exists trg_block_closed_opening on payroll_opening_balances;
create trigger trg_block_closed_opening before insert or update or delete on payroll_opening_balances
  for each row execute function block_closed_opening_balance_change();

grant execute on function close_payroll_period(text, date, date, date, text, jsonb) to anon;


-- Koreksi absensi oleh owner (migrasi 007)
create table if not exists attendance_overrides (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  date         date not null,
  libur        boolean not null default false,
  masuk        text check (masuk  is null or masuk  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  pulang       text check (pulang is null or pulang ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  bolongs      jsonb not null default '[]'::jsonb,    -- [{"from":"13:00","to":"14:00"}]
  note         text,
  updated_at   timestamptz not null default now(),
  unique (employee_id, date)
);
create index if not exists idx_attendance_overrides_date on attendance_overrides (date);

drop trigger if exists trg_block_closed_attendance_overrides on attendance_overrides;
create trigger trg_block_closed_attendance_overrides before insert or update or delete on attendance_overrides
  for each row execute function block_closed_payroll_change();

-- Pengaturan aplikasi & PIN karyawan (migrasi 008)
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists employee_pins (
  employee_id  uuid primary key references employees(id) on delete cascade,
  salt         text not null,
  pin_hash     text not null,           -- SHA-256(salt:employee_id:pin), bukan PIN asli
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- Tingkat keamanan "Longgar" (disepakati): policy di bawah membuka akses penuh
-- ke role `anon` (mode lama / perangkat yang belum update) DAN `authenticated`
-- (setelah login Supabase, migrasi 008). Artinya login Supabase mengatur siapa
-- yang bisa MASUK APLIKASI, tapi siapa pun yang punya URL + anon key masih bisa
-- baca/tulis lewat API. Untuk menutupnya, lihat blok "NANTI" di migrasi 008.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'categories','menu_items','variant_categories','variant_groups','variant_options',
    'menu_item_variant_groups','customers','vouchers','expense_categories','transactions',
    'transaction_items','expenses','shifts','employees','payroll_additions','payroll_deductions','payroll_opening_balances','payroll_closings','payroll_closing_lines','attendance_overrides','app_settings','employee_pins'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon_all_%s" on %I', t, t);
    execute format(
      'create policy "anon_all_%s" on %I for all to anon using (true) with check (true)', t, t);
    execute format('drop policy if exists "auth_all_%s" on %I', t, t);
    execute format(
      'create policy "auth_all_%s" on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

grant execute on function close_payroll_period(text, date, date, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Migrasi 011: perangkat terdaftar (devices, device_id/device_name, trigger, catat_potongan + p_device_id)
-- ---------------------------------------------------------------------
create table if not exists devices (
  id            uuid primary key,                       -- dibuat di HP (localStorage), bukan ID perangkat keras
  code          text not null,                          -- kode pendek untuk mencocokkan HP saat owner memberi nama
  name          text,
  status        text not null default 'menunggu' check (status in ('menunggu', 'terdaftar', 'dicabut')),
  user_agent    text,
  created_at    timestamptz not null default now(),
  registered_at timestamptz,
  last_seen_at  timestamptz
);

-- Tanpa FK: device_id hanya penanda; nama disalin ke device_name supaya riwayat tetap terbaca walau HP dihapus.
alter table transactions add column if not exists device_id   uuid;
alter table transactions add column if not exists device_name text;
alter table expenses     add column if not exists device_id   uuid;
alter table expenses     add column if not exists device_name text;
create index if not exists idx_transactions_device on transactions (device_id);
create index if not exists idx_expenses_device     on expenses (device_id);

insert into app_settings (key, value) values ('device_enforce', 'false'::jsonb) on conflict (key) do nothing;

alter table devices enable row level security;
drop policy if exists "anon_all_devices" on devices;
create policy "anon_all_devices" on devices for all to anon using (true) with check (true);
drop policy if exists "auth_all_devices" on devices;
create policy "auth_all_devices" on devices for all to authenticated using (true) with check (true);

create or replace function stamp_perangkat() returns trigger language plpgsql as $$
declare
  d devices%rowtype;
  v_enforce boolean;
begin
  select coalesce((select value <> 'false'::jsonb from app_settings where key = 'device_enforce'), false) into v_enforce;
  if new.device_id is not null then
    select * into d from devices where id = new.device_id;
  end if;
  if v_enforce and (d.id is null or d.status <> 'terdaftar') then
    raise exception 'Perangkat ini belum terdaftar. Minta owner mendaftarkannya di Pengaturan, Perangkat.';
  end if;
  new.device_name := d.name;   -- sengaja menimpa kiriman klien
  return new;
end $$;

drop trigger if exists trg_stamp_perangkat on transactions;
create trigger trg_stamp_perangkat before insert on transactions for each row execute function stamp_perangkat();
drop trigger if exists trg_stamp_perangkat on expenses;
create trigger trg_stamp_perangkat before insert on expenses for each row execute function stamp_perangkat();

-- catat_potongan: tambah p_device_id (default null). Fungsi lama (6 argumen) dihapus
-- supaya PostgREST tidak bingung memilih antara dua versi.
drop function if exists catat_potongan(uuid, text, integer, date, text, text);
create or replace function catat_potongan(
  p_employee_id uuid, p_label text, p_amount integer, p_date date, p_category text, p_payment_method text,
  p_device_id uuid default null
) returns uuid language plpgsql as $$
declare
  v_name text; v_cat text; v_label text; v_pay text; v_expense uuid; v_deduction uuid;
begin
  select name into v_name from employees where id = p_employee_id;
  if v_name is null then raise exception 'Karyawan tidak ditemukan'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  v_cat := nullif(trim(p_category), '');
  if v_cat is null then raise exception 'Kategori wajib diisi'; end if;
  v_label := coalesce(nullif(trim(p_label), ''), v_cat);
  v_pay := case when p_payment_method = 'Non-Tunai' then 'Non-Tunai' else 'Tunai' end;

  insert into expenses (direction, category, amount, transaction_date, store_or_supplier_name, detail, payment_method, employee_id, employee_name, device_id)
  values ('pengeluaran', v_cat, p_amount, p_date, v_name, v_label, v_pay, p_employee_id, v_name, p_device_id)
  returning id into v_expense;

  insert into payroll_deductions (employee_id, label, amount, date, category, expense_id)
  values (p_employee_id, v_label, p_amount, p_date, v_cat, v_expense)
  returning id into v_deduction;

  return v_deduction;
end $$;

grant execute on function catat_potongan(uuid, text, integer, date, text, text, uuid) to anon;
grant execute on function catat_potongan(uuid, text, integer, date, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Migrasi 012: rincian Tambahan gaji (payroll_additions.detail)
-- ---------------------------------------------------------------------
alter table payroll_additions add column if not exists detail jsonb;

-- ---------------------------------------------------------------------
-- Migrasi 013: HPP (bahan, resep, menu, riwayat harga). Data awal: migrations/014_hpp_data_awal.sql.
-- Berbeda dari tabel lain: anon DICABUT, hanya akun di hpp_admin yang boleh akses. Lihat docs/hpp.md.
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- Admin HPP
-- ---------------------------------------------------------------------
create table if not exists hpp_admin (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  dibuat_pada timestamptz not null default now()
);
alter table hpp_admin enable row level security;   -- tanpa policy: tidak bisa dibaca langsung lewat API
revoke all on hpp_admin from anon, authenticated;

create or replace function hpp_is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.hpp_admin where user_id = auth.uid())
$$;
revoke all on function hpp_is_admin() from public, anon;
grant execute on function hpp_is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------
create table if not exists hpp_kategori (
  id          uuid primary key default gen_random_uuid(),
  jenis       text not null check (jenis in ('bahan', 'menu')),
  nama        text not null check (length(btrim(nama)) > 0),
  urutan      integer not null default 0,
  dibuat_pada timestamptz not null default now(),
  unique (jenis, nama)
);

create table if not exists hpp_bahan (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null unique check (length(btrim(nama)) > 0),
  kategori_id uuid references hpp_kategori(id) on delete restrict,
  satuan      text not null default 'pcs',                          -- satuan beli, hanya label: kg, pack, 50 pcs
  isi         numeric not null default 1 check (isi > 0),           -- jumlah unit dasar dalam satu satuan beli
  unit_dasar  text not null default 'pcs',                          -- gr, ml, pcs, porsi
  harga       numeric check (harga is null or harga >= 0),          -- harga per satuan beli; kosong = belum diisi
  harga_acuan numeric,                                              -- pembanding perubahan modal ("sejak acuan")
  catatan     text,
  aktif       boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);
create index if not exists idx_hpp_bahan_kategori on hpp_bahan (kategori_id);

create table if not exists hpp_harga_riwayat (
  id           uuid primary key default gen_random_uuid(),
  bahan_id     uuid not null references hpp_bahan(id) on delete cascade,
  harga        numeric not null,
  harga_sebelum numeric,
  catatan      text,
  sumber       text not null default 'manual',                      -- manual, modal_menu, migrasi
  dibuat_oleh  uuid,
  dibuat_pada  timestamptz not null default now()
);
create index if not exists idx_hpp_riwayat_bahan on hpp_harga_riwayat (bahan_id, dibuat_pada desc);

create table if not exists hpp_resep (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null unique check (length(btrim(nama)) > 0),
  grup       text not null default 'Resep',
  hasil_qty  numeric check (hasil_qty is null or hasil_qty > 0),    -- resep batch: total hasil dalam hasil_unit
  hasil_unit text,
  urutan     integer not null default 0,
  catatan    text
);

create table if not exists hpp_resep_item (
  id           uuid primary key default gen_random_uuid(),
  resep_id     uuid not null references hpp_resep(id) on delete cascade,
  urutan       integer not null default 0,
  bahan_id     uuid references hpp_bahan(id) on delete restrict,
  sub_resep_id uuid references hpp_resep(id) on delete restrict,
  qty          numeric not null check (qty >= 0),
  check ((bahan_id is not null) <> (sub_resep_id is not null)),
  check (sub_resep_id is distinct from resep_id)
);
create index if not exists idx_hpp_resep_item_resep on hpp_resep_item (resep_id);

create table if not exists hpp_menu (
  id           uuid primary key default gen_random_uuid(),
  nama         text not null check (length(btrim(nama)) > 0),
  kategori_id  uuid references hpp_kategori(id) on delete restrict,
  harga_outlet numeric not null default 0 check (harga_outlet >= 0),
  biaya_lain   numeric not null default 0,                          -- sisa HPP yang belum diuraikan ke komponen
  hpp_file     numeric,                                             -- HPP di file asal (hanya informasi)
  urutan       integer not null default 0,
  aktif        boolean not null default true,
  dibuat_pada  timestamptz not null default now(),
  unique (kategori_id, nama)
);

create table if not exists hpp_menu_item (
  id       uuid primary key default gen_random_uuid(),
  menu_id  uuid not null references hpp_menu(id) on delete cascade,
  urutan   integer not null default 0,
  resep_id uuid references hpp_resep(id) on delete restrict,
  bahan_id uuid references hpp_bahan(id) on delete restrict,
  qty      numeric not null check (qty >= 0),
  check ((resep_id is not null) <> (bahan_id is not null))
);
create index if not exists idx_hpp_menu_item_menu on hpp_menu_item (menu_id);

create table if not exists hpp_setting (
  key         text primary key,
  value       jsonb not null,
  diubah_pada timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Trigger: tiap harga bahan berubah, otomatis tercatat di riwayat.
-- Catatan/sumber dibawa dari hpp_ubah_harga lewat setelan transaksi (hpp.catatan, hpp.sumber).
-- ---------------------------------------------------------------------
create or replace function hpp_catat_harga() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_catatan text; v_sumber text;
begin
  v_catatan := nullif(current_setting('hpp.catatan', true), '');
  v_sumber  := nullif(current_setting('hpp.sumber', true), '');
  if tg_op = 'INSERT' then
    if new.harga is not null then
      insert into hpp_harga_riwayat (bahan_id, harga, harga_sebelum, catatan, sumber, dibuat_oleh)
      values (new.id, new.harga, null, coalesce(v_catatan, 'Harga awal'), coalesce(v_sumber, 'migrasi'), auth.uid());
    end if;
  elsif new.harga is not null and new.harga is distinct from old.harga then
    insert into hpp_harga_riwayat (bahan_id, harga, harga_sebelum, catatan, sumber, dibuat_oleh)
    values (new.id, new.harga, old.harga, v_catatan, coalesce(v_sumber, 'manual'), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_hpp_catat_harga on hpp_bahan;
create trigger trg_hpp_catat_harga after insert or update of harga on hpp_bahan
  for each row execute function hpp_catat_harga();

create or replace function hpp_stamp_diubah() returns trigger language plpgsql as $$
begin new.diubah_pada := now(); return new; end $$;
drop trigger if exists trg_hpp_bahan_diubah on hpp_bahan;
create trigger trg_hpp_bahan_diubah before update on hpp_bahan
  for each row execute function hpp_stamp_diubah();

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------
-- Ubah harga bahan + catat riwayat dalam satu transaksi. Hak akses mengikuti RLS (hanya admin HPP).
create or replace function hpp_ubah_harga(p_bahan uuid, p_harga numeric, p_catatan text default null, p_sumber text default 'manual')
returns void language plpgsql set search_path = public as $$
begin
  if p_harga is null or p_harga < 0 then raise exception 'Harga tidak valid'; end if;
  perform set_config('hpp.catatan', coalesce(p_catatan, ''), true);
  perform set_config('hpp.sumber', coalesce(p_sumber, 'manual'), true);
  update hpp_bahan set harga = p_harga where id = p_bahan;
  if not found then raise exception 'Bahan tidak ditemukan atau akses ditolak'; end if;
end $$;

-- Jadikan harga sekarang sebagai acuan perubahan modal.
create or replace function hpp_set_acuan() returns integer
language plpgsql set search_path = public as $$
declare n integer;
begin
  update hpp_bahan set harga_acuan = harga where harga_acuan is distinct from harga;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function hpp_ubah_harga(uuid, numeric, text, text) to authenticated;
grant execute on function hpp_set_acuan() to authenticated;
revoke execute on function hpp_ubah_harga(uuid, numeric, text, text) from public, anon;
revoke execute on function hpp_set_acuan() from public, anon;

-- ---------------------------------------------------------------------
-- RLS: hanya admin HPP. anon dicabut total.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['hpp_kategori','hpp_bahan','hpp_resep','hpp_resep_item','hpp_menu','hpp_menu_item','hpp_setting'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('drop policy if exists "hpp_admin_all_%s" on %I', t, t);
    execute format('create policy "hpp_admin_all_%s" on %I for all to authenticated using (hpp_is_admin()) with check (hpp_is_admin())', t, t);
  end loop;
end $$;

-- Riwayat: boleh dibaca admin, TIDAK boleh diubah/dihapus/ditambah langsung (hanya lewat trigger).
alter table hpp_harga_riwayat enable row level security;
revoke all on hpp_harga_riwayat from anon;
revoke insert, update, delete on hpp_harga_riwayat from authenticated;
drop policy if exists "hpp_admin_read_riwayat" on hpp_harga_riwayat;
create policy "hpp_admin_read_riwayat" on hpp_harga_riwayat for select to authenticated using (hpp_is_admin());

-- ---------------------------------------------------------------------
-- DAFTARKAN AKUN ADMIN HPP (jalankan SETELAH akunnya ada di Authentication -> Users).
-- Ganti email di bawah dengan email akun yang akan dipakai login di /hpp, lalu hilangkan tanda "--".
-- Boleh akun owner POS yang sudah ada (password: mamam: + PIN), atau akun baru khusus HPP.
--
-- insert into hpp_admin (user_id)
-- select id from auth.users where lower(email) = lower('GANTI-DENGAN-EMAIL-ANDA@contoh.com')
-- on conflict do nothing;
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- Migrasi 016: pengajuan hapus transaksi (staf mengajukan, owner memutuskan). Lihat migrations/016_hapus_transaksi.sql.
-- ---------------------------------------------------------------------
create table if not exists transaction_delete_requests (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null,                       -- tanpa FK: catatan tetap ada setelah transaksi dihapus
  display_number  text,                                -- snapshot
  customer_name   text,
  order_type      text,
  payment_method  text,
  total           integer,
  transaction_at  timestamptz,                         -- paid_at / created_at transaksi
  items_summary   text,                                -- "2x Ayam Geprek, 1x Es Teh"
  reason          text not null,
  requested_by    text not null,
  device_id       uuid,
  status          text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak')),
  reject_reason   text,
  decided_by      text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_tdr_status on transaction_delete_requests (status, created_at);
create index if not exists idx_tdr_transaction on transaction_delete_requests (transaction_id);
-- Satu transaksi = paling banyak satu pengajuan yang masih menunggu.
create unique index if not exists uq_tdr_pending on transaction_delete_requests (transaction_id) where status = 'menunggu';

alter table transaction_delete_requests enable row level security;
drop policy if exists "anon_all_transaction_delete_requests" on transaction_delete_requests;
create policy "anon_all_transaction_delete_requests" on transaction_delete_requests for all to anon using (true) with check (true);
drop policy if exists "auth_all_transaction_delete_requests" on transaction_delete_requests;
create policy "auth_all_transaction_delete_requests" on transaction_delete_requests for all to authenticated using (true) with check (true);

create or replace function ajukan_hapus_transaksi(
  p_transaction_id uuid, p_reason text, p_requested_by text, p_device_id uuid default null
) returns uuid language plpgsql as $$
declare
  t transactions%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_by text := nullif(trim(p_requested_by), '');
  v_items text;
  v_id uuid;
begin
  if v_reason is null then raise exception 'Alasan wajib diisi'; end if;
  if v_by is null then raise exception 'Pilih namamu dulu'; end if;
  select * into t from transactions where id = p_transaction_id;
  if t.id is null then raise exception 'Transaksi ini sudah tidak ada'; end if;
  if exists (select 1 from transaction_delete_requests where transaction_id = p_transaction_id and status = 'menunggu') then
    raise exception 'Transaksi ini sudah diajukan untuk dihapus, tunggu keputusan owner';
  end if;

  select string_agg(qty || 'x ' || name, ', ' order by name) into v_items from transaction_items where transaction_id = p_transaction_id;

  insert into transaction_delete_requests (transaction_id, display_number, customer_name, order_type, payment_method, total, transaction_at, items_summary, reason, requested_by, device_id)
  values (t.id, t.display_number, t.customer_name, t.order_type, t.payment_method, t.total, coalesce(t.paid_at, t.created_at), v_items, v_reason, v_by, p_device_id)
  returning id into v_id;
  return v_id;
end $$;

-- Mengembalikan status akhir ('disetujui' | 'ditolak'). Pengajuan yang sudah diputuskan ditolak dengan pesan jelas.
create or replace function putuskan_hapus_transaksi(
  p_request_id uuid, p_approve boolean, p_reason text default null
) returns text language plpgsql as $$
declare
  r transaction_delete_requests%rowtype;
begin
  select * into r from transaction_delete_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Pengajuan tidak ditemukan'; end if;
  if r.status <> 'menunggu' then raise exception 'Pengajuan ini sudah diputuskan sebelumnya'; end if;

  if p_approve then
    delete from transactions where id = r.transaction_id;   -- item ikut terhapus (ON DELETE CASCADE); trigger di bawah menandai 'disetujui'
    update transaction_delete_requests set status = 'disetujui', decided_by = 'Owner', decided_at = now(), reject_reason = null where id = r.id;
    return 'disetujui';
  end if;
  update transaction_delete_requests set status = 'ditolak', decided_by = 'Owner', decided_at = now(), reject_reason = nullif(trim(p_reason), '') where id = r.id;
  return 'ditolak';
end $$;

-- Transaksi dihapus langsung (owner dari Riwayat / hapus banyak): pengajuan yang menunggu dianggap selesai.
create or replace function selesaikan_pengajuan_hapus() returns trigger language plpgsql as $$
begin
  update transaction_delete_requests
     set status = 'disetujui', decided_by = 'Owner', decided_at = now()
   where transaction_id = old.id and status = 'menunggu';
  return old;
end $$;

drop trigger if exists trg_selesaikan_pengajuan_hapus on transactions;
create trigger trg_selesaikan_pengajuan_hapus after delete on transactions for each row execute function selesaikan_pengajuan_hapus();

grant execute on function ajukan_hapus_transaksi(uuid, text, text, uuid) to anon;
grant execute on function ajukan_hapus_transaksi(uuid, text, text, uuid) to authenticated;
grant execute on function putuskan_hapus_transaksi(uuid, boolean, text) to anon;
grant execute on function putuskan_hapus_transaksi(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- Migrasi 018: pengajuan hapus pengeluaran (staf mengajukan, owner memutuskan). Lihat migrations/018_hapus_pengeluaran.sql.
-- ---------------------------------------------------------------------
create table if not exists expense_delete_requests (
  id              uuid primary key default gen_random_uuid(),
  expense_id      uuid not null,                       -- tanpa FK: catatan tetap ada setelah pengeluaran dihapus
  expense_date    date,                                -- snapshot
  category        text,
  supplier        text,
  detail          text,
  payment_method  text,
  amount          integer,
  employee_id     uuid,                                -- terisi = pengeluaran karyawan (potongan)
  employee_name   text,
  reason          text not null,
  requested_by    text not null,
  device_id       uuid,
  status          text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak')),
  reject_reason   text,
  decided_by      text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_edr_status on expense_delete_requests (status, created_at);
create index if not exists idx_edr_expense on expense_delete_requests (expense_id);
-- Satu pengeluaran = paling banyak satu pengajuan yang masih menunggu.
create unique index if not exists uq_edr_pending on expense_delete_requests (expense_id) where status = 'menunggu';

alter table expense_delete_requests enable row level security;
drop policy if exists "anon_all_expense_delete_requests" on expense_delete_requests;
create policy "anon_all_expense_delete_requests" on expense_delete_requests for all to anon using (true) with check (true);
drop policy if exists "auth_all_expense_delete_requests" on expense_delete_requests;
create policy "auth_all_expense_delete_requests" on expense_delete_requests for all to authenticated using (true) with check (true);

create or replace function ajukan_hapus_pengeluaran(
  p_expense_id uuid, p_reason text, p_requested_by text, p_device_id uuid default null
) returns uuid language plpgsql as $$
declare
  e expenses%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_by text := nullif(trim(p_requested_by), '');
  v_emp text;
  v_id uuid;
begin
  if v_reason is null then raise exception 'Alasan wajib diisi'; end if;
  if v_by is null then raise exception 'Pilih namamu dulu'; end if;
  select * into e from expenses where id = p_expense_id;
  if e.id is null then raise exception 'Pengeluaran ini sudah tidak ada'; end if;
  if exists (select 1 from expense_delete_requests where expense_id = p_expense_id and status = 'menunggu') then
    raise exception 'Pengeluaran ini sudah diajukan untuk dihapus, tunggu keputusan owner';
  end if;

  if e.employee_id is not null then
    select name into v_emp from employees where id = e.employee_id;
  end if;

  insert into expense_delete_requests (expense_id, expense_date, category, supplier, detail, payment_method, amount, employee_id, employee_name, reason, requested_by, device_id)
  values (e.id, e.transaction_date, e.category, e.store_or_supplier_name, e.detail, e.payment_method, e.amount, e.employee_id, v_emp, v_reason, v_by, p_device_id)
  returning id into v_id;
  return v_id;
end $$;

-- Mengembalikan status akhir ('disetujui' | 'ditolak'). Pengajuan yang sudah diputuskan ditolak dengan pesan jelas.
create or replace function putuskan_hapus_pengeluaran(
  p_request_id uuid, p_approve boolean, p_reason text default null
) returns text language plpgsql as $$
declare
  r expense_delete_requests%rowtype;
begin
  select * into r from expense_delete_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Pengajuan tidak ditemukan'; end if;
  if r.status <> 'menunggu' then raise exception 'Pengajuan ini sudah diputuskan sebelumnya'; end if;

  if p_approve then
    delete from expenses where id = r.expense_id;   -- potongan gaji tertaut ikut terhapus (cascade); trigger di bawah menandai 'disetujui'
    update expense_delete_requests set status = 'disetujui', decided_by = 'Owner', decided_at = now(), reject_reason = null where id = r.id;
    return 'disetujui';
  end if;
  update expense_delete_requests set status = 'ditolak', decided_by = 'Owner', decided_at = now(), reject_reason = nullif(trim(p_reason), '') where id = r.id;
  return 'ditolak';
end $$;

-- Pengeluaran dihapus langsung (owner dari layar Pengeluaran / hapus banyak): pengajuan yang menunggu dianggap selesai.
create or replace function selesaikan_pengajuan_hapus_pengeluaran() returns trigger language plpgsql as $$
begin
  update expense_delete_requests
     set status = 'disetujui', decided_by = 'Owner', decided_at = now()
   where expense_id = old.id and status = 'menunggu';
  return old;
end $$;

drop trigger if exists trg_selesaikan_pengajuan_hapus_pengeluaran on expenses;
create trigger trg_selesaikan_pengajuan_hapus_pengeluaran after delete on expenses for each row execute function selesaikan_pengajuan_hapus_pengeluaran();

grant execute on function ajukan_hapus_pengeluaran(uuid, text, text, uuid) to anon;
grant execute on function ajukan_hapus_pengeluaran(uuid, text, text, uuid) to authenticated;
grant execute on function putuskan_hapus_pengeluaran(uuid, boolean, text) to anon;
grant execute on function putuskan_hapus_pengeluaran(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- Migrasi 019: penanda "Diedit" pada Tambahan gaji. Lihat migrations/019_tambahan_diedit.sql.
-- ---------------------------------------------------------------------
alter table payroll_additions add column if not exists edited_at timestamptz;


-- ---------------------------------------------------------------------
-- Migrasi 020: absensi pindah ke project C (attendance_log, absen_daftar_karyawan, stock checklist,
-- bucket foto). Lihat migrations/020_absensi.sql dan docs/migrasi-absensi.md.
-- ---------------------------------------------------------------------
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
