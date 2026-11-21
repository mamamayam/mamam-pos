-- =====================================================================
-- Migrasi 024 — Ubah transaksi (permintaan pemilik 21 Nov 2026).
-- Jalankan SEKALI di SQL Editor project C. Aman diulang. Butuh migrasi 016 TIDAK; 011 (perangkat) opsional.
--
-- Aturan: transaksi lunas boleh diubah LANGSUNG dalam 30 menit sejak dibayar. Lewat itu, staf harus
-- MENGAJUKAN ubah ke owner (sheet Persetujuan). Owner boleh mengubah kapan saja. Semua perubahan dicatat.
--
-- 1. transaction_edits           : catatan setiap perubahan (siapa/HP mana/kapan, sebelum dan sesudah).
--                                  transaction_id TANPA FK, jejak tetap ada walau transaksinya dihapus.
-- 2. transaction_edit_requests   : pengajuan ubah dari staf (menunggu / disetujui / ditolak). Satu transaksi
--                                  paling banyak satu pengajuan yang menunggu.
-- 3. snapshot_transaksi()        : isi transaksi (kolom yang bisa diubah + item) sebagai jsonb.
-- 4. terapkan_ubah_transaksi()   : INTI, satu-satunya yang mengubah baris. Memvalidasi, menghitung ulang
--                                  subtotal/total/kembalian DI DATABASE (tidak percaya angka dari klien), mencatat log.
-- 5. ubah_transaksi()            : jalur langsung. Staf ditolak kalau lewat 30 menit (batas ini sama dengan
--                                  EDIT_WINDOW_MINUTES di src/features/history/transactionEditMath.js; ubah keduanya bersamaan).
-- 6. ajukan_ubah_transaksi()     : staf mengajukan (alasan + nama wajib). Usulan diuji dulu dengan menerapkannya lalu
--                                  membatalkannya, jadi pengajuan yang pasti gagal ditolak sejak awal.
-- 7. putuskan_ubah_transaksi()   : owner setuju (diterapkan lewat jalur yang sama) atau tolak.
--
-- `p_changes` (jsonb, hanya kolom yang berubah):
--   { customer_name, order_type, payment_method, ojol_platform, ojol_order_number, amount_paid,
--     items: [ { id, qty } ] }   -- qty 0 = hapus item; qty hanya boleh dikurangi; minimal satu item tersisa
-- Diskon (voucher / manual) TIDAK dihitung ulang: nominal tersimpan tetap, total tidak pernah di bawah 0.
-- Split Payment: hanya nama pelanggan dan tipe pesanan yang boleh diubah.
--
-- Ini pagar alur kerja dan jejak audit, bukan keamanan data: RLS tetap longgar seperti tabel lain.
-- =====================================================================

create table if not exists transaction_edits (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null,                       -- tanpa FK
  display_number  text,
  transaction_at  timestamptz,                         -- paid_at / created_at transaksi (untuk menyaring per periode)
  edited_by       text,                                -- 'Owner' | 'Staf' (jalur langsung) atau nama pengaju (lewat persetujuan)
  via             text not null check (via in ('langsung', 'persetujuan')),
  reason          text,
  device_id       uuid,
  device_name     text,
  before          jsonb not null,
  after           jsonb not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_te_transaction on transaction_edits (transaction_id, created_at desc);
create index if not exists idx_te_transaction_at on transaction_edits (transaction_at);

create table if not exists transaction_edit_requests (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null,                       -- tanpa FK
  display_number  text,
  customer_name   text,
  order_type      text,
  payment_method  text,
  total           integer,                             -- total SEBELUM diubah
  transaction_at  timestamptz,
  changes         jsonb not null,                      -- usulan (bentuk p_changes)
  before          jsonb not null,
  after           jsonb not null,                      -- hasil kalau disetujui (dari uji terap)
  reason          text not null,
  requested_by    text not null,
  device_id       uuid,
  device_name     text,
  status          text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak')),
  reject_reason   text,
  decided_by      text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ter_status on transaction_edit_requests (status, created_at);
create index if not exists idx_ter_transaction on transaction_edit_requests (transaction_id);
create unique index if not exists uq_ter_pending on transaction_edit_requests (transaction_id) where status = 'menunggu';

alter table transaction_edits enable row level security;
drop policy if exists "anon_all_transaction_edits" on transaction_edits;
create policy "anon_all_transaction_edits" on transaction_edits for all to anon using (true) with check (true);
drop policy if exists "auth_all_transaction_edits" on transaction_edits;
create policy "auth_all_transaction_edits" on transaction_edits for all to authenticated using (true) with check (true);

alter table transaction_edit_requests enable row level security;
drop policy if exists "anon_all_transaction_edit_requests" on transaction_edit_requests;
create policy "anon_all_transaction_edit_requests" on transaction_edit_requests for all to anon using (true) with check (true);
drop policy if exists "auth_all_transaction_edit_requests" on transaction_edit_requests;
create policy "auth_all_transaction_edit_requests" on transaction_edit_requests for all to authenticated using (true) with check (true);

-- Isi transaksi yang relevan untuk perubahan, sebagai jsonb (dipakai log dan tampilan sebelum -> sesudah).
create or replace function snapshot_transaksi(p_id uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'customer_name', t.customer_name, 'order_type', t.order_type, 'payment_method', t.payment_method,
    'ojol_platform', t.ojol_platform, 'ojol_order_number', t.ojol_order_number,
    'amount_paid', t.amount_paid, 'change_amount', t.change_amount,
    'subtotal', t.subtotal, 'total', t.total,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'variant_name', i.variant_name, 'qty', i.qty, 'price', i.price) order by i.name, i.id)
        from transaction_items i where i.transaction_id = t.id
    ), '[]'::jsonb)
  ) from transactions t where t.id = p_id
