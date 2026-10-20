-- =====================================================================
-- Migrasi 018 — Pengajuan hapus pengeluaran (staf mengajukan, owner memutuskan).
-- Jalankan SEKALI di SQL Editor project C. Aman diulang. Butuh migrasi 009 (kolom expenses.employee_id).
--
-- Kembaran 016 (hapus transaksi), untuk tabel expenses:
-- 1. expense_delete_requests    : satu baris per pengajuan, menyimpan SNAPSHOT pengeluaran
--    (tanggal, kategori, nominal, dst) karena barisnya hilang kalau disetujui. expense_id TANPA FK.
-- 2. ajukan_hapus_pengeluaran() : staf mengajukan (alasan + nama wajib). Satu pengeluaran hanya
--    boleh punya SATU pengajuan 'menunggu'.
-- 3. putuskan_hapus_pengeluaran(): owner setuju (pengeluaran dihapus permanen; potongan gaji
--    tertaut ikut terhapus lewat FK cascade) atau tolak (pengeluaran tetap).
-- 4. Trigger: pengeluaran dihapus langsung oleh owner -> pengajuan 'menunggu' miliknya jadi 'disetujui'.
--
-- Ini pagar alur kerja (jejak audit), bukan keamanan data: RLS tetap longgar seperti tabel lain.
-- =====================================================================

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
