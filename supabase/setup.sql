-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- One table holds every stop and expense, keyed by trip code and record id.

create table if not exists public.records (
  trip       text   not null,
  id         text   not null,
  kind       text   not null,          -- 'stops' or 'expenses'
  data       jsonb  not null,          -- the full record
  updated_at bigint not null,          -- phone time of the last edit, in ms
  primary key (trip, id)
);

alter table public.records enable row level security;

-- Phones can read records. Writes go only through the function below.
drop policy if exists "read records" on public.records;
create policy "read records" on public.records for select to anon using (true);

-- Upsert that keeps whichever copy is newer, so an old phone can never overwrite a newer edit.
create or replace function public.upsert_records(p_trip text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into records (trip, id, kind, data, updated_at)
  select p_trip, r->>'id', r->>'kind', r->'data', (r->>'updated_at')::bigint
  from jsonb_array_elements(p_rows) as r
  on conflict (trip, id) do update
    set kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at
    where records.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.upsert_records(text, jsonb) to anon;
