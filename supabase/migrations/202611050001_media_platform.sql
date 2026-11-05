create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'REGULAR_USER'
    check (role in ('SUPER_ADMIN', 'MEDIA_ADMIN', 'REGULAR_USER')),
  active boolean not null default true,
  display_name text check (display_name is null or length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (description is null or length(description) <= 5000),
  event_name text check (event_name is null or length(event_name) <= 200),
  category text check (category is null or length(category) <= 120),
  event_date date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  cover_media_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index albums_publication_idx on public.albums (status, published_at desc)
  where deleted_at is null;
create index albums_event_date_idx on public.albums (event_date desc)
  where deleted_at is null;

create table public.media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete restrict,
  type text not null default 'photo' check (type = 'photo'),
  uploader_id uuid references public.profiles (id) on delete set null,
  original_filename text not null check (length(trim(original_filename)) between 1 and 255),
  quarantine_path text not null unique,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 52428800),
  declared_mime_type text not null check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  detected_mime_type text check (detected_mime_type is null or detected_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  alt text not null check (length(trim(alt)) between 1 and 300),
  caption text check (caption is null or length(caption) <= 2000),
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'awaiting_upload'
    check (status in ('awaiting_upload', 'uploaded', 'scanning', 'processing', 'approved', 'published', 'rejected', 'scan_failed', 'processing_failed', 'expired', 'deleted')),
  scan_status text not null default 'pending'
    check (scan_status in ('pending', 'scanning', 'clean', 'infected', 'failed')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'complete', 'failed')),
  published_at timestamptz,
  purge_claimed_at timestamptz,
  quarantine_purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index media_album_order_idx on public.media (album_id, sort_order, created_at)
  where deleted_at is null;
create index media_publication_idx on public.media (album_id, status, sort_order)
  where deleted_at is null;
create index media_uploader_created_idx on public.media (uploader_id, created_at desc);
create index media_pending_uploads_idx on public.media (uploader_id, created_at)
  where status = 'awaiting_upload';

alter table public.albums
  add constraint albums_cover_media_fk
  foreign key (cover_media_id) references public.media (id) on delete set null;

create table public.media_variants (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media (id) on delete cascade,
  variant_type text not null check (variant_type in ('thumbnail', 'medium', 'large')),
  storage_path text not null unique,
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 26214400),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (media_id, variant_type)
);

create table public.upload_jobs (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null unique references public.media (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'complete', 'failed', 'dead_letter')),
  error_code text check (error_code is null or length(error_code) <= 80),
  retry_count integer not null default 0 check (retry_count between 0 and 5),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index upload_jobs_claim_idx on public.upload_jobs (available_at, created_at)
  where status = 'queued';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (length(action) between 1 and 100),
  resource_type text not null check (length(resource_type) between 1 and 50),
  resource_id uuid,
  request_id text check (request_id is null or length(request_id) <= 100),
  metadata jsonb not null default '{}'::jsonb
    check (pg_column_size(metadata) <= 8192),
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create table public.media_settings (
  singleton boolean primary key default true check (singleton),
  max_upload_bytes bigint not null default 52428800 check (max_upload_bytes between 1 and 52428800),
  max_batch_files integer not null default 10 check (max_batch_files between 1 and 10),
  max_batch_bytes bigint not null default 262144000 check (max_batch_bytes between 1 and 262144000),
  max_concurrent_uploads integer not null default 3 check (max_concurrent_uploads between 1 and 3),
  max_image_pixels bigint not null default 40000000 check (max_image_pixels between 1 and 40000000),
  max_image_dimension integer not null default 10000 check (max_image_dimension between 1 and 10000),
  max_variant_bytes bigint not null default 26214400 check (max_variant_bytes between 1 and 26214400),
  max_organization_bytes bigint not null default 5368709120 check (max_organization_bytes between 1 and 107374182400),
  max_admin_bytes bigint not null default 1073741824 check (max_admin_bytes between 1 and 21474836480),
  quarantine_retention_days integer not null default 7 check (quarantine_retention_days between 1 and 90),
  retention_days integer not null default 30 check (retention_days between 7 and 365),
  pending_upload_hours integer not null default 24 check (pending_upload_hours between 1 and 168),
  updated_at timestamptz not null default now()
);