$$;

-- INTI: validasi + hitung ulang + simpan + catat. Mengembalikan id baris log.
create or replace function terapkan_ubah_transaksi(
  p_transaction_id uuid, p_changes jsonb, p_edited_by text, p_via text, p_reason text,
  p_device_id uuid default null, p_request_id uuid default null
) returns uuid language plpgsql as $$
declare
  t transactions%rowtype;
  ch jsonb := coalesce(p_changes, '{}'::jsonb);
  v_before jsonb; v_after jsonb;
  v_row jsonb; v_iid uuid; v_q integer; v_cur integer;
  v_items_changed boolean := false;
  v_type text; v_method text; v_name text;
  v_subtotal integer; v_fee integer; v_total integer;
  v_paid integer; v_change integer; v_plat text; v_ord text;
  v_dev text; v_log uuid;
begin
  if jsonb_typeof(ch) <> 'object' then raise exception 'Perubahan tidak valid'; end if;
  select * into t from transactions where id = p_transaction_id for update;
  if t.id is null then raise exception 'Transaksi ini sudah tidak ada'; end if;
  if t.status <> 'paid' then raise exception 'Hanya transaksi yang sudah dibayar yang bisa diubah'; end if;

  if t.payment_method = 'Split Payment' and (ch ? 'payment_method' or ch ? 'items' or ch ? 'amount_paid') then
    raise exception 'Transaksi Split Payment hanya bisa diubah nama pelanggan dan tipe pesanannya. Hapus lalu input ulang untuk mengubah yang lain.';
  end if;

  v_before := snapshot_transaksi(t.id);

  -- Item: hanya dikurangi atau dihapus; minimal satu tersisa.
  if ch ? 'items' and jsonb_typeof(ch->'items') = 'array' then
    for v_row in select * from jsonb_array_elements(ch->'items') loop
      v_iid := (v_row->>'id')::uuid;
      v_q := (v_row->>'qty')::integer;
      select qty into v_cur from transaction_items where id = v_iid and transaction_id = t.id;
      if v_cur is null then raise exception 'Ada item yang tidak ditemukan di transaksi ini'; end if;
      if v_q is null or v_q < 0 or v_q > v_cur then raise exception 'Jumlah item hanya bisa dikurangi'; end if;
      if v_q = 0 then
        delete from transaction_items where id = v_iid;
        v_items_changed := true;
      elsif v_q <> v_cur then
        update transaction_items set qty = v_q where id = v_iid;
        v_items_changed := true;
      end if;
    end loop;
    if not exists (select 1 from transaction_items where transaction_id = t.id) then
      raise exception 'Transaksi harus punya minimal satu item. Untuk membatalkan seluruh transaksi, hapus transaksinya.';
    end if;
  end if;

  v_type := coalesce(nullif(ch->>'order_type', ''), t.order_type);
  if v_type not in ('Takeaway', 'Dine-in', 'Delivery', 'Ojol') then raise exception 'Tipe pesanan tidak dikenal'; end if;
  v_method := coalesce(nullif(ch->>'payment_method', ''), t.payment_method);
  if v_method not in ('Tunai', 'QRIS', 'Transfer', 'Ojol', 'Split Payment') then raise exception 'Metode bayar tidak dikenal'; end if;
  if v_method = 'Split Payment' and t.payment_method <> 'Split Payment' then raise exception 'Tidak bisa pindah ke Split Payment lewat ubah'; end if;

  -- Subtotal dan total dihitung ulang di sini. Diskon tersimpan tetap; ongkir hanya untuk tipe Delivery.
  v_subtotal := case when v_items_changed
                     then coalesce((select sum(price * qty) from transaction_items where transaction_id = t.id), 0)
                     else t.subtotal end;
  v_fee := case when v_type = 'Delivery' then t.delivery_fee else 0 end;
  v_total := case when v_items_changed or v_fee <> t.delivery_fee
                  then greatest(0, v_subtotal - t.voucher_discount - t.manual_discount_amount) + v_fee
                  else t.total end;

  -- Pembayaran.
  if v_method = 'Tunai' then
    v_paid := case when ch ? 'amount_paid' then nullif(ch->>'amount_paid', '')::integer else t.amount_paid end;
    if t.payment_method <> 'Tunai' and v_paid is null then raise exception 'Isi uang diterima untuk pembayaran tunai'; end if;
    if v_paid is not null then
      if v_paid < v_total then raise exception 'Uang diterima kurang dari total'; end if;
      v_change := v_paid - v_total;
    else
      v_change := null;
    end if;
  elsif v_method = 'Split Payment' then
    v_paid := t.amount_paid; v_change := t.change_amount;
  else
    v_paid := null; v_change := null;
  end if;

  if v_method = 'Ojol' then
    v_plat := coalesce(nullif(trim(ch->>'ojol_platform'), ''), t.ojol_platform);
    if v_plat is null then raise exception 'Pilih aplikasi Ojol'; end if;
    v_ord := case when ch ? 'ojol_order_number' then nullif(trim(ch->>'ojol_order_number'), '') else t.ojol_order_number end;
  else
    v_plat := null; v_ord := null;
  end if;

  -- Nama pelanggan: nama bebas. Kalau berubah, tautan ke data pelanggan dilepas (nama baru belum tentu orang yang sama).
  if ch ? 'customer_name' then
    v_name := nullif(trim(ch->>'customer_name'), '');
    if v_name is distinct from t.customer_name then
      update transactions set customer_id = null where id = t.id;
    end if;
  else
    v_name := t.customer_name;
  end if;

  update transactions
     set customer_name = v_name, order_type = v_type, payment_method = v_method,
         ojol_platform = v_plat, ojol_order_number = v_ord,
         subtotal = v_subtotal, delivery_fee = v_fee, total = v_total,
         amount_paid = v_paid, change_amount = v_change
   where id = t.id;

  v_after := snapshot_transaksi(t.id);
  if v_after = v_before then raise exception 'Tidak ada yang berubah'; end if;

  if p_device_id is not null then
    begin
      execute 'select name from devices where id = $1' into v_dev using p_device_id;
    exception when others then v_dev := null;   -- migrasi 011 belum dijalankan
    end;
  end if;

  insert into transaction_edits (transaction_id, display_number, transaction_at, edited_by, via, reason, device_id, device_name, before, after)
  values (t.id, t.display_number, coalesce(t.paid_at, t.created_at), nullif(trim(p_edited_by), ''), p_via, nullif(trim(p_reason), ''), p_device_id, v_dev, v_before, v_after)
  returning id into v_log;

  -- Pengajuan ubah lain untuk transaksi ini jadi basi (isinya dihitung dari keadaan lama): tutup otomatis.
  update transaction_edit_requests
     set status = 'ditolak', decided_by = 'Sistem', decided_at = now(), reject_reason = 'Transaksi sudah diubah, ajukan ulang bila perlu.'
   where transaction_id = t.id and status = 'menunggu' and id is distinct from p_request_id;

  return v_log;
