revoke all on public.profiles, public.albums, public.media, public.media_variants,
  public.upload_jobs, public.audit_logs from anon, authenticated;

create or replace view public.public_album_catalog as
select id, slug, title, description, event_name, category, event_date,
  cover_media_id, published_at, created_at
from public.albums
where status = 'published' and deleted_at is null;

create or replace view public.public_media_catalog as
select m.id, m.album_id, m.type, m.alt, m.caption, m.width, m.height, m.sort_order, m.published_at
from public.media m
join public.albums a on a.id = m.album_id
where m.status = 'published' and m.deleted_at is null
  and a.status = 'published' and a.deleted_at is null;

create or replace view public.public_variant_catalog as
select v.media_id, v.variant_type, v.width, v.height, v.file_size_bytes
from public.media_variants v
join public.media m on m.id = v.media_id
join public.albums a on a.id = m.album_id
where m.status = 'published' and m.deleted_at is null
  and a.status = 'published' and a.deleted_at is null;

grant select on public.public_album_catalog, public.public_media_catalog,
  public.public_variant_catalog to anon, authenticated;

create or replace function public.admin_create_album(
  p_title text, p_slug text, p_description text default null,
  p_event_name text default null, p_category text default null, p_event_date date default null
)
returns public.albums
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_album public.albums;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  insert into public.albums (title, slug, description, event_name, category, event_date, created_by)
  values (trim(p_title), trim(p_slug), nullif(trim(p_description), ''),
    nullif(trim(p_event_name), ''), nullif(trim(p_category), ''), p_event_date, auth.uid())
  returning * into created_album;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'album.created', 'album', created_album.id,
    jsonb_build_object('slug', created_album.slug));
  return created_album;
end;
$$;

create or replace function public.admin_update_album(p_album_id uuid, p_changes jsonb)
returns public.albums
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_album public.albums;
  target_status text;
  requested_cover uuid;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb
     or exists (
       select 1 from jsonb_object_keys(p_changes) as keys(key)
       where key not in ('title', 'slug', 'description', 'event_name', 'category', 'event_date', 'status', 'cover_media_id')
     ) then
    raise exception 'invalid album changes' using errcode = '22023';
  end if;

  target_status := coalesce(p_changes ->> 'status', (select status from public.albums where id = p_album_id));
  if target_status not in ('draft', 'published') then
    raise exception 'invalid album status' using errcode = '22023';
  end if;
  if target_status = 'published' and exists (
    select 1 from public.media
    where album_id = p_album_id and deleted_at is null
      and status not in ('approved', 'published')
  ) then
    raise exception 'album contains media that is not approved' using errcode = '23514';
  end if;

  requested_cover := case
    when p_changes ? 'cover_media_id' and nullif(p_changes ->> 'cover_media_id', '') is not null
      then (p_changes ->> 'cover_media_id')::uuid
    when p_changes ? 'cover_media_id' then null
    else null
  end;
  if requested_cover is not null and not exists (
    select 1 from public.media
    where id = requested_cover and album_id = p_album_id and status in ('approved', 'published')
      and deleted_at is null
  ) then
    raise exception 'cover media must be approved and belong to this album' using errcode = '23514';
  end if;

  update public.albums
  set title = case when p_changes ? 'title' then trim(p_changes ->> 'title') else title end,
      slug = case when p_changes ? 'slug' then trim(p_changes ->> 'slug') else slug end,
      description = case when p_changes ? 'description' then nullif(trim(p_changes ->> 'description'), '') else description end,
      event_name = case when p_changes ? 'event_name' then nullif(trim(p_changes ->> 'event_name'), '') else event_name end,
      category = case when p_changes ? 'category' then nullif(trim(p_changes ->> 'category'), '') else category end,
      event_date = case when p_changes ? 'event_date' then nullif(p_changes ->> 'event_date', '')::date else event_date end,
      cover_media_id = case when p_changes ? 'cover_media_id' then requested_cover else cover_media_id end,
      status = target_status,
      published_at = case
        when target_status = 'published' then coalesce(published_at, now())
        else null
      end
  where id = p_album_id and deleted_at is null
  returning * into updated_album;
  if not found then
    raise exception 'album not found' using errcode = 'P0002';
  end if;
  update public.media
  set status = case when target_status = 'published' then 'published' else 'approved' end,
      published_at = case
        when target_status = 'published' then coalesce(published_at, now())
        else null
      end
  where album_id = p_album_id and deleted_at is null and status in ('approved', 'published');

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'album.updated', 'album', p_album_id,
    jsonb_build_object('changed_fields', (select coalesce(jsonb_agg(key), '[]'::jsonb) from jsonb_object_keys(p_changes) as keys(key))));
  return updated_album;
