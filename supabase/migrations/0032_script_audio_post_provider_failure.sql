-- Exact operator recovery only. No provider/Storage action and no absence assertion.
alter table public.voice_asset_write_intents
  drop constraint voice_asset_write_intents_status_check,
  drop constraint voice_asset_write_intents_shape_check,
  add column provider_effect text,
  add column storage_outcome text,
  add column orphan_possible boolean,
  add column recovery_evidence_ref uuid,
  add column recovered_at timestamptz;

alter table public.voice_asset_write_intents
  add constraint voice_asset_write_intents_status_check check (
    status in ('reserved', 'completed', 'cancelled', 'manual_required', 'failed_after_provider')
  ),
  add constraint voice_asset_write_intents_recovery_check check (
    (status = 'failed_after_provider' and kind = 'script_audio_create'
      and provider_effect is not null and provider_effect in ('occurred', 'possible')
      and storage_outcome is not null and storage_outcome in ('failed', 'unknown')
      and orphan_possible is true and recovery_evidence_ref is not null and recovered_at is not null)
    or (status <> 'failed_after_provider' and provider_effect is null and storage_outcome is null
      and orphan_possible is null and recovery_evidence_ref is null and recovered_at is null)
  ),
  add constraint voice_asset_write_intents_shape_check check (
    (kind in ('voice_create', 'voice_consent_create')
      and script_id is null and voice_id is null and cache_key is null
      and storage_bucket is null and storage_object_key is null)
    or
    (kind = 'script_audio_create'
      and script_id is not null and voice_id is not null and nullif(cache_key, '') is not null
      and (
        (status in ('reserved', 'manual_required', 'failed_after_provider')
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

-- The owner unresolved partial index and reserve RPC intentionally remain unchanged:
-- only reserved/manual_required block NEW reservations. Existing IDs are never reused.
-- No FK to quota/audit events: their independent purge/hold contract is unchanged.
comment on column public.voice_asset_write_intents.recovery_evidence_ref is
  'Opaque operator evidence reference, not billing/refund or physical absence proof. No raw logs.';
comment on column public.voice_asset_write_intents.orphan_possible is
  'Unresolved physical object possibility; keep exact bucket/key for later cleanup authority.';

create function public.recover_script_audio_post_provider_failure(
  p_intent_id uuid, p_user_id uuid, p_lease_token uuid, p_expected_updated_at timestamptz,
  p_script_id uuid, p_voice_id uuid, p_cache_key text,
  p_storage_bucket text, p_storage_object_key text,
  p_provider_effect text, p_storage_outcome text, p_evidence_ref uuid
) returns public.voice_asset_write_intents
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.voice_asset_write_intents;
begin
  if p_intent_id is null or p_user_id is null or p_lease_token is null
    or p_expected_updated_at is null or p_script_id is null or p_voice_id is null
    or nullif(p_cache_key, '') is null or p_storage_bucket is distinct from 'script-audios'
    or nullif(p_storage_object_key, '') is null or p_evidence_ref is null
    or p_provider_effect is null or p_provider_effect not in ('occurred', 'possible')
    or p_storage_outcome is null or p_storage_outcome not in ('failed', 'unknown') then
    raise exception using errcode = '22023', message = 'post_provider_recovery_invalid_evidence';
  end if;
  -- Same lock/order as reservations and deletion; finalize also takes the owner lock.
  perform public.r1_lock_owner(p_user_id);
  if public.r1_safety_reason(p_user_id) is not null then
    raise exception using errcode = '55006', message = 'post_provider_recovery_deletion_active';
  end if;
  select * into v from public.voice_asset_write_intents
    where id = p_intent_id and user_id = p_user_id for update;
  if v.id is null or v.kind <> 'script_audio_create' or v.status <> 'reserved'
    or v.lease_token is distinct from p_lease_token
    or v.updated_at is distinct from p_expected_updated_at
    or v.lease_expires_at > clock_timestamp()
    or v.script_id is distinct from p_script_id or v.voice_id is distinct from p_voice_id
    or v.cache_key is distinct from p_cache_key
    or v.storage_bucket is distinct from p_storage_bucket
    or v.storage_object_key is distinct from p_storage_object_key then
    raise exception using errcode = '23514', message = 'post_provider_recovery_stale_or_mismatch';
  end if;
  -- Re-read owned canonical identity. No Storage catalog/API/physical absence check.
  if not exists (select 1 from public.scripts where id = v.script_id and user_id = p_user_id)
    or not exists (select 1 from public.voices where id = v.voice_id and user_id = p_user_id)
    or split_part(v.storage_object_key, '/', 1) <> p_user_id::text
    or split_part(v.storage_object_key, '/', 2) <> v.script_id::text
    or split_part(v.storage_object_key, '/', 3) <> v.voice_id::text then
    raise exception using errcode = '23514', message = 'post_provider_recovery_ownership_invalid';
  end if;
  if exists (select 1 from public.script_audios a
    where (a.script_id = v.script_id and a.voice_id = v.voice_id and a.cache_key = v.cache_key)
      or (a.stored_asset ->> 'storageBucket' = v.storage_bucket
        and a.stored_asset ->> 'storageObjectKey' = v.storage_object_key)
      or a.storage_path = 'storage://' || v.storage_bucket || '/' || v.storage_object_key) then
    raise exception using errcode = '23514', message = 'post_provider_recovery_canonical_result_exists';
  end if;
  update public.voice_asset_write_intents
    set status = 'failed_after_provider', lease_token = null, lease_expires_at = null,
      provider_effect = p_provider_effect, storage_outcome = p_storage_outcome,
      orphan_possible = true, recovery_evidence_ref = p_evidence_ref, recovered_at = clock_timestamp()
    where id = p_intent_id and user_id = p_user_id and status = 'reserved'
      and lease_token = p_lease_token and updated_at = p_expected_updated_at
    returning * into v;
  if not found then
    raise exception using errcode = '23514', message = 'post_provider_recovery_cas_lost';
  end if;
  return v;
end; $$;
revoke all on function public.recover_script_audio_post_provider_failure(uuid,uuid,uuid,timestamptz,uuid,uuid,text,text,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.recover_script_audio_post_provider_failure(uuid,uuid,uuid,timestamptz,uuid,uuid,text,text,text,text,text,uuid)
  to service_role;

-- Keep evidence/locator even through a direct Auth cascade. A later explicitly
-- reviewed cleanup contract must resolve the orphan before disposal is permitted.
-- Existing Account DB finalizer already rejects statuses outside completed/cancelled.
create function public.guard_post_provider_failure_evidence() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if old.status = 'failed_after_provider' then
    if tg_op = 'DELETE' then
      raise exception using errcode = '23514', message = 'post_provider_orphan_cleanup_required';
    end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception using errcode = '23514', message = 'post_provider_failure_immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger guard_post_provider_failure_evidence before update or delete on public.voice_asset_write_intents
  for each row execute function public.guard_post_provider_failure_evidence();

-- Current deletion inventories cannot certify catalog-less physical orphans.
-- Block sealing for this owner rather than silently omit the locator or certify cleanup.
create function public.guard_post_provider_orphan_deletion() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'account_deletion_requests' then
    if new.storage_snapshot_status is not distinct from old.storage_snapshot_status
      and new.storage_sub_finalized_at is not distinct from old.storage_sub_finalized_at then return new; end if;
  else
    if new.snapshot_status is not distinct from old.snapshot_status
      and new.status is distinct from 'completed' then return new; end if;
  end if;
  if exists (select 1 from public.voice_asset_write_intents
    where user_id = new.user_id and status = 'failed_after_provider' and orphan_possible) then
    raise exception using errcode = '23514', message = 'post_provider_orphan_cleanup_required';
  end if;
  return new;
end; $$;
create trigger guard_post_provider_orphan_deletion before update on public.account_deletion_requests
  for each row execute function public.guard_post_provider_orphan_deletion();
create trigger guard_post_provider_orphan_deletion before update on public.voice_deletion_operations
  for each row execute function public.guard_post_provider_orphan_deletion();
revoke all on function public.guard_post_provider_failure_evidence() from public, anon, authenticated, service_role;
revoke all on function public.guard_post_provider_orphan_deletion() from public, anon, authenticated, service_role;