end $$;

-- Jalur langsung. p_as_owner = yang login owner (tanpa batas waktu). Staf: hanya dalam 30 menit sejak dibayar.
create or replace function ubah_transaksi(
  p_transaction_id uuid, p_changes jsonb, p_as_owner boolean default false, p_device_id uuid default null
) returns uuid language plpgsql as $$
declare
  t transactions%rowtype;
begin
  select * into t from transactions where id = p_transaction_id;
  if t.id is null then raise exception 'Transaksi ini sudah tidak ada'; end if;
  if not coalesce(p_as_owner, false) and now() - coalesce(t.paid_at, t.created_at) > interval '30 minutes' then
    raise exception 'Sudah lewat 30 menit sejak dibayar. Ajukan ubah ke owner.';
  end if;
  return terapkan_ubah_transaksi(p_transaction_id, p_changes, case when coalesce(p_as_owner, false) then 'Owner' else 'Staf' end, 'langsung', null, p_device_id, null);
end $$;

create or replace function ajukan_ubah_transaksi(
  p_transaction_id uuid, p_changes jsonb, p_reason text, p_requested_by text, p_device_id uuid default null
) returns uuid language plpgsql as $$
declare
  t transactions%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_by text := nullif(trim(p_requested_by), '');
  v_before jsonb; v_after jsonb; v_dev text; v_id uuid;
