-- R1 only. No external actions. Existing upload IDs are source authority.
-- Legacy rows deliberately retain unknown lifecycle; never infer historical success.
alter table public.voice_asset_write_intents
  add column source_lifecycle_known boolean not null default false,
  add column first_registered_at timestamptz,
  add column first_registration_intent_id uuid,
  add column cleanup_due_at timestamptz,
  add column cleanup_state text,
  add column cleanup_authorized_at timestamptz,
  add column cleanup_completed_at timestamptz,
  add column cleanup_lease_token uuid,
  add column cleanup_lease_expires_at timestamptz,
  add column cleanup_attempt_count integer not null default 0,
  add column cleanup_failure text,
  add column registration_consent_id uuid,
  add column registration_provider text,
  add column registration_source_read_started_at timestamptz,
  add column registration_dispatched_at timestamptz,
  add column registration_voice_id uuid;
alter table public.voice_asset_write_intents
  add constraint r1_intent_owner_unique unique(id,user_id),
  add constraint r1_first_registration_owner_fk foreign key(first_registration_intent_id,user_id)
    references public.voice_asset_write_intents(id,user_id) deferrable initially deferred,
  add constraint r1_source_clock check (
    (first_registered_at is null and first_registration_intent_id is null and cleanup_due_at is null)
    or (first_registered_at is not null and first_registration_intent_id is not null
      and cleanup_due_at is not null and cleanup_due_at = first_registered_at + interval '24 hours')),
  add constraint r1_cleanup_shape check (
    cleanup_state is null or (source_lifecycle_known and status='completed'
      and kind in ('voice_sample_upload','voice_consent_upload')
      and cleanup_state in ('available','claimed','completed','manual_required'))),
  add constraint r1_cleanup_terminal check (
    (cleanup_state is distinct from 'completed' and cleanup_completed_at is null)
    or (cleanup_state='completed' and cleanup_completed_at is not null and cleanup_authorized_at is not null)),
  add constraint r1_cleanup_lease check ((cleanup_lease_token is null)=(cleanup_lease_expires_at is null)),
  add constraint r1_cleanup_attempts check (cleanup_attempt_count>=0);
-- Conflicting legacy locators remain unknown. All admission checks exact cardinality;
-- new known sources cannot duplicate each other, or any legacy locator (RPC check).
create unique index r1_known_source_locator on public.voice_asset_write_intents(user_id,storage_bucket,storage_object_key)
  where source_lifecycle_known;
create index r1_cleanup_due on public.voice_asset_write_intents(id) where cleanup_due_at is not null and cleanup_state<>'completed';
create table public.voice_source_uses (
  source_upload_intent_id uuid not null,
  registration_intent_id uuid not null,
  user_id uuid not null,
  requires_audio boolean not null,
  primary key(source_upload_intent_id,registration_intent_id),
  foreign key(source_upload_intent_id,user_id) references public.voice_asset_write_intents(id,user_id) on delete cascade,
  foreign key(registration_intent_id,user_id) references public.voice_asset_write_intents(id,user_id) on delete cascade
);
create index r1_uses_registration on public.voice_source_uses(registration_intent_id);
alter table public.voice_source_uses enable row level security;
revoke all on public.voice_source_uses from public,anon,authenticated,service_role;
alter table public.voice_asset_write_intents
  drop constraint voice_asset_write_intents_kind_check,
  drop constraint voice_asset_write_intents_shape_check;

alter table public.voice_asset_write_intents
  add constraint voice_asset_write_intents_kind_check check (
    kind in ('voice_consent_create', 'voice_create', 'script_audio_create', 'voice_sample_upload', 'voice_consent_upload', 'recording_upload')
  ),
  add constraint voice_asset_write_intents_shape_check check (
    (kind in ('voice_create', 'voice_consent_create')
      and script_id is null and voice_id is null and cache_key is null
      and storage_bucket is null and storage_object_key is null)
    or
    (kind = 'script_audio_create'
      and script_id is not null and voice_id is not null and nullif(cache_key, '') is not null
      and (
        (status in ('reserved', 'manual_required')
          and storage_bucket = 'script-audios' and nullif(storage_object_key, '') is not null)
        or
        (status in ('completed', 'cancelled')
          and storage_bucket is null and storage_object_key is null)
      ))
    or
    (kind = 'voice_sample_upload'
      and script_id is null and voice_id is null and cache_key is null
      and (
        (status in ('reserved', 'completed', 'manual_required')
          and storage_bucket = 'voice-samples' and nullif(storage_object_key, '') is not null)
        or
        (status = 'cancelled' and storage_bucket is null and storage_object_key is null)
      ))
    or
    (kind = 'voice_consent_upload'
      and script_id is null and voice_id is null and cache_key is null
      and (
        (status in ('reserved', 'completed', 'manual_required')
          and storage_bucket = 'voice-consents' and nullif(storage_object_key, '') is not null)
        or
        (status = 'cancelled' and storage_bucket is null and storage_object_key is null)
      ))
    or
    (kind = 'recording_upload'
      and script_id is not null and voice_id is null and cache_key is null
      and (
        (status in ('reserved', 'completed', 'manual_required')
          and storage_bucket = 'recordings' and nullif(storage_object_key, '') is not null)
        or
        (status = 'cancelled' and storage_bucket is null and storage_object_key is null)
      ))
  );


