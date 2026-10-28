-- Private offline-first backup. Prescription photos live in Storage, never this payload.
create table public.medication_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and payload->>'schema' = '1'
    and jsonb_typeof(payload->'profiles') = 'array'
    and jsonb_typeof(payload->'medicines') = 'array'
    and jsonb_typeof(payload->'reminders') = 'array'
    and jsonb_typeof(payload->'events') = 'array'
    and octet_length(payload::text) <= 4000000
  ),
  updated_at timestamptz not null default now()
);
alter table public.medication_backups enable row level security;
grant select, insert, update on public.medication_backups to authenticated;
revoke all on public.medication_backups from anon;
create policy "Read own backup" on public.medication_backups for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own backup" on public.medication_backups for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own backup" on public.medication_backups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.save_medication_backup(expected_revision bigint, next_payload jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); result_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_revision < 0 then raise exception 'Invalid revision' using errcode = '22023'; end if;
  if expected_revision = 0 then
    begin
      insert into public.medication_backups(user_id,payload) values (owner_id,next_payload) returning revision into result_revision;
    exception when unique_violation then
      raise exception 'Backup changed; merge and retry' using errcode = '40001';
    end;
  else
    update public.medication_backups set payload=next_payload, revision=revision+1, updated_at=now()
    where user_id=owner_id and revision=expected_revision returning revision into result_revision;
    if result_revision is null then raise exception 'Backup changed; merge and retry' using errcode = '40001'; end if;
  end if;
  return result_revision;
end;
$$;
revoke all on function public.save_medication_backup(bigint,jsonb) from public,anon;
grant execute on function public.save_medication_backup(bigint,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('prescriptions','prescriptions',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy "Read own prescriptions" on storage.objects for select to authenticated
using (bucket_id='prescriptions' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Insert own prescriptions" on storage.objects for insert to authenticated
with check (bucket_id='prescriptions' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Update own prescriptions" on storage.objects for update to authenticated
using (bucket_id='prescriptions' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='prescriptions' and (storage.foldername(name))[1]=(select auth.uid())::text);