end;
$$;

create or replace function public.admin_delete_album(p_album_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  if p_confirm is not true then
    raise exception 'explicit confirmation is required' using errcode = '22023';
  end if;
  update public.albums set status = 'draft', deleted_at = now(), cover_media_id = null
  where id = p_album_id and deleted_at is null;
  if not found then
    raise exception 'album not found' using errcode = 'P0002';
  end if;
  update public.media set status = 'deleted', deleted_at = now(), published_at = null
  where album_id = p_album_id and deleted_at is null;
  update public.upload_jobs j
  set status = 'dead_letter', error_code = 'media_deleted', completed_at = now()
  where j.status = 'queued' and exists (
    select 1 from public.media m
    where m.id = j.media_id and m.album_id = p_album_id and m.deleted_at is not null
  );
  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (auth.uid(), 'album.deleted', 'album', p_album_id);
end;
$$;

create or replace function public.admin_create_uploads(p_album_id uuid, p_files jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  file_count integer;
  total_bytes bigint := 0;
  file_size bigint;
  file_id uuid;
  file_path text;
  inserted jsonb := '[]'::jsonb;
  limits public.media_settings;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  select * into limits from public.media_settings where singleton;
  if jsonb_typeof(p_files) <> 'array' then
    raise exception 'files must be an array' using errcode = '22023';
  end if;
  file_count := jsonb_array_length(p_files);
  if file_count < 1 or file_count > limits.max_batch_files then
    raise exception 'a batch must contain between 1 and 10 files' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = auth.uid() for update;
  if not exists (select 1 from public.albums where id = p_album_id and deleted_at is null) then
    raise exception 'album not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.media
      where uploader_id = auth.uid() and status = 'awaiting_upload') + file_count > limits.max_concurrent_uploads then
    raise exception 'upload concurrency limit reached' using errcode = '54000';
  end if;

  for item in select value from jsonb_array_elements(p_files)
  loop
    file_size := (item ->> 'file_size_bytes')::bigint;
    total_bytes := total_bytes + file_size;
    if item ->> 'declared_mime_type' not in ('image/jpeg', 'image/png', 'image/webp')
       or file_size not between 1 and limits.max_upload_bytes
       or item ->> 'alt' is null or length(trim(item ->> 'alt')) not between 1 and 300
       or item ->> 'original_filename' is null
       or length(trim(item ->> 'original_filename')) not between 1 and 255
       or item ->> 'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'invalid upload record' using errcode = '22023';
    end if;
    file_id := (item ->> 'id')::uuid;
    file_path := item ->> 'quarantine_path';
    if file_path !~ ('^' || auth.uid()::text || '/' || file_id::text || '/[0-9a-f-]{36}$') then
      raise exception 'invalid quarantine path' using errcode = '22023';
    end if;
  end loop;
  if total_bytes > limits.max_batch_bytes then
    raise exception 'batch size exceeds 250 MiB' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('public.media_storage_quota', 0));
  if (select coalesce(sum(file_size_bytes), 0) from public.media where deleted_at is null) + total_bytes > limits.max_organization_bytes then
    raise exception 'organization storage quota reached' using errcode = '54000';
  end if;
  if (select coalesce(sum(file_size_bytes), 0) from public.media where uploader_id = auth.uid() and deleted_at is null) + total_bytes > limits.max_admin_bytes then
    raise exception 'administrator storage quota reached' using errcode = '54000';
  end if;

  for item in select value from jsonb_array_elements(p_files)
  loop
    insert into public.media (
      id, album_id, uploader_id, original_filename, quarantine_path,
      file_size_bytes, declared_mime_type, alt, caption
    ) values (
      (item ->> 'id')::uuid, p_album_id, auth.uid(), trim(item ->> 'original_filename'),
      item ->> 'quarantine_path', (item ->> 'file_size_bytes')::bigint,
      item ->> 'declared_mime_type', trim(item ->> 'alt'), nullif(trim(item ->> 'caption'), '')
    );
    inserted := inserted || jsonb_build_array(jsonb_build_object(
      'id', item ->> 'id', 'quarantine_path', item ->> 'quarantine_path',
      'file_size_bytes', (item ->> 'file_size_bytes')::bigint
    ));
  end loop;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'upload.authorized', 'album', p_album_id,
    jsonb_build_object('file_count', file_count, 'total_bytes', total_bytes));
  return inserted;