alter function public.reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text) rename to r1_base_reserve_voice_asset_write_intent;
revoke all on function public.r1_base_reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

alter function public.finalize_voice_upload_write_intent(uuid,uuid,uuid,text,text) rename to r1_base_finalize_voice_upload_write_intent;
revoke all on function public.r1_base_finalize_voice_upload_write_intent(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

alter function public.finalize_voice_create_write_intent(uuid,uuid,uuid,uuid,text,text,text) rename to r1_base_finalize_voice_create_write_intent;
revoke all on function public.r1_base_finalize_voice_create_write_intent(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

alter function public.cancel_voice_asset_write_intent(uuid,uuid,uuid,boolean) rename to r1_base_cancel_voice_asset_write_intent;
revoke all on function public.r1_base_cancel_voice_asset_write_intent(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;

-- Uniform lock order: owner fence, all owned requests (not just held), sources,
-- then use intents. Existing Account request creation takes the same owner fence.
create function public.r1_lock_owner(p_user_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  perform 1 from public.account_deletion_requests where user_id=p_user_id order by id for update;
end; $$;
create function public.r1_safety_reason(p_user_id uuid) returns text
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.account_deletion_requests r where r.user_id=p_user_id
    and public.account_deletion_legal_hold_blocks(r,'storage')) then return 'legal_hold'; end if;
  if exists(select 1 from public.voice_deletion_operations where user_id=p_user_id
    and status in ('pending','processing','partial_failure','manual_required')) then return 'voice_deletion_active'; end if;
  if exists(select 1 from public.account_deletion_requests where user_id=p_user_id
    and status in ('requested','confirmed','processing','provider_cleanup_failed','storage_cleanup_failed','db_cleanup_failed','auth_cleanup_failed'))
    then return 'account_deletion_active'; end if;
  return null;
end; $$;

create function public.reserve_voice_asset_write_intent(
  p_user_id uuid,p_kind text,p_lease_token uuid,p_lease_seconds integer,
  p_script_id uuid default null,p_voice_id uuid default null,p_cache_key text default null,
  p_storage_bucket text default null,p_storage_object_key text default null)
returns public.voice_asset_write_intents language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.voice_asset_write_intents;
begin
  if p_kind in ('voice_create','voice_consent_create') then
    raise exception using errcode='23514',message='source_reservation_required'; end if;
  perform public.r1_lock_owner(p_user_id);
  if p_kind in ('voice_sample_upload','voice_consent_upload') and exists(
    select 1 from public.voice_asset_write_intents where user_id=p_user_id
      and storage_bucket=p_storage_bucket and storage_object_key=p_storage_object_key) then
    raise exception using errcode='23514',message='unsafe_locator_or_ownership'; end if;
  v:=public.r1_base_reserve_voice_asset_write_intent(p_user_id,p_kind,p_lease_token,p_lease_seconds,
    p_script_id,p_voice_id,p_cache_key,p_storage_bucket,p_storage_object_key);
  if p_kind in ('voice_sample_upload','voice_consent_upload') then
    update public.voice_asset_write_intents set source_lifecycle_known=true where id=v.id returning * into v;
  end if;
  return v;
end; $$;
create function public.finalize_voice_upload_write_intent(p_intent_id uuid,p_user_id uuid,p_lease_token uuid,
 p_storage_bucket text,p_storage_object_key text) returns public.voice_asset_write_intents
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.voice_asset_write_intents;
begin
 v:=public.r1_base_finalize_voice_upload_write_intent(p_intent_id,p_user_id,p_lease_token,p_storage_bucket,p_storage_object_key);
 if v.source_lifecycle_known then
   update public.voice_asset_write_intents set cleanup_state='available' where id=v.id returning * into v;
 end if;
 return v;
end; $$;

-- Only canonical completed upload rows can identify an object. Path is a lookup
-- selector, never sufficient authority. Evidence-only joins may outlive audio.
create function public.r1_bind_source(p_operation uuid,p_user_id uuid,p_bucket text,p_path text,p_audio boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.voice_asset_write_intents; k text; n integer;
begin
 if p_path is null then return; end if;
 if left(p_path,length('storage://'||p_bucket||'/')) <> 'storage://'||p_bucket||'/' then
   raise exception using errcode='23514',message='unsafe_locator_or_ownership'; end if;
 k:=substr(p_path,length('storage://'||p_bucket||'/')+1);
 if split_part(k,'/',1)<>p_user_id::text or k ~ '(^|/)(\.|\.\.)(/|$)' or k like '%//%' or right(k,1)='/' then
   raise exception using errcode='23514',message='unsafe_locator_or_ownership'; end if;
 select count(*) into n from public.voice_asset_write_intents where user_id=p_user_id
   and storage_bucket=p_bucket and storage_object_key=k;
 if n<>1 then raise exception using errcode='23514',message='unsafe_locator_or_ownership'; end if;
 select * into s from public.voice_asset_write_intents where user_id=p_user_id
   and storage_bucket=p_bucket and storage_object_key=k for update;
 if s.status<>'completed' or not s.source_lifecycle_known or s.cleanup_state is null
   or (p_bucket='voice-samples' and s.kind<>'voice_sample_upload')
   or (p_bucket='voice-consents' and s.kind<>'voice_consent_upload') then
   raise exception using errcode='23514',message='malformed_canonical_state'; end if;
 if p_audio and (s.cleanup_state<>'available' or s.cleanup_authorized_at is not null
   or s.cleanup_due_at<=clock_timestamp()) then
   raise exception using errcode='23514',message='source_reupload_required'; end if;
 insert into public.voice_source_uses values(s.id,p_operation,p_user_id,p_audio);
end; $$;

create function public.reserve_voice_source_registration(p_user_id uuid,p_kind text,p_lease_token uuid,
 p_consent_id uuid,p_provider text,p_sample_path text default null,p_recording_path text default null)
returns public.voice_asset_write_intents language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.voice_asset_write_intents; c public.voice_consents; reason text; recording text;
begin
 if p_kind is null or p_kind not in ('voice_create','voice_consent_create') or p_consent_id is null
   or p_provider is null or p_provider not in ('mock','elevenlabs','openai') then
   raise exception using errcode='23514',message='malformed_canonical_state'; end if;
 perform public.r1_lock_owner(p_user_id);
 reason:=public.r1_safety_reason(p_user_id);
 if reason is not null then raise exception using errcode='23514',message=reason; end if;
 if p_kind='voice_create' then
   select * into c from public.voice_consents where id=p_consent_id and user_id=p_user_id;
   if not found or c.provider<>p_provider or p_recording_path is not null then
     raise exception using errcode='23514',message='unsafe_locator_or_ownership'; end if;
   if not exists(select 1 from public.processing_consents where user_id=p_user_id
     and consent_type='voice_cloning' and consent_version='2026-08-22.v1' and purpose_id='voice_cloning'
     and purpose_version='v1' and provider_set=array['elevenlabs']::text[]
     and data_categories=array['voice_sample','consent_recording','cloned_voice','reference_audio']::text[] and status='active') then
     raise exception using errcode='23514',message='processing_consent_required'; end if;
   recording:=c.metadata #>> '{recording,audioPath}';
   if p_sample_path is not null and split_part(p_sample_path,'/',5)<>p_consent_id::text then
     raise exception using errcode='23514',message='unsafe_locator_or_ownership'; end if;
 else
   if p_sample_path is not null or exists(select 1 from public.voice_consents where id=p_consent_id) then
     raise exception using errcode='23514',message='malformed_canonical_state'; end if;
   recording:=p_recording_path;
 end if;
 -- Same original unresolved-per-owner index and lease discipline. This internal
 -- helper is inaccessible to callers; the full source set commits atomically.
 v:=public.r1_base_reserve_voice_asset_write_intent(p_user_id,'voice_create',p_lease_token,900);
 update public.voice_asset_write_intents set kind=p_kind,registration_consent_id=p_consent_id,
   registration_provider=p_provider where id=v.id returning * into v;
 -- Lock only the two possible canonical sources, in stable order.
 perform 1 from public.voice_asset_write_intents where user_id=p_user_id
   and ('storage://'||storage_bucket||'/'||storage_object_key) in (p_sample_path,recording) order by id for update;
 perform public.r1_bind_source(v.id,p_user_id,'voice-samples',p_sample_path,true);
 perform public.r1_bind_source(v.id,p_user_id,'voice-consents',recording,p_kind='voice_consent_create');
 return v;
end; $$;

-- Single execution admission. Consent fences its service-owned read separately
-- from Provider dispatch; sample adapters keep the original read/dispatch boundary.
-- No general Provider replay or expired-lease renewal.
-- A token is CAS only; a new request must create a new operation.
create function public.begin_voice_source_registration(p_intent_id uuid,p_user_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.voice_asset_write_intents; reason text;
begin
 perform public.r1_lock_owner(p_user_id);
 reason:=public.r1_safety_reason(p_user_id);
 if reason is not null then raise exception using errcode='23514',message=reason; end if;
 perform 1 from public.voice_asset_write_intents s join public.voice_source_uses u on u.source_upload_intent_id=s.id
   where u.registration_intent_id=p_intent_id order by s.id for update of s;
 select * into v from public.voice_asset_write_intents where id=p_intent_id and user_id=p_user_id for update;
 if not found or v.kind not in ('voice_create','voice_consent_create') or v.registration_consent_id is null
   or v.status<>'reserved' or v.lease_token is distinct from p_lease_token
   or v.lease_expires_at<=clock_timestamp() or v.registration_dispatched_at is not null
   or v.registration_source_read_started_at is not null then
   raise exception using errcode='23514',message='registration_execution_rejected'; end if;
 if exists(select 1 from public.voice_source_uses u join public.voice_asset_write_intents s on s.id=u.source_upload_intent_id
   where u.registration_intent_id=v.id and u.requires_audio
     and (s.user_id<>p_user_id or s.cleanup_state is distinct from 'available' or s.cleanup_authorized_at is not null)) then
   raise exception using errcode='23514',message='source_reupload_required'; end if;
 -- No due check here: this is the already-admitted same operation, still inside
 -- its original execution lease. It cannot attach sources or change context.
 if v.kind='voice_consent_create' then
   update public.voice_asset_write_intents set registration_source_read_started_at=clock_timestamp() where id=v.id;
 else
   update public.voice_asset_write_intents set registration_dispatched_at=clock_timestamp() where id=v.id;
 end if;
 return true;
end; $$;

-- Only the server reader that won begin may report its awaited read outcome.
-- False is called solely from the resolver catch, never a lease reaper or Provider
-- catch. This RPC and dispatch serialize on owner -> sources -> operation locks.
create function public.finish_voice_consent_source_read(p_intent_id uuid,p_user_id uuid,p_lease_token uuid,p_read_succeeded boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.voice_asset_write_intents; reason text;
begin
 perform public.r1_lock_owner(p_user_id);
 perform 1 from public.voice_asset_write_intents s join public.voice_source_uses u on u.source_upload_intent_id=s.id
   where u.registration_intent_id=p_intent_id order by s.id for update of s;
 select * into v from public.voice_asset_write_intents where id=p_intent_id and user_id=p_user_id for update;
 if not found or v.kind<>'voice_consent_create' or v.registration_consent_id is null
   or v.status<>'reserved' or v.lease_token is distinct from p_lease_token or p_lease_token is null
   or v.registration_source_read_started_at is null or v.registration_dispatched_at is not null
   or p_read_succeeded is null then return false; end if;
 if not p_read_succeeded then
   -- Explicit settled-read failure, even if its original lease elapsed meanwhile.
   -- No source/clock/cleanup mutation and no manual_required release.
   update public.voice_asset_write_intents set status='cancelled',lease_token=null,lease_expires_at=null where id=v.id;
   return true;
 end if;
 reason:=public.r1_safety_reason(p_user_id);
 if reason is not null or v.lease_expires_at<=clock_timestamp() then return false; end if;
 if exists(select 1 from public.voice_source_uses u join public.voice_asset_write_intents s on s.id=u.source_upload_intent_id
   where u.registration_intent_id=v.id and u.requires_audio
     and (s.user_id<>p_user_id or s.cleanup_state is distinct from 'available' or s.cleanup_authorized_at is not null)) then
   return false; end if;
 -- Durable permission immediately before the Provider call, not proof of an
 -- external result. Lost response/crash after this point stays unresolved.
 update public.voice_asset_write_intents set registration_dispatched_at=clock_timestamp() where id=v.id;
 return true;
end; $$;

create function public.cancel_voice_asset_write_intent(p_intent_id uuid,p_user_id uuid,p_lease_token uuid,p_known_no_side_effect boolean)
returns public.voice_asset_write_intents language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.r1_lock_owner(p_user_id);
 perform 1 from public.voice_asset_write_intents where id=p_intent_id and user_id=p_user_id for update;
 if exists(select 1 from public.voice_asset_write_intents where id=p_intent_id
   and (registration_dispatched_at is not null or registration_source_read_started_at is not null)) then
   raise exception using errcode='23514',message='registration_execution_unresolved'; end if;
 -- begin and cancel serialize: delayed processes must win begin before any read.
 return public.r1_base_cancel_voice_asset_write_intent(p_intent_id,p_user_id,p_lease_token,p_known_no_side_effect);
end; $$;

create function public.finalize_voice_create_write_intent(p_intent_id uuid,p_user_id uuid,p_lease_token uuid,
 p_consent_id uuid,p_provider_voice_id text,p_label text,p_sample_audio_path text default null)
returns public.voices language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.voice_asset_write_intents; result public.voices; stamp timestamptz; expected_path text;
begin
 perform public.r1_lock_owner(p_user_id);
 perform 1 from public.voice_asset_write_intents s join public.voice_source_uses u on u.source_upload_intent_id=s.id
   where u.registration_intent_id=p_intent_id order by s.id for update of s;
 select * into v from public.voice_asset_write_intents where id=p_intent_id and user_id=p_user_id for update;
 if not found or v.registration_consent_id is distinct from p_consent_id or v.registration_dispatched_at is null
   or v.kind<>'voice_create' then raise exception using errcode='23514',message='registration_finalization_rejected'; end if;
 select 'storage://'||s.storage_bucket||'/'||s.storage_object_key into expected_path
   from public.voice_source_uses u join public.voice_asset_write_intents s on s.id=u.source_upload_intent_id
   where u.registration_intent_id=v.id and s.kind='voice_sample_upload';
 if expected_path is distinct from p_sample_audio_path or not exists(select 1 from public.voice_consents
    where id=p_consent_id and user_id=p_user_id and provider=v.registration_provider) then
   raise exception using errcode='23514',message='registration_context_changed'; end if;
 if exists(select 1 from public.voice_source_uses u join public.voice_asset_write_intents s on s.id=u.source_upload_intent_id
   where u.registration_intent_id=v.id and (not s.source_lifecycle_known or s.status<>'completed'
     or (u.requires_audio and (s.cleanup_state is distinct from 'available' or s.cleanup_authorized_at is not null)))) then
   raise exception using errcode='23514',message='source_reupload_required'; end if;
 -- Response recovery returns only the durable voice; never re-anchors or dispatches.
 if v.status='completed' then
   select * into result from public.voices where id=v.registration_voice_id and user_id=p_user_id;
   if not found then raise exception using errcode='23514',message='registration_result_unavailable'; end if;
   return result;
 end if;
 result:=public.r1_base_finalize_voice_create_write_intent(p_intent_id,p_user_id,p_lease_token,p_consent_id,
   p_provider_voice_id,p_label,p_sample_audio_path);
 stamp:=clock_timestamp();
 update public.voice_asset_write_intents s set first_registered_at=stamp,first_registration_intent_id=v.id,
   cleanup_due_at=stamp+interval '24 hours'
   where s.first_registered_at is null and s.source_lifecycle_known
     and exists(select 1 from public.voice_source_uses u where u.registration_intent_id=v.id and u.source_upload_intent_id=s.id);
 update public.voice_asset_write_intents set registration_voice_id=result.id where id=v.id;
 return result;
end; $$;

create function public.finalize_voice_consent_write_intent(p_intent_id uuid,p_user_id uuid,p_lease_token uuid,
 p_consented_at timestamptz,p_metadata jsonb) returns public.voice_consents
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.voice_asset_write_intents; c public.voice_consents; expected_path text;
begin
 perform public.r1_lock_owner(p_user_id);
 select * into v from public.voice_asset_write_intents where id=p_intent_id and user_id=p_user_id for update;
 if not found or v.kind<>'voice_consent_create' or v.status<>'reserved' or v.registration_dispatched_at is null
   or v.lease_token is distinct from p_lease_token or v.lease_expires_at<=clock_timestamp()
   or p_consented_at is null or jsonb_typeof(p_metadata)<>'object' then
   raise exception using errcode='23514',message='registration_finalization_rejected'; end if;
 select 'storage://'||s.storage_bucket||'/'||s.storage_object_key into expected_path
   from public.voice_source_uses u join public.voice_asset_write_intents s on s.id=u.source_upload_intent_id
   where u.registration_intent_id=v.id and s.kind='voice_consent_upload';
 if expected_path is distinct from (p_metadata #>> '{recording,audioPath}') then
   raise exception using errcode='23514',message='registration_context_changed'; end if;
 insert into public.voice_consents(id,user_id,provider,consented_at,metadata)
   values(v.registration_consent_id,p_user_id,v.registration_provider,p_consented_at,p_metadata) returning * into c;
 update public.voice_asset_write_intents set status='completed',lease_token=null,lease_expires_at=null where id=v.id;
 return c;
end; $$;

-- Existing deletion/hold authority sees R1's separate cleanup lifecycle even
-- though upload completion status never changes. No Account RPC is replaced.
create function public.r1_coordinate_account_storage() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.user_id is not null and exists(select 1 from public.voice_asset_write_intents
   where user_id=new.user_id and cleanup_state in ('claimed','manual_required') and cleanup_authorized_at is not null)
   and ((new.legal_hold_active and new.legal_hold_scope && array['storage']
      and (not old.legal_hold_active or old.legal_hold_scope is distinct from new.legal_hold_scope))
     or new.storage_runner_lease_token is distinct from old.storage_runner_lease_token
       and new.storage_runner_lease_token is not null
     or new.storage_destructive_started_at is distinct from old.storage_destructive_started_at
     or new.db_sub_finalized_at is distinct from old.db_sub_finalized_at) then
   raise exception using errcode='23514',message='source_cleanup_in_progress';
 end if;
 return new;
end; $$;
create trigger r1_coordinate_account_storage before update on public.account_deletion_requests
for each row execute function public.r1_coordinate_account_storage();
create function public.r1_coordinate_voice_storage() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.target_kind in ('voice_sample','voice_consent_recording')
   and new.delete_attempt_count>old.delete_attempt_count
   and exists(select 1 from public.voice_asset_write_intents where user_id=new.user_id
     and cleanup_state in ('claimed','manual_required') and cleanup_authorized_at is not null) then
   raise exception using errcode='23514',message='source_cleanup_in_progress'; end if;
 return new;
end; $$;
create trigger r1_coordinate_voice_storage before update on public.voice_deletion_targets
for each row execute function public.r1_coordinate_voice_storage();

-- Prevent clock/context rewrites even through future server code. Deleted rows
-- are allowed only by the existing classified deletion flow; no R1 row purge.
create function public.r1_guard_intent() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' then
   if old.cleanup_state in ('claimed','manual_required') and old.cleanup_authorized_at is not null then
     raise exception using errcode='23514',message='source_cleanup_in_progress'; end if;
   return old;
 end if;
 if (old.source_lifecycle_known or old.registration_consent_id is not null) and
   (new.id,new.user_id,new.kind,new.created_at) is distinct from (old.id,old.user_id,old.kind,old.created_at) then
   raise exception using errcode='23514',message='r1_identity_immutable'; end if;
 if old.source_lifecycle_known and (not new.source_lifecycle_known
   or (old.status='completed' and (new.storage_bucket,new.storage_object_key,new.status)
     is distinct from (old.storage_bucket,old.storage_object_key,old.status))) then
   raise exception using errcode='23514',message='r1_identity_immutable'; end if;
 if old.first_registered_at is not null and (new.first_registered_at,new.first_registration_intent_id,new.cleanup_due_at)
   is distinct from (old.first_registered_at,old.first_registration_intent_id,old.cleanup_due_at) then
   raise exception using errcode='23514',message='r1_clock_immutable'; end if;
 if old.cleanup_authorized_at is not null and (new.cleanup_authorized_at is distinct from old.cleanup_authorized_at
   or new.cleanup_state not in ('claimed','completed','manual_required')) then
   raise exception using errcode='23514',message='r1_cleanup_fence_immutable'; end if;
 if old.cleanup_state='completed' and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
   raise exception using errcode='23514',message='r1_cleanup_terminal_immutable'; end if;
 if old.registration_consent_id is not null and (new.registration_consent_id,new.registration_provider)
   is distinct from (old.registration_consent_id,old.registration_provider) then
   raise exception using errcode='23514',message='r1_context_immutable'; end if;
 if old.registration_source_read_started_at is not null and
   new.registration_source_read_started_at is distinct from old.registration_source_read_started_at then
   raise exception using errcode='23514',message='registration_execution_unresolved'; end if;
 if old.registration_dispatched_at is not null and (new.registration_dispatched_at is distinct from old.registration_dispatched_at
   or new.status='cancelled') then raise exception using errcode='23514',message='registration_execution_unresolved'; end if;
 return new;
end; $$;
create trigger r1_guard_intent before update or delete on public.voice_asset_write_intents
for each row execute function public.r1_guard_intent();
create function public.r1_guard_source_use() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin raise exception using errcode='23514',message='r1_source_use_immutable'; end; $$;
create trigger r1_guard_source_use before update on public.voice_source_uses
for each row execute function public.r1_guard_source_use();

-- One candidate, monotonic UUID cursor; all skipped candidates advance it.
-- End-of-sweep returns null; the next separate sweep begins without a cursor.
create function public.select_voice_source_cleanup(p_after_id uuid default null) returns uuid
language sql security definer set search_path=pg_catalog,public as $$
 select id from public.voice_asset_write_intents where kind in ('voice_sample_upload','voice_consent_upload')
   and cleanup_due_at<=clock_timestamp() and cleanup_state is distinct from 'completed'
   and (p_after_id is null or id>p_after_id) order by id limit 1;
$$;
create function public.claim_voice_source_cleanup(p_source_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.voice_asset_write_intents; owner_id uuid; reason text;
begin
 if p_token is null then return jsonb_build_object('reason','malformed_canonical_state'); end if;
 select user_id into owner_id from public.voice_asset_write_intents where id=p_source_id;
 if owner_id is null then return jsonb_build_object('reason','source_authority_removed'); end if;
 -- No unbounded waiting: contested candidates advance the external cursor too.
 if not pg_try_advisory_xact_lock(hashtextextended('g5c-b4-voice-assets:'||owner_id::text,0)) then
   return jsonb_build_object('reason','claim_conflict'); end if;
 begin
   perform 1 from public.account_deletion_requests where user_id=owner_id order by id for update nowait;
   select * into s from public.voice_asset_write_intents where id=p_source_id and user_id=owner_id for update nowait;
 exception when lock_not_available then return jsonb_build_object('reason','claim_conflict'); end;
 if not found then return jsonb_build_object('reason','source_authority_removed'); end if;
 if s.status<>'completed' or not s.source_lifecycle_known or s.cleanup_state is null
   or s.kind not in ('voice_sample_upload','voice_consent_upload') then
   return jsonb_build_object('reason','malformed_canonical_state'); end if;
 if s.cleanup_state='completed' then return jsonb_build_object('reason','cleanup_succeeded'); end if;
 if s.cleanup_state='manual_required' then return jsonb_build_object('reason','manual_required'); end if;
 if s.cleanup_due_at is null or s.cleanup_due_at>clock_timestamp() then return jsonb_build_object('reason','not_due'); end if;
 if not exists(select 1 from public.voice_asset_write_intents i join public.voice_source_uses u
   on u.registration_intent_id=i.id and u.source_upload_intent_id=s.id
   where i.id=s.first_registration_intent_id and i.user_id=owner_id and i.kind='voice_create' and i.status='completed') then
   return jsonb_build_object('reason','malformed_canonical_state'); end if;
 if s.storage_bucket is distinct from (case s.kind when 'voice_sample_upload' then 'voice-samples' else 'voice-consents' end)
   or s.storage_object_key is null or split_part(s.storage_object_key,'/',1)<>owner_id::text
   or s.storage_object_key ~ '(^|/)(\.|\.\.)(/|$)' or s.storage_object_key like '%//%'
   or right(s.storage_object_key,1)='/' or length(s.storage_object_key)>1024 then
   return jsonb_build_object('reason','unsafe_locator_or_ownership'); end if;
 reason:=public.r1_safety_reason(owner_id);
 -- An existing R1 claim finishes before a later deletion's Storage authority;
 -- additive coordination triggers forbid overlapping dispatch. A new claim yields.
 if reason='legal_hold' then return jsonb_build_object('reason',reason); end if;
 if s.cleanup_authorized_at is null and (reason='voice_deletion_active' or exists(
   select 1 from public.account_deletion_requests where user_id=owner_id
     and storage_sub_finalized_at is null
     and (storage_runner_lease_token is not null or storage_destructive_started_at is not null))) then
   return jsonb_build_object('reason',coalesce(reason,'account_deletion_active')); end if;
 if s.cleanup_lease_token is not null and s.cleanup_lease_expires_at>clock_timestamp() then
   return jsonb_build_object('reason','claim_conflict'); end if;
 if exists(select 1 from public.voice_asset_write_intents i where i.user_id=owner_id
   and i.kind in ('voice_create','voice_consent_create') and i.status in ('reserved','manual_required') and (
     i.registration_consent_id is null or exists(select 1 from public.voice_source_uses u
       where u.registration_intent_id=i.id and u.source_upload_intent_id=s.id and u.requires_audio))) then
   return jsonb_build_object('reason','in_flight_use'); end if;
 update public.voice_asset_write_intents set cleanup_state='claimed',
   cleanup_authorized_at=coalesce(cleanup_authorized_at,clock_timestamp()),
   cleanup_lease_token=p_token,cleanup_lease_expires_at=clock_timestamp()+interval '900 seconds',
   cleanup_attempt_count=cleanup_attempt_count+1 where id=s.id returning * into s;
 return jsonb_build_object('reason','claimed','sourceId',s.id,'userId',s.user_id,'bucket',s.storage_bucket,
   'objectKey',s.storage_object_key,'leaseExpiresAt',s.cleanup_lease_expires_at);
end; $$;

-- Latest state, use, hold and token revalidation immediately before external work.
create function public.check_voice_source_cleanup(p_source_id uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.voice_asset_write_intents; owner_id uuid;
begin
 select user_id into owner_id from public.voice_asset_write_intents where id=p_source_id;
 if owner_id is null then return false; end if;
 perform public.r1_lock_owner(owner_id);
 select * into s from public.voice_asset_write_intents where id=p_source_id for update;
 return s.cleanup_state='claimed' and s.cleanup_lease_token=p_token and s.cleanup_lease_expires_at>clock_timestamp()
   and not exists(select 1 from public.account_deletion_requests r where r.user_id=owner_id
     and public.account_deletion_legal_hold_blocks(r,'storage'))
   and not exists(select 1 from public.voice_asset_write_intents i where i.user_id=owner_id
     and i.kind in ('voice_create','voice_consent_create') and i.status in ('reserved','manual_required') and (i.registration_consent_id is null or exists(
       select 1 from public.voice_source_uses u where u.registration_intent_id=i.id and u.source_upload_intent_id=s.id and u.requires_audio)));
end; $$;
create function public.finish_voice_source_cleanup(p_source_id uuid,p_token uuid,p_result text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid;
begin
 if p_result is null or p_result not in ('cleanup_succeeded','already_absent','storage_delete_transient_failure','verification_failure') then return false; end if;
 select user_id into owner_id from public.voice_asset_write_intents where id=p_source_id;
 if owner_id is null then return false; end if;
 perform public.r1_lock_owner(owner_id);
 update public.voice_asset_write_intents set
   cleanup_state=case when p_result in ('cleanup_succeeded','already_absent') then 'completed' else 'claimed' end,
   cleanup_completed_at=case when p_result in ('cleanup_succeeded','already_absent') then clock_timestamp() else null end,
   cleanup_failure=case when p_result in ('cleanup_succeeded','already_absent') then null else p_result end,
   cleanup_lease_token=null,cleanup_lease_expires_at=null
   where id=p_source_id and cleanup_state='claimed' and cleanup_lease_token=p_token
     and cleanup_lease_expires_at>clock_timestamp();
 return found;
end; $$;

-- Narrow RPC surface only; helpers never become service/client bypasses.

alter function public.r1_lock_owner(uuid) owner to postgres;
revoke all on function public.r1_lock_owner(uuid) from public,anon,authenticated,service_role;

alter function public.r1_safety_reason(uuid) owner to postgres;
revoke all on function public.r1_safety_reason(uuid) from public,anon,authenticated,service_role;

alter function public.reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text) owner to postgres;
revoke all on function public.reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text) to service_role;

alter function public.finalize_voice_upload_write_intent(uuid,uuid,uuid,text,text) owner to postgres;
revoke all on function public.finalize_voice_upload_write_intent(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_voice_upload_write_intent(uuid,uuid,uuid,text,text) to service_role;

alter function public.r1_bind_source(uuid,uuid,text,text,boolean) owner to postgres;
revoke all on function public.r1_bind_source(uuid,uuid,text,text,boolean) from public,anon,authenticated,service_role;

alter function public.reserve_voice_source_registration(uuid,text,uuid,uuid,text,text,text) owner to postgres;
revoke all on function public.reserve_voice_source_registration(uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_voice_source_registration(uuid,text,uuid,uuid,text,text,text) to service_role;

alter function public.begin_voice_source_registration(uuid,uuid,uuid) owner to postgres;
revoke all on function public.begin_voice_source_registration(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_voice_source_registration(uuid,uuid,uuid) to service_role;

alter function public.finish_voice_consent_source_read(uuid,uuid,uuid,boolean) owner to postgres;
revoke all on function public.finish_voice_consent_source_read(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.finish_voice_consent_source_read(uuid,uuid,uuid,boolean) to service_role;

alter function public.cancel_voice_asset_write_intent(uuid,uuid,uuid,boolean) owner to postgres;
revoke all on function public.cancel_voice_asset_write_intent(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.cancel_voice_asset_write_intent(uuid,uuid,uuid,boolean) to service_role;

alter function public.finalize_voice_create_write_intent(uuid,uuid,uuid,uuid,text,text,text) owner to postgres;
revoke all on function public.finalize_voice_create_write_intent(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_voice_create_write_intent(uuid,uuid,uuid,uuid,text,text,text) to service_role;

alter function public.finalize_voice_consent_write_intent(uuid,uuid,uuid,timestamptz,jsonb) owner to postgres;
revoke all on function public.finalize_voice_consent_write_intent(uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.finalize_voice_consent_write_intent(uuid,uuid,uuid,timestamptz,jsonb) to service_role;

alter function public.r1_coordinate_account_storage() owner to postgres;
revoke all on function public.r1_coordinate_account_storage() from public,anon,authenticated,service_role;

alter function public.r1_coordinate_voice_storage() owner to postgres;
revoke all on function public.r1_coordinate_voice_storage() from public,anon,authenticated,service_role;

alter function public.r1_guard_intent() owner to postgres;
revoke all on function public.r1_guard_intent() from public,anon,authenticated,service_role;

alter function public.r1_guard_source_use() owner to postgres;
revoke all on function public.r1_guard_source_use() from public,anon,authenticated,service_role;

alter function public.select_voice_source_cleanup(uuid) owner to postgres;
revoke all on function public.select_voice_source_cleanup(uuid) from public,anon,authenticated,service_role;
grant execute on function public.select_voice_source_cleanup(uuid) to service_role;

alter function public.claim_voice_source_cleanup(uuid,uuid) owner to postgres;
revoke all on function public.claim_voice_source_cleanup(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_voice_source_cleanup(uuid,uuid) to service_role;

alter function public.check_voice_source_cleanup(uuid,uuid) owner to postgres;
revoke all on function public.check_voice_source_cleanup(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.check_voice_source_cleanup(uuid,uuid) to service_role;

alter function public.finish_voice_source_cleanup(uuid,uuid,text) owner to postgres;
revoke all on function public.finish_voice_source_cleanup(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_voice_source_cleanup(uuid,uuid,text) to service_role;