create or replace function public.audit_media_settings_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (actor_id, action, resource_type, metadata)
  values (auth.uid(), 'media.settings_updated', 'settings',
    jsonb_build_object(
      'before', to_jsonb(old) - 'updated_at',
      'after', to_jsonb(new) - 'updated_at'
    ));
  return new;
end;
$$;

insert into public.media_settings (singleton) values (true);

create table public.bootstrap_state (
  singleton boolean primary key default true check (singleton),
  claimed_at timestamptz,
  consumed_at timestamptz
);

insert into public.bootstrap_state (singleton) values (true);

alter table public.media_settings enable row level security;
alter table public.bootstrap_state enable row level security;
revoke all on public.media_settings from public, anon, authenticated;
revoke all on public.bootstrap_state from public, anon, authenticated;
grant select on public.media_settings to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger albums_updated_at before update on public.albums
  for each row execute function public.set_updated_at();
create trigger media_updated_at before update on public.media
  for each row execute function public.set_updated_at();
create trigger upload_jobs_updated_at before update on public.upload_jobs
  for each row execute function public.set_updated_at();
create trigger media_settings_updated_at before update on public.media_settings
  for each row execute function public.set_updated_at();
create trigger media_settings_audit after update on public.media_settings
  for each row execute function public.audit_media_settings_update();

create or replace function public.claim_super_admin_bootstrap()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  state public.bootstrap_state;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into state from public.bootstrap_state where singleton for update;
  if state.consumed_at is not null
     or exists (select 1 from public.profiles where role = 'SUPER_ADMIN')
     or (state.claimed_at is not null and state.claimed_at > now() - interval '30 minutes') then
    return false;
  end if;
  update public.bootstrap_state set claimed_at = now() where singleton;
  return true;
end;
$$;

create or replace function public.complete_super_admin_bootstrap(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.bootstrap_state
    where singleton and claimed_at is not null and consumed_at is null
  ) or not exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'SUPER_ADMIN' and active
  ) then
    raise exception 'Super Admin bootstrap is not available' using errcode = '23514';
  end if;
  update public.bootstrap_state set consumed_at = now() where singleton;
  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (p_user_id, 'super_admin.bootstrapped', 'user', p_user_id);
end;
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create or replace function public.is_media_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_app_role() in ('SUPER_ADMIN', 'MEDIA_ADMIN'), false)
$$;

alter table public.profiles enable row level security;
alter table public.albums enable row level security;
alter table public.media enable row level security;
alter table public.media_variants enable row level security;
alter table public.upload_jobs enable row level security;
alter table public.audit_logs enable row level security;

create policy "Profiles are visible to their owner and Super Admins"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.current_app_role() = 'SUPER_ADMIN');
create policy "Published albums are public"
  on public.albums for select to anon, authenticated
  using (status = 'published' and deleted_at is null);
create policy "Media admins can read all albums"
  on public.albums for select to authenticated
  using (public.is_media_admin());
create policy "Media admins manage albums"
  on public.albums for all to authenticated
  using (public.is_media_admin()) with check (public.is_media_admin());
create policy "Published media in published albums are public"
  on public.media for select to anon, authenticated
  using (
    status = 'published' and deleted_at is null and exists (
      select 1 from public.albums a
      where a.id = album_id and a.status = 'published' and a.deleted_at is null
    )
  );
create policy "Media admins can read all media"
  on public.media for select to authenticated
  using (public.is_media_admin());
create policy "Media admins manage media"
  on public.media for all to authenticated
  using (public.is_media_admin()) with check (public.is_media_admin());
create policy "Published media variants are readable"
  on public.media_variants for select to anon, authenticated
  using (exists (
    select 1 from public.media m join public.albums a on a.id = m.album_id
    where m.id = media_id and m.status = 'published' and m.deleted_at is null
      and a.status = 'published' and a.deleted_at is null
  ));
create policy "Media admins can read all variants"
  on public.media_variants for select to authenticated
  using (public.is_media_admin());