end;
$$;

create or replace function public.admin_complete_upload(p_media_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  upload_job_id uuid;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  insert into public.upload_jobs (media_id)
  select id from public.media
  where id = p_media_id and uploader_id = auth.uid() and status = 'awaiting_upload'
  returning id into upload_job_id;
  if upload_job_id is null then
    raise exception 'upload is not available for processing' using errcode = 'P0002';
  end if;
  update public.media set status = 'uploaded' where id = p_media_id;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (auth.uid(), 'upload.completed', 'media', p_media_id);
  return upload_job_id;
end;
$$;

create or replace function public.admin_retry_upload(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_media public.media;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  select * into target_media from public.media
  where id = p_media_id and deleted_at is null
    and status in ('scan_failed', 'processing_failed')
  for update;
  if not found then
    raise exception 'failed upload not found' using errcode = 'P0002';
  end if;
  update public.upload_jobs
  set status = 'queued', error_code = null, retry_count = 0,
      available_at = now(), started_at = null, completed_at = null
  where media_id = p_media_id and status in ('failed', 'dead_letter');
  if not found then
    raise exception 'upload is not eligible for retry' using errcode = '23514';
  end if;
  update public.media
  set status = 'uploaded', scan_status = 'pending', processing_status = 'pending'
  where id = p_media_id;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (auth.uid(), 'media.retry_requested', 'media', p_media_id);
end;
$$;

create or replace function public.admin_set_media_status(p_media_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  media_album_id uuid;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  if p_status not in ('published', 'approved') then
    raise exception 'invalid media status' using errcode = '22023';
  end if;
  select album_id into media_album_id from public.media
  where id = p_media_id and deleted_at is null and status in ('approved', 'published');
  if not found then
    raise exception 'media is not approved' using errcode = '23514';
  end if;
  if p_status = 'published' and not exists (
    select 1 from public.albums where id = media_album_id and status = 'published' and deleted_at is null
  ) then
    raise exception 'publish the album before its media' using errcode = '23514';
  end if;
  update public.media set status = p_status,
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else null end
  where id = p_media_id;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (auth.uid(), case when p_status = 'published' then 'media.published' else 'media.unpublished' end, 'media', p_media_id);
end;
$$;

create or replace function public.admin_reorder_media(p_album_id uuid, p_media_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_count integer;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  select count(*) into expected_count
  from public.media where album_id = p_album_id and deleted_at is null;
  if coalesce(cardinality(p_media_ids), 0) <> expected_count
     or (select count(distinct value) from unnest(p_media_ids) as items(value)) <> expected_count
     or exists (
       select 1 from unnest(p_media_ids) as requested(id)
       where not exists (
         select 1 from public.media m where m.id = requested.id
           and m.album_id = p_album_id and m.deleted_at is null
       )
     ) then
    raise exception 'media order must contain every album item exactly once' using errcode = '22023';
  end if;
  update public.media m
  set sort_order = ordered.position - 1
  from unnest(p_media_ids) with ordinality as ordered(id, position)
  where m.id = ordered.id;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (auth.uid(), 'media.reordered', 'album', p_album_id);
end;
$$;

create or replace function public.admin_move_media(p_media_id uuid, p_album_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_album_id uuid;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  select album_id into old_album_id
  from public.media where id = p_media_id and deleted_at is null for update;
  if old_album_id is null or not exists (
    select 1 from public.albums where id = p_album_id and deleted_at is null
  ) then
    raise exception 'media or destination album not found' using errcode = 'P0002';
  end if;
  update public.media set album_id = p_album_id,
    sort_order = (select coalesce(max(sort_order), -1) + 1 from public.media where album_id = p_album_id)
  where id = p_media_id;
  update public.albums set cover_media_id = null
  where id = old_album_id and cover_media_id = p_media_id;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'media.moved', 'media', p_media_id,
    jsonb_build_object('from_album_id', old_album_id, 'to_album_id', p_album_id));
end;
$$;

create or replace function public.admin_delete_media(p_media_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_album_id uuid;
begin
  if public.current_app_role() not in ('SUPER_ADMIN', 'MEDIA_ADMIN') then
    raise exception 'media administrator required' using errcode = '42501';
  end if;
  if p_confirm is not true then
    raise exception 'explicit confirmation is required' using errcode = '22023';
  end if;
  update public.media set status = 'deleted', deleted_at = now(), published_at = null
  where id = p_media_id and deleted_at is null
  returning album_id into target_album_id;
  if target_album_id is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;
  update public.upload_jobs
  set status = 'dead_letter', error_code = 'media_deleted', completed_at = now()
  where media_id = p_media_id and status = 'queued';
  update public.albums set cover_media_id = null
  where id = target_album_id and cover_media_id = p_media_id;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (auth.uid(), 'media.deleted', 'media', p_media_id);
end;
$$;

create or replace function public.super_admin_assign_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_role text;
begin
  if public.current_app_role() <> 'SUPER_ADMIN' then
    raise exception 'Super Admin required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'self role changes are not allowed' using errcode = '22023';
  end if;
  if p_role not in ('MEDIA_ADMIN', 'REGULAR_USER') then
    raise exception 'only Media Admin and Regular User roles may be assigned' using errcode = '22023';
  end if;
  select role into old_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if old_role = 'SUPER_ADMIN' then
    raise exception 'Super Admin roles are managed only through bootstrap' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'user.role_changed', 'user', p_user_id,
    jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

create or replace function public.super_admin_set_account_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role text;
  active_super_admins integer;
begin
  if public.current_app_role() <> 'SUPER_ADMIN' then
    raise exception 'Super Admin required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'self account changes are not allowed' using errcode = '22023';
  end if;
  if p_active is null then
    raise exception 'active status is required' using errcode = '22023';
  end if;
  perform 1 from public.profiles
  where role = 'SUPER_ADMIN' and active
  order by id for update;
  select role into target_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if not p_active and target_role = 'SUPER_ADMIN' then
    select count(*) into active_super_admins from public.profiles
    where role = 'SUPER_ADMIN' and active;
    if active_super_admins <= 1 then
      raise exception 'at least one active Super Admin must remain' using errcode = '23514';
    end if;
  end if;
  update public.profiles set active = p_active where id = p_user_id;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (auth.uid(), case when p_active then 'user.activated' else 'user.deactivated' end, 'user', p_user_id);
end;
$$;

create or replace function public.claim_media_purge()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  media_id uuid;
  result jsonb;
  limits public.media_settings;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into limits from public.media_settings where singleton;
  update public.media
  set status = 'expired', deleted_at = now()
  where status = 'awaiting_upload'
    and created_at < now() - make_interval(hours => limits.pending_upload_hours);

  select id into media_id
  from public.media
  where status in ('deleted', 'expired', 'rejected', 'scan_failed', 'processing_failed')
    and coalesce(deleted_at, updated_at) < now() - make_interval(days => limits.retention_days)
    and (purge_claimed_at is null or purge_claimed_at < now() - interval '30 minutes')
  order by coalesce(deleted_at, updated_at)
  limit 1
  for update skip locked;
  if media_id is null then
    return null;
  end if;
  update public.media set purge_claimed_at = now() where id = media_id;
  select jsonb_build_object(
    'id', m.id,
    'quarantine_path', m.quarantine_path,
    'variant_paths', coalesce(jsonb_agg(v.storage_path) filter (where v.storage_path is not null), '[]'::jsonb)
  ) into result
  from public.media m
  left join public.media_variants v on v.media_id = m.id
  where m.id = media_id
  group by m.id;
  return result;
end;
$$;

create or replace function public.complete_media_purge(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  delete from public.media
  where id = p_media_id and purge_claimed_at is not null
    and status in ('deleted', 'expired', 'rejected', 'scan_failed', 'processing_failed');
  if not found then
    raise exception 'media purge claim is no longer valid' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.can_access_quarantine(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.media m
    join public.profiles p on p.id = m.uploader_id
    where m.quarantine_path = object_name
      and m.uploader_id = auth.uid()
      and m.status = 'awaiting_upload'
      and p.active
      and p.role in ('SUPER_ADMIN', 'MEDIA_ADMIN')
  )
$$;

revoke all on function public.admin_create_album(text, text, text, text, text, date) from public, anon;
revoke all on function public.admin_update_album(uuid, jsonb) from public, anon;
revoke all on function public.admin_delete_album(uuid, boolean) from public, anon;
revoke all on function public.admin_create_uploads(uuid, jsonb) from public, anon;
revoke all on function public.admin_complete_upload(uuid) from public, anon;
revoke all on function public.admin_retry_upload(uuid) from public, anon;
revoke all on function public.admin_set_media_status(uuid, text) from public, anon;
grant execute on function public.admin_create_album(text, text, text, text, text, date) to authenticated;
grant execute on function public.admin_update_album(uuid, jsonb) to authenticated;
grant execute on function public.admin_delete_album(uuid, boolean) to authenticated;
grant execute on function public.admin_create_uploads(uuid, jsonb) to authenticated;
grant execute on function public.admin_complete_upload(uuid) to authenticated;
grant execute on function public.admin_retry_upload(uuid) to authenticated;
grant execute on function public.admin_set_media_status(uuid, text) to authenticated;
revoke all on function public.admin_reorder_media(uuid, uuid[]) from public, anon;
revoke all on function public.admin_move_media(uuid, uuid) from public, anon;
revoke all on function public.admin_delete_media(uuid, boolean) from public, anon;
grant execute on function public.admin_reorder_media(uuid, uuid[]) to authenticated;
grant execute on function public.admin_move_media(uuid, uuid) to authenticated;
grant execute on function public.admin_delete_media(uuid, boolean) to authenticated;
revoke all on function public.super_admin_assign_role(uuid, text) from public, anon;
revoke all on function public.super_admin_set_account_active(uuid, boolean) from public, anon;
grant execute on function public.super_admin_assign_role(uuid, text) to authenticated;
grant execute on function public.super_admin_set_account_active(uuid, boolean) to authenticated;
revoke all on function public.can_access_quarantine(text) from public, anon;
grant execute on function public.can_access_quarantine(text) to authenticated;
revoke all on function public.claim_media_purge() from public, anon, authenticated;
revoke all on function public.complete_media_purge(uuid) from public, anon, authenticated;
grant execute on function public.claim_media_purge() to service_role;
grant execute on function public.complete_media_purge(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media-quarantine', 'media-quarantine', false, 52428800, array['image/jpeg', 'image/png', 'image/webp']),
  ('media-processed', 'media-processed', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins can upload only pre-authorized quarantine objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media-quarantine'
    and public.can_access_quarantine(name)
  );
create policy "Admins can inspect only their pending quarantine objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media-quarantine'
    and public.can_access_quarantine(name)
  );

-- Processed and quarantine objects remain private. Uploads are possible only
-- after an authenticated database reservation creates the exact object path.