begin
  if v_reason is null then raise exception 'Alasan wajib diisi'; end if;
  if v_by is null then raise exception 'Pilih namamu dulu'; end if;
  select * into t from transactions where id = p_transaction_id;
  if t.id is null then raise exception 'Transaksi ini sudah tidak ada'; end if;
  if exists (select 1 from transaction_edit_requests where transaction_id = p_transaction_id and status = 'menunggu') then
    raise exception 'Transaksi ini sudah diajukan untuk diubah, tunggu keputusan owner';
  end if;

  v_before := snapshot_transaksi(t.id);
  -- Uji terap: kalau usulan tidak valid, galatnya sampai ke pengaju sekarang. Kalau valid, semuanya dibatalkan (P9999).
  begin
    perform terapkan_ubah_transaksi(p_transaction_id, p_changes, v_by, 'persetujuan', v_reason, p_device_id, null);
    v_after := snapshot_transaksi(t.id);
    raise exception 'uji-terap' using errcode = 'P9999';
  exception when sqlstate 'P9999' then null;
  end;

  if p_device_id is not null then
    begin
      execute 'select name from devices where id = $1' into v_dev using p_device_id;
    exception when others then v_dev := null;
    end;
  end if;

  insert into transaction_edit_requests (transaction_id, display_number, customer_name, order_type, payment_method, total, transaction_at,
                                         changes, before, after, reason, requested_by, device_id, device_name)
  values (t.id, t.display_number, t.customer_name, t.order_type, t.payment_method, t.total, coalesce(t.paid_at, t.created_at),
          p_changes, v_before, v_after, v_reason, v_by, p_device_id, v_dev)
  returning id into v_id;
  return v_id;
end $$;

-- Mengembalikan status akhir ('disetujui' | 'ditolak').
create or replace function putuskan_ubah_transaksi(
  p_request_id uuid, p_approve boolean, p_reason text default null
) returns text language plpgsql as $$
declare
  r transaction_edit_requests%rowtype;
begin
  select * into r from transaction_edit_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Pengajuan tidak ditemukan'; end if;
  if r.status <> 'menunggu' then raise exception 'Pengajuan ini sudah diputuskan sebelumnya'; end if;

  if p_approve then
    perform terapkan_ubah_transaksi(r.transaction_id, r.changes, r.requested_by, 'persetujuan', r.reason, r.device_id, r.id);
    update transaction_edit_requests set status = 'disetujui', decided_by = 'Owner', decided_at = now(), reject_reason = null where id = r.id;
    return 'disetujui';
  end if;
  update transaction_edit_requests set status = 'ditolak', decided_by = 'Owner', decided_at = now(), reject_reason = nullif(trim(p_reason), '') where id = r.id;
  return 'ditolak';
end $$;

-- Transaksi dihapus: pengajuan ubah yang menunggu ditutup.
create or replace function tutup_pengajuan_ubah() returns trigger language plpgsql as $$
begin
  update transaction_edit_requests
     set status = 'ditolak', decided_by = 'Sistem', decided_at = now(), reject_reason = 'Transaksi sudah dihapus.'
   where transaction_id = old.id and status = 'menunggu';
  return old;
end $$;

drop trigger if exists trg_tutup_pengajuan_ubah on transactions;
create trigger trg_tutup_pengajuan_ubah after delete on transactions for each row execute function tutup_pengajuan_ubah();

grant execute on function snapshot_transaksi(uuid) to anon, authenticated;
grant execute on function terapkan_ubah_transaksi(uuid, jsonb, text, text, text, uuid, uuid) to anon, authenticated;
grant execute on function ubah_transaksi(uuid, jsonb, boolean, uuid) to anon, authenticated;
grant execute on function ajukan_ubah_transaksi(uuid, jsonb, text, text, uuid) to anon, authenticated;
grant execute on function putuskan_ubah_transaksi(uuid, boolean, text) to anon, authenticated;