create policy "Media admins manage variants"
  on public.media_variants for all to authenticated
  using (public.is_media_admin()) with check (public.is_media_admin());
create policy "Media admins can read upload jobs"
  on public.upload_jobs for select to authenticated
  using (public.is_media_admin());
create policy "Super Admins can read audit logs"
  on public.audit_logs for select to authenticated
  using (public.current_app_role() = 'SUPER_ADMIN');

revoke all on public.profiles, public.albums, public.media, public.media_variants,
  public.upload_jobs, public.audit_logs from anon, authenticated;
grant select on public.profiles, public.albums, public.media, public.media_variants,
  public.upload_jobs, public.audit_logs to anon, authenticated;

create or replace function public.claim_upload_job()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_id uuid;
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update public.upload_jobs
  set status = case when retry_count < 3 then 'queued' else 'dead_letter' end,
      error_code = 'worker_timeout',
      available_at = now() + interval '30 seconds'
  where status = 'processing' and started_at < now() - interval '30 minutes';
  update public.media m
  set status = 'processing_failed',
      scan_status = case when m.scan_status = 'scanning' then 'failed' else m.scan_status end,
      processing_status = 'failed'
  from public.upload_jobs j
  where j.media_id = m.id and j.status = 'dead_letter' and j.error_code = 'worker_timeout'
    and m.status in ('scanning', 'processing') and m.deleted_at is null;

  select j.id into job_id
  from public.upload_jobs j
  where j.status = 'queued' and j.available_at <= now()
    and exists (
      select 1 from public.media m
      where m.id = j.media_id and m.deleted_at is null
        and m.status in ('uploaded', 'scan_failed', 'processing_failed')
    )
  order by j.created_at
  limit 1
  for update skip locked;

  if job_id is null then
    return null;
  end if;

  update public.upload_jobs
  set status = 'processing', retry_count = retry_count + 1, started_at = now()
  where id = job_id;
  update public.media m set status = 'scanning', scan_status = 'scanning'
  from public.upload_jobs j where j.id = job_id and m.id = j.media_id and m.deleted_at is null;

  select jsonb_build_object('job', to_jsonb(j), 'media', to_jsonb(m))
  into result
  from public.upload_jobs j join public.media m on m.id = j.media_id
  where j.id = job_id;
  return result;
end;
$$;

create or replace function public.complete_upload_job(
  p_job_id uuid, p_checksum_sha256 text, p_detected_mime_type text,
  p_width integer, p_height integer, p_variants jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  limits public.media_settings;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into limits from public.media_settings where singleton;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) <> 3 then
    raise exception 'exactly three image variants are required' using errcode = '22023';
  end if;
  if p_detected_mime_type is null or p_detected_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'unsupported detected image type' using errcode = '22023';
  end if;
  if p_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid source checksum' using errcode = '22023';
  end if;
  if p_width not between 1 and limits.max_image_dimension
     or p_height not between 1 and limits.max_image_dimension
     or p_width::bigint * p_height::bigint > limits.max_image_pixels then
    raise exception 'image dimensions exceed configured limits' using errcode = '22023';
  end if;
  if not exists (select 1 from public.upload_jobs where id = p_job_id and status = 'processing') then
    raise exception 'upload job is not processing' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.upload_jobs j join public.media m on m.id = j.media_id
    where j.id = p_job_id and m.deleted_at is null
      and m.status in ('scanning', 'processing')
  ) then
    raise exception 'media is no longer available for processing' using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(p_variants)
  loop
    if item ->> 'variant_type' not in ('thumbnail', 'medium', 'large')
       or item ->> 'storage_path' is null
       or item ->> 'checksum_sha256' !~ '^[a-f0-9]{64}$'
       or (item ->> 'width') !~ '^[1-9][0-9]{0,4}$'
       or (item ->> 'height') !~ '^[1-9][0-9]{0,4}$'
       or (item ->> 'file_size_bytes') !~ '^[1-9][0-9]*$'
       or (item ->> 'file_size_bytes')::bigint > limits.max_variant_bytes then
      raise exception 'invalid image variant' using errcode = '22023';
    end if;
  end loop;

  insert into public.media_variants
    (media_id, variant_type, storage_path, width, height, file_size_bytes, checksum_sha256)
  select j.media_id, v.variant_type, v.storage_path, v.width, v.height, v.file_size_bytes, v.checksum_sha256
  from public.upload_jobs j
  cross join jsonb_to_recordset(p_variants) as v(
    variant_type text, storage_path text, width integer, height integer,
    file_size_bytes bigint, checksum_sha256 text
  )
  where j.id = p_job_id
  on conflict (media_id, variant_type) do update set
    storage_path = excluded.storage_path, width = excluded.width, height = excluded.height,
    file_size_bytes = excluded.file_size_bytes, checksum_sha256 = excluded.checksum_sha256;

  update public.media m
  set status = 'approved', scan_status = 'clean', processing_status = 'complete',
      detected_mime_type = p_detected_mime_type, checksum_sha256 = p_checksum_sha256,
      width = p_width, height = p_height
  from public.upload_jobs j where j.id = p_job_id and m.id = j.media_id and m.deleted_at is null;
  update public.upload_jobs set status = 'complete', completed_at = now(), error_code = null
  where id = p_job_id;
  insert into public.audit_logs (action, resource_type, resource_id)
  select 'media.approved', 'media', j.media_id
  from public.upload_jobs j where j.id = p_job_id;
