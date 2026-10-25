-- Run once after setup.sql: Dashboard > SQL Editor > New query > paste > Run.
-- Creates a private "receipts" bucket for receipt pictures and payment screenshots.
-- The app key can read and add pictures there, but not change or delete them.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts read" on storage.objects;
create policy "receipts read" on storage.objects for select to anon using (bucket_id = 'receipts');

drop policy if exists "receipts upload" on storage.objects;
create policy "receipts upload" on storage.objects for insert to anon with check (bucket_id = 'receipts');