end;
$$;

create or replace function public.begin_upload_processing(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.media m
  set status = 'processing', scan_status = 'clean', processing_status = 'processing'
  from public.upload_jobs j
  where j.id = p_job_id and j.status = 'processing' and m.id = j.media_id and m.deleted_at is null;
  if not found then
    raise exception 'upload job is not processing' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.fail_upload_job(p_job_id uuid, p_error_code text, p_retry boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.upload_jobs;
  new_job_status text;
  new_media_status text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'invalid error code' using errcode = '22023';
  end if;
  select * into job from public.upload_jobs where id = p_job_id and status = 'processing' for update;
  if not found then
    raise exception 'upload job is not processing' using errcode = '23514';
  end if;

  new_job_status := case when p_retry and job.retry_count < 3 then 'queued' else 'dead_letter' end;
  new_media_status := case
    when p_error_code in ('virus_detected', 'invalid_image') then 'rejected'
    when p_error_code like 'scan_%' then 'scan_failed'
    else 'processing_failed'
  end;
  update public.upload_jobs
  set status = new_job_status, error_code = p_error_code,
      available_at = now() + make_interval(secs => least(300, 5 * (2 ^ retry_count)::integer))
  where id = p_job_id;
  update public.media m
  set status = new_media_status,
      scan_status = case
        when p_error_code = 'virus_detected' then 'infected'
        when p_error_code = 'invalid_image' then 'failed'
        when p_error_code like 'scan_%' then 'failed'
        else scan_status
      end,
      processing_status = case when p_error_code like 'processing_%' then 'failed' else processing_status end
  from public.upload_jobs j where j.id = p_job_id and m.id = j.media_id and m.deleted_at is null;
  insert into public.audit_logs (action, resource_type, resource_id, metadata)
  select 'media.processing_failed', 'media', j.media_id,
    jsonb_build_object('error_code', p_error_code, 'will_retry', new_job_status = 'queued')
  from public.upload_jobs j where j.id = p_job_id;
end;
$$;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_media_admin() from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_media_admin() to authenticated;
revoke all on function public.claim_upload_job() from public, anon, authenticated;
revoke all on function public.complete_upload_job(uuid, text, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.begin_upload_processing(uuid) from public, anon, authenticated;
revoke all on function public.fail_upload_job(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_upload_job() to service_role;
grant execute on function public.complete_upload_job(uuid, text, text, integer, integer, jsonb) to service_role;
grant execute on function public.begin_upload_processing(uuid) to service_role;
grant execute on function public.fail_upload_job(uuid, text, boolean) to service_role;
revoke all on function public.claim_super_admin_bootstrap() from public, anon, authenticated;
revoke all on function public.complete_super_admin_bootstrap(uuid) from public, anon, authenticated;
grant execute on function public.claim_super_admin_bootstrap() to service_role;
grant execute on function public.complete_super_admin_bootstrap(uuid) to service_role;
