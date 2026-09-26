-- Local-only limited script brush-up foundation. Apply only after a separate cutover review.
begin;

alter table public.beta_quota_global_usage drop constraint beta_quota_global_usage_kind_check;
alter table public.beta_quota_global_usage add constraint beta_quota_global_usage_kind_check
  check (kind in ('reference_audio_generation', 'pronunciation_evaluation', 'voice_creation', 'script_brush_up_candidate_generation'));
alter table public.beta_quota_reservations drop constraint beta_quota_reservations_kind_check;
alter table public.beta_quota_reservations add constraint beta_quota_reservations_kind_check
  check (kind in ('reference_audio_generation', 'pronunciation_evaluation', 'voice_creation', 'script_brush_up_candidate_generation'));

create table public.script_brush_up_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  script_id uuid not null,
  script_revision_id uuid not null,
  source_take_id uuid not null,
  source_recording_identity text not null check (source_recording_identity ~ '^[0-9a-f]{64}$'),
  purpose_version text not null default 'script_brush_up.v1' check (purpose_version = 'script_brush_up.v1'),
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),
  status text not null default 'active' check (status in ('active', 'withdrawn')),
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint brush_consent_script_owner foreign key(script_id,user_id) references public.scripts(id,user_id) on delete cascade,
  constraint brush_consent_revision foreign key(script_id,script_revision_id) references public.script_revisions(script_id,id),
  constraint brush_consent_withdrawal_shape check ((status='active' and withdrawn_at is null) or (status='withdrawn' and withdrawn_at is not null))
);
create index script_brush_up_consents_owner on public.script_brush_up_consents(user_id,source_take_id,accepted_at desc);

create table public.script_brush_up_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  script_id uuid not null,
  script_revision_id uuid not null,
  source_take_id uuid not null,
  source_recording_identity text not null check (source_recording_identity ~ '^[0-9a-f]{64}$'),
  consent_id uuid not null references public.script_brush_up_consents(id),
  quota_reservation_id uuid not null unique references public.beta_quota_reservations(id),
  baseline_script_audio_id uuid references public.script_audios(id) on delete set null,
  candidate_script_audio_id uuid unique references public.script_audios(id) on delete set null,
  candidate_storage_object_key text,
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),
  provider_operation_label text not null unique,
  provider_candidate_voice_id text check (provider_candidate_voice_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  provider_cleanup_state text not null default 'not_created' check (provider_cleanup_state in ('not_created','create_unknown','present','delete_pending','delete_failed','verified_absent')),
  asset_cleanup_state text not null default 'not_needed' check (asset_cleanup_state in ('not_needed','pending','failed','complete')),
  status text not null default 'preparing' check (status in ('preparing','audio_staged','ready','adopted','rejected','rolled_back','failed')),
  created_at timestamptz not null default now(),
  adopted_at timestamptz,
  rejected_at timestamptz,
  rolled_back_at timestamptz,
  provider_verified_absent_at timestamptz,
  constraint brush_candidate_script_owner foreign key(script_id,user_id) references public.scripts(id,user_id) on delete cascade,
  constraint brush_candidate_revision foreign key(script_id,script_revision_id) references public.script_revisions(script_id,id),
  constraint brush_candidate_provider_shape check (
    (provider_cleanup_state in ('not_created','create_unknown','verified_absent') and provider_candidate_voice_id is null)
    or (provider_cleanup_state in ('present','delete_pending','delete_failed') and provider_candidate_voice_id is not null)
  ),
  constraint brush_candidate_ready_shape check (status not in ('ready','adopted') or
    (candidate_script_audio_id is not null and provider_cleanup_state='verified_absent'))
);
create unique index brush_candidate_one_active_revision on public.script_brush_up_candidates(script_id,script_revision_id)
  where status in ('preparing','audio_staged','ready','adopted')
    or provider_cleanup_state in ('create_unknown','present','delete_pending','delete_failed')
    or asset_cleanup_state in ('pending','failed');
create index brush_candidate_owner_cleanup on public.script_brush_up_candidates(user_id,provider_cleanup_state);

-- Candidate uploads use the owner's Storage client. A restrictive policy
-- fences their distinctive key shape against account deletion and cleanup,
-- including a delayed upload after a candidate has become terminal.
create function public.brush_up_candidate_storage_insert_allowed(p_key text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); parts text[]:=storage.foldername(p_key);
begin
  if u is null or cardinality(parts)<>4 or parts[1]<>u::text then return false; end if;
  perform public.script_owner_write_lock(u);
  return exists(select 1 from public.script_brush_up_candidates c
    where c.user_id=u and c.script_id::text=parts[2] and c.id::text=parts[3]
      and c.candidate_storage_object_key=p_key and c.asset_cleanup_state='pending'
      and c.status='preparing' and c.provider_cleanup_state='present');
end $$;
revoke all on function public.brush_up_candidate_storage_insert_allowed(text) from public,anon,service_role;
grant execute on function public.brush_up_candidate_storage_insert_allowed(text) to authenticated;
create policy brush_up_candidate_storage_insert_fence on storage.objects as restrictive for insert to authenticated
with check (bucket_id<>'script-audios' or not (
  cardinality(storage.foldername(name))=4
  and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[4]=(storage.foldername(name))[3]||'.mp3'
) or public.brush_up_candidate_storage_insert_allowed(name));

alter table public.script_brush_up_consents enable row level security;
alter table public.script_brush_up_candidates enable row level security;
revoke all on public.script_brush_up_consents, public.script_brush_up_candidates from public,anon,authenticated,service_role;
grant select on public.script_brush_up_consents, public.script_brush_up_candidates to authenticated,service_role;
create policy brush_consent_owner_read on public.script_brush_up_consents for select to authenticated using(user_id=auth.uid());
create policy brush_candidate_owner_read on public.script_brush_up_candidates for select to authenticated using(user_id=auth.uid());

create function public.accept_script_brush_up_consent(p_user_id uuid,p_script_id uuid,p_take_id uuid,p_revision_id uuid,p_recording_identity text)
returns public.script_brush_up_consents language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=p_user_id; s public.scripts; t public.takes; c public.script_brush_up_consents;
begin
  perform public.script_owner_write_lock(u);
  select * into s from public.scripts where id=p_script_id and user_id=u for update;
  select * into t from public.takes where id=p_take_id and user_id=u and script_id=p_script_id;
  if s.id is null or s.archived_at is not null or s.current_revision_id is distinct from p_revision_id
    or t.id is null or t.status not in ('reviewed','completed') or t.script_revision_id is null
    or t.script_revision_id is distinct from p_revision_id or t.audio_path not like 'storage://recordings/%'
    or p_recording_identity !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='check_violation',message='brush_up_take_ineligible'; end if;
  insert into public.script_brush_up_consents(user_id,script_id,script_revision_id,source_take_id,source_recording_identity)
    values(u,p_script_id,p_revision_id,p_take_id,p_recording_identity) returning * into c;
  return c;
end $$;
revoke all on function public.accept_script_brush_up_consent(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_script_brush_up_consent(uuid,uuid,uuid,uuid,text) to service_role;

create function public.withdraw_script_brush_up_consent(p_consent_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid();
begin
  perform public.g5c_b4_lock_voice_asset_user(u);
  if exists(select 1 from public.script_brush_up_candidates where consent_id=p_consent_id and user_id=u
    and (provider_cleanup_state in ('create_unknown','present','delete_pending','delete_failed') or status in ('preparing','audio_staged'))) then
    raise exception using errcode='object_in_use',message='brush_up_cleanup_required'; end if;
  update public.script_brush_up_consents set status='withdrawn',withdrawn_at=coalesce(withdrawn_at,now())
    where id=p_consent_id and user_id=u and status='active';
  return found;
end $$;
revoke all on function public.withdraw_script_brush_up_consent(uuid) from public,anon,service_role;
grant execute on function public.withdraw_script_brush_up_consent(uuid) to authenticated;

create function public.begin_script_brush_up_candidate(p_user_id uuid,p_consent_id uuid,p_baseline_audio_id uuid,p_quota_reservation_id uuid)
returns public.script_brush_up_candidates language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.script_brush_up_consents; s public.scripts; t public.takes; a public.script_audios; q public.beta_quota_reservations; result public.script_brush_up_candidates; candidate_id uuid:=gen_random_uuid();
begin
  perform public.script_owner_write_lock(p_user_id);
  select * into c from public.script_brush_up_consents where id=p_consent_id and user_id=p_user_id and status='active' for update;
  if not found then raise exception using errcode='check_violation',message='brush_up_consent_missing'; end if;
  select * into s from public.scripts where id=c.script_id and user_id=p_user_id for update;
  select * into t from public.takes where id=c.source_take_id and user_id=p_user_id and script_id=c.script_id;
  select * into a from public.script_audios where id=p_baseline_audio_id and script_id=c.script_id;
  select * into q from public.beta_quota_reservations where id=p_quota_reservation_id and user_id=p_user_id
    and kind='script_brush_up_candidate_generation' for update;
  if s.id is null or s.archived_at is not null or s.current_revision_id<>c.script_revision_id
    or t.id is null or t.status not in ('reviewed','completed') or t.script_revision_id is distinct from c.script_revision_id
    or a.id is null or a.script_revision_id is distinct from c.script_revision_id
    or a.generation_preset='brush_up_candidate' or q.id is null or q.status<>'reserved'
    or public.g5c_b4_voice_deletion_writer_fence_active(p_user_id)
    or q.reserved_expires_at<=clock_timestamp() then
    raise exception using errcode='check_violation',message='brush_up_candidate_ineligible'; end if;
  -- Persist a conservative provider-dispatch state in the same transaction as
  -- the quota start. A process exit after this point cannot hide a possible
  -- remote voice behind a merely "reserved" quota row.
  update public.beta_quota_reservations set status='provider_started',provider_started_at=now(),updated_at=now()
    where id=q.id;
  insert into public.script_brush_up_candidates(id,user_id,script_id,script_revision_id,source_take_id,
    source_recording_identity,consent_id,quota_reservation_id,baseline_script_audio_id,provider_operation_label,provider_cleanup_state)
    values(candidate_id,p_user_id,c.script_id,c.script_revision_id,c.source_take_id,c.source_recording_identity,
      c.id,q.id,a.id,'nm-brush-'||candidate_id::text,'create_unknown') returning * into result;
  return result;
end $$;
revoke all on function public.begin_script_brush_up_candidate(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_script_brush_up_candidate(uuid,uuid,uuid,uuid) to service_role;

create function public.transition_script_brush_up_candidate(p_user_id uuid,p_candidate_id uuid,p_action text,p_provider_voice_id text default null)
returns public.script_brush_up_candidates language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.script_brush_up_candidates;
begin
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  select * into c from public.script_brush_up_candidates where id=p_candidate_id and user_id=p_user_id for update;
  if not found then raise exception using errcode='no_data_found',message='brush_up_candidate_missing'; end if;
  if p_action='provider_created' and c.status='preparing' and c.provider_cleanup_state='create_unknown'
    and p_provider_voice_id ~ '^[A-Za-z0-9_-]{1,128}$' then
    update public.script_brush_up_candidates set provider_candidate_voice_id=p_provider_voice_id,provider_cleanup_state='present' where id=c.id;
  elsif p_action='create_unknown' and c.status='preparing' and c.provider_cleanup_state='create_unknown' then
    update public.script_brush_up_candidates set status='failed',provider_cleanup_state='create_unknown' where id=c.id;
  elsif p_action='provider_absent_unrecorded' and c.status='preparing' and c.provider_cleanup_state='create_unknown' then
    update public.script_brush_up_candidates set status='failed',provider_cleanup_state='verified_absent',
      provider_verified_absent_at=now() where id=c.id;
  elsif p_action='cancel_before_provider' and c.status='preparing' and c.provider_cleanup_state='not_created' then
    update public.script_brush_up_candidates set status='failed' where id=c.id;
  elsif p_action='delete_pending' and c.provider_cleanup_state in ('present','delete_failed','delete_pending') then
    update public.script_brush_up_candidates set provider_cleanup_state='delete_pending' where id=c.id;
  elsif p_action='delete_failed' and c.provider_cleanup_state='delete_pending' then
    update public.script_brush_up_candidates set provider_cleanup_state='delete_failed',status='failed' where id=c.id;
  elsif p_action='provider_absent' and c.provider_cleanup_state in ('present','delete_pending','delete_failed') then
    update public.script_brush_up_candidates set provider_candidate_voice_id=null,provider_cleanup_state='verified_absent',
      provider_verified_absent_at=now(),status=case when candidate_script_audio_id is null then 'failed' else 'ready' end
      where id=c.id;
  elsif p_action='adopt' and c.status='ready' and c.provider_cleanup_state='verified_absent'
    and exists(select 1 from public.scripts where id=c.script_id and user_id=p_user_id and archived_at is null and current_revision_id=c.script_revision_id) then
    update public.script_brush_up_candidates set status='adopted',adopted_at=now() where id=c.id;
  elsif p_action='reject' and c.status='ready' then
    update public.script_brush_up_candidates set status='rejected',rejected_at=now(),asset_cleanup_state='pending' where id=c.id;
  elsif p_action='rollback' and c.status='adopted' then
    update public.script_brush_up_candidates set status='rolled_back',rolled_back_at=now(),asset_cleanup_state='pending' where id=c.id;
  elsif p_action='asset_cleanup_failed' and c.asset_cleanup_state in ('pending','failed') then
    update public.script_brush_up_candidates set asset_cleanup_state='failed' where id=c.id;
  else raise exception using errcode='check_violation',message='brush_up_transition_invalid'; end if;
  select * into c from public.script_brush_up_candidates where id=p_candidate_id;
  return c;
end $$;
revoke all on function public.transition_script_brush_up_candidate(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.transition_script_brush_up_candidate(uuid,uuid,text,text) to service_role;

create function public.reserve_script_brush_up_asset(p_user_id uuid,p_candidate_id uuid,p_object_key text)
returns public.script_brush_up_candidates language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.script_brush_up_candidates;
begin
  perform public.script_owner_write_lock(p_user_id);
  select * into c from public.script_brush_up_candidates where id=p_candidate_id and user_id=p_user_id for update;
  if not found or c.status<>'preparing' or c.provider_cleanup_state<>'present'
    or c.candidate_storage_object_key is not null
    or p_object_key not like p_user_id::text||'/'||c.script_id::text||'/'||c.id::text||'/%' then
    raise exception using errcode='check_violation',message='brush_up_asset_reservation_invalid'; end if;
  update public.script_brush_up_candidates set candidate_storage_object_key=p_object_key,
    asset_cleanup_state='pending' where id=c.id returning * into c;
  return c;
end $$;
revoke all on function public.reserve_script_brush_up_asset(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_script_brush_up_asset(uuid,uuid,text) to service_role;

create function public.finish_script_brush_up_asset_cleanup(p_user_id uuid,p_candidate_id uuid)
returns public.script_brush_up_candidates language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.script_brush_up_candidates;
begin
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  select * into c from public.script_brush_up_candidates where id=p_candidate_id and user_id=p_user_id for update;
  if not found or c.status not in ('rejected','rolled_back','failed') or c.asset_cleanup_state not in ('pending','failed')
    or c.provider_cleanup_state not in ('not_created','verified_absent') then
    raise exception using errcode='check_violation',message='brush_up_asset_cleanup_invalid'; end if;
  if c.candidate_script_audio_id is not null then
    delete from public.script_audios where id=c.candidate_script_audio_id and script_id=c.script_id
      and generation_preset='brush_up_candidate';
    if not found then raise exception using errcode='serialization_failure',message='brush_up_asset_row_missing'; end if;
  end if;
  update public.script_brush_up_candidates set candidate_script_audio_id=null,candidate_storage_object_key=null,
    asset_cleanup_state='complete' where id=c.id returning * into c;
  return c;
end $$;
revoke all on function public.finish_script_brush_up_asset_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_script_brush_up_asset_cleanup(uuid,uuid) to service_role;

-- Candidate audio is separate from normal voice/cache authority. The RPC, not
-- a normal voice writer intent, supplies its one-use insert context.
create or replace function public.guard_script_audio_revision() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.voice_asset_write_intents; u uuid; c public.script_brush_up_candidates; candidate_id text;
begin
  if tg_op='UPDATE' then
    if row(new.script_id,new.script_revision_id,new.cache_key,new.generation_key_version,new.generation_preset,new.revision_binding)
      is distinct from row(old.script_id,old.script_revision_id,old.cache_key,old.generation_key_version,old.generation_preset,old.revision_binding) then
      raise exception using errcode='23514',message='audio_revision_immutable'; end if;
    return new;
  end if;
  select user_id into u from public.scripts where id=new.script_id;
  if new.generation_preset='brush_up_candidate' then
    candidate_id:=current_setting('native_minute.brush_up_audio_candidate',true);
    if candidate_id is null or candidate_id !~ '^[0-9a-f-]{36}$' then
      raise exception using errcode='23514',message='brush_up_audio_writer_required'; end if;
    select * into c from public.script_brush_up_candidates where id=candidate_id::uuid and user_id=u
      and script_id=new.script_id and script_revision_id=new.script_revision_id and status='preparing'
      and provider_cleanup_state in ('present','delete_pending') for update;
    if not found or new.voice_id is not null or new.cache_key is distinct from 'brushup:'||c.id::text
      or new.generation_key_version<>2 or new.revision_binding<>'generated' then
      raise exception using errcode='23514',message='brush_up_audio_writer_invalid'; end if;
    perform public.assert_script_practice(u,new.script_id,new.script_revision_id,
      (select practice_epoch from public.scripts where id=new.script_id));
    return new;
  end if;
  perform public.script_owner_write_lock(u);
  select * into i from public.voice_asset_write_intents where user_id=u and script_id=new.script_id
    and kind='script_audio_create' and status='reserved' and script_revision_id=new.script_revision_id and cache_key=new.cache_key;
  if not found then raise exception using errcode='23514',message='audio_revision_reservation_required'; end if;
  perform public.assert_script_practice(u,new.script_id,new.script_revision_id,i.script_practice_epoch);
  return new;
end $$;
revoke all on function public.guard_script_audio_revision() from public,anon,authenticated,service_role;

create function public.finalize_script_brush_up_audio(p_user_id uuid,p_candidate_id uuid,p_storage_path text,p_stored_asset jsonb)
returns public.script_brush_up_candidates language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.script_brush_up_candidates; a public.script_audios; s public.scripts;
begin
  perform public.script_owner_write_lock(p_user_id);
  select * into c from public.script_brush_up_candidates where id=p_candidate_id and user_id=p_user_id for update;
  select * into s from public.scripts where id=c.script_id and user_id=p_user_id for update;
  if c.id is null or c.status<>'preparing' or c.provider_cleanup_state not in ('present','delete_pending')
    or c.candidate_script_audio_id is not null or s.archived_at is not null or s.current_revision_id<>c.script_revision_id
    or p_storage_path is null or p_storage_path !~ '^/api/script-audio/[0-9a-f-]{36}$'
    or p_stored_asset->>'storageBucket'<>'script-audios'
    or p_stored_asset->>'storageObjectKey' is distinct from c.candidate_storage_object_key then
    raise exception using errcode='check_violation',message='brush_up_audio_finalization_invalid'; end if;
  perform set_config('native_minute.brush_up_audio_candidate',c.id::text,true);
  insert into public.script_audios(script_id,voice_id,provider,cache_key,storage_path,stored_asset,
    script_revision_id,generation_key_version,generation_preset,revision_binding)
    values(c.script_id,null,'elevenlabs','brushup:'||c.id::text,p_storage_path,p_stored_asset,
      c.script_revision_id,2,'brush_up_candidate','generated') returning * into a;
  update public.script_brush_up_candidates set candidate_script_audio_id=a.id,status='audio_staged',
    asset_cleanup_state='not_needed' where id=c.id returning * into c;
  return c;
end $$;
revoke all on function public.finalize_script_brush_up_audio(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_script_brush_up_audio(uuid,uuid,text,jsonb) to service_role;

-- Preserve the existing ordinary-voice fence; only the one candidate RPC may
-- write a voice-less script audio row. Candidate audio is never a voice row.
create or replace function public.enforce_g5c_b4_script_audio_writer_fence()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_new_script_user_id uuid; v_new_voice_user_id uuid; v_new_voice_provider text;
  v_old_script_user_id uuid; v_old_voice_user_id uuid; v_old_voice_provider text;
  c public.script_brush_up_candidates; candidate_id text;
begin
  select script.user_id, voice.user_id, voice.provider
    into v_new_script_user_id,v_new_voice_user_id,v_new_voice_provider
    from public.scripts script left join public.voices voice on voice.id=new.voice_id where script.id=new.script_id;
  if new.generation_preset='brush_up_candidate' and tg_op='INSERT' then
    candidate_id:=current_setting('native_minute.brush_up_audio_candidate',true);
    if candidate_id is null or candidate_id !~ '^[0-9a-f-]{36}$' then
      raise exception using errcode='23514',message='brush_up_audio_writer_required'; end if;
    select * into c from public.script_brush_up_candidates where id=candidate_id::uuid and user_id=v_new_script_user_id
      and script_id=new.script_id and script_revision_id=new.script_revision_id and status='preparing' for update;
    if not found or new.voice_id is not null or new.provider<>'elevenlabs'
      or public.g5c_b4_voice_deletion_writer_fence_active(v_new_script_user_id) then
      raise exception using errcode='23514',message='brush_up_audio_writer_invalid'; end if;
    return new;
  end if;
  if v_new_script_user_id is null or new.voice_id is null or v_new_voice_user_id is distinct from v_new_script_user_id
    or v_new_voice_provider is distinct from new.provider then
    raise exception using errcode='23514',message='script audio ownership or provider relation is invalid'; end if;
  if tg_op='UPDATE' then
    select script.user_id,voice.user_id,voice.provider into v_old_script_user_id,v_old_voice_user_id,v_old_voice_provider
      from public.scripts script left join public.voices voice on voice.id=old.voice_id where script.id=old.script_id;
  end if;
  if (v_new_voice_provider='elevenlabs' and public.g5c_b4_voice_deletion_writer_fence_active(v_new_script_user_id))
    or (tg_op='UPDATE' and v_old_voice_provider='elevenlabs'
      and (public.g5c_b4_voice_deletion_writer_fence_active(v_old_script_user_id)
        or public.g5c_b4_voice_deletion_writer_fence_active(v_old_voice_user_id))) then
    raise exception using errcode='23514',message='voice deletion writer fence is active'; end if;
  return new;
end $$;
revoke all on function public.enforce_g5c_b4_script_audio_writer_fence() from public,anon,authenticated,service_role;

-- A candidate provider reference or unknown create outcome must be reconciled
-- before the existing account-deletion provider snapshot can seal as complete.
create function public.guard_brush_up_account_deletion_provider_seal() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.provider_snapshot_status='sealed' and old.provider_snapshot_status<>'sealed'
    and exists(select 1 from public.script_brush_up_candidates where user_id=new.user_id
      and provider_cleanup_state in ('create_unknown','present','delete_pending','delete_failed')) then
    raise exception using errcode='object_in_use',message='brush_up_provider_cleanup_required'; end if;
  return new;
end $$;
create trigger guard_brush_up_account_deletion_provider_seal before update on public.account_deletion_requests
  for each row execute function public.guard_brush_up_account_deletion_provider_seal();
revoke all on function public.guard_brush_up_account_deletion_provider_seal() from public,anon,authenticated,service_role;

create function public.guard_brush_up_account_deletion_storage_seal() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.storage_snapshot_status='sealed' and old.storage_snapshot_status<>'sealed'
    and exists(select 1 from public.script_brush_up_candidates where user_id=new.user_id
      and asset_cleanup_state in ('pending','failed')) then
    raise exception using errcode='object_in_use',message='brush_up_asset_cleanup_required'; end if;
  return new;
end $$;
create trigger guard_brush_up_account_deletion_storage_seal before update on public.account_deletion_requests
  for each row execute function public.guard_brush_up_account_deletion_storage_seal();
revoke all on function public.guard_brush_up_account_deletion_storage_seal() from public,anon,authenticated,service_role;

-- Voice-only deletion removes the normal baseline audio and all owner Storage
-- objects. Require active candidates to be rejected/rolled back and cleaned
-- first; historical terminal provenance may lose its baseline FK safely.
create function public.guard_brush_up_voice_deletion_start() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.script_brush_up_candidates where user_id=new.user_id
    and (status in ('preparing','audio_staged','ready','adopted')
      or provider_cleanup_state in ('create_unknown','present','delete_pending','delete_failed')
      or asset_cleanup_state in ('pending','failed'))) then
    raise exception using errcode='object_in_use',message='brush_up_cleanup_required_before_voice_deletion'; end if;
  return new;
end $$;
create trigger guard_brush_up_voice_deletion_start before insert on public.voice_deletion_operations
  for each row execute function public.guard_brush_up_voice_deletion_start();
revoke all on function public.guard_brush_up_voice_deletion_start() from public,anon,authenticated,service_role;

create or replace function public.reserve_beta_provider_quota(
  p_user_id uuid, p_kind text, p_operation_id text, p_period_kind text,
  p_user_limit integer, p_global_limit integer
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_existing public.beta_quota_reservations;
  v_period_id text;
  v_global_used integer;
  v_user_used integer;
  v_new public.beta_quota_reservations;
begin
  if p_user_id is null or p_kind is null or p_kind not in ('reference_audio_generation', 'pronunciation_evaluation', 'voice_creation', 'script_brush_up_candidate_generation')
    or p_operation_id is null or length(p_operation_id) not between 1 and 160
    or p_period_kind is null or p_period_kind not in ('calendar_month_utc', 'account_lifetime')
    or p_user_limit is null or p_user_limit < 1 or p_global_limit is null or p_global_limit < 1 then
    raise exception using errcode = 'invalid_parameter_value', message = 'quota_policy_invalid';
  end if;

  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  if exists (
    select 1 from public.account_deletion_requests where user_id = p_user_id
      and status in ('requested', 'confirmed', 'processing', 'provider_cleanup_failed',
        'storage_cleanup_failed', 'db_cleanup_failed', 'auth_cleanup_failed')
  ) then
    raise exception using errcode = 'object_in_use', message = 'account_deletion_active';
  end if;
  -- Recover the caller's expired, never-dispatched operation before checking
  -- idempotency, so an intentional retry with the same ID can rebook safely.
  perform public.beta_quota_expire_stale_for_user(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('beta-quota-operation:' || p_kind || ':' || p_operation_id, 0));
  select * into v_existing from public.beta_quota_reservations
    where kind = p_kind and operation_id = p_operation_id and status <> 'released';
  if found then
    if v_existing.user_id <> p_user_id then
      raise exception using errcode = 'unique_violation', message = 'quota_operation_owner_conflict';
    end if;
    return jsonb_build_object('result', 'duplicate', 'reservation_id', v_existing.id,
      'status', v_existing.status, 'period_id', v_existing.period_id);
  end if;

  -- The period is derived by the DB, never supplied by a client. Operation
  -- identity is checked first, so a retry across a UTC month does not rebook.
  v_period_id := public.beta_quota_period_id(p_period_kind, transaction_timestamp());
  insert into public.beta_quota_global_usage (kind, period_id)
    values (p_kind, v_period_id) on conflict do nothing;
  select used_count into v_global_used from public.beta_quota_global_usage
    where kind = p_kind and period_id = v_period_id for update;
  perform public.beta_quota_expire_stale_period(p_kind, v_period_id);
  select used_count into v_global_used from public.beta_quota_global_usage
    where kind = p_kind and period_id = v_period_id;
  select count(*) into v_user_used from public.beta_quota_reservations
    where user_id = p_user_id and kind = p_kind and period_id = v_period_id and status <> 'released';
  if v_user_used >= p_user_limit or v_global_used >= p_global_limit then
    return jsonb_build_object('result', 'limit_reached', 'period_id', v_period_id);
  end if;

  insert into public.beta_quota_reservations (operation_id, user_id, kind, period_id, status)
    values (p_operation_id, p_user_id, p_kind, v_period_id, 'reserved') returning * into v_new;
  update public.beta_quota_global_usage set used_count = used_count + 1, updated_at = now()
    where kind = p_kind and period_id = v_period_id;
  return jsonb_build_object('result', 'reserved', 'reservation_id', v_new.id,
    'status', v_new.status, 'period_id', v_period_id);
end;
$$;



-- v4 classifies the two new owned tables. Old terminal evidence stays immutable.
alter table public.account_deletion_requests alter column db_inventory_version set default 'script-brush-up.account-db.v4';
alter table public.account_deletion_requests drop constraint account_deletion_requests_db_inventory_version_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_db_inventory_version_check
  check(db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3','script-brush-up.account-db.v4'));
alter table public.account_deletion_requests drop constraint account_deletion_requests_db_terminal_shape_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_db_terminal_shape_check check (
  (db_cleanup_status not in ('succeeded','not_needed') and db_sub_finalized_at is null
    and db_observed_row_count=0 and db_deleted_row_count=0 and db_anonymized_row_count=0 and db_retained_row_count=0)
  or (db_cleanup_status in ('succeeded','not_needed') and db_sub_finalized_at is not null
    and db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3','script-brush-up.account-db.v4')
    and db_observed_row_count=db_deleted_row_count+db_anonymized_row_count+db_retained_row_count
    and ((db_cleanup_status='not_needed' and db_deleted_row_count=0 and db_anonymized_row_count=0)
      or (db_cleanup_status='succeeded' and db_deleted_row_count+db_anonymized_row_count>0))));

create or replace function public.enforce_account_deletion_db_terminal_authority()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_db_evidence_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.db_cleanup_status in ('succeeded', 'not_needed')
      or new.db_sub_finalized_at is not null
      or new.db_observed_row_count <> 0
      or new.db_deleted_row_count <> 0
      or new.db_anonymized_row_count <> 0
      or new.db_retained_row_count <> 0 then
      raise exception using errcode = 'insufficient_privilege', message = 'account deletion DB terminal state requires focused finalization';
    end if;
    return new;
  end if;

  v_db_evidence_changed :=
    new.db_cleanup_status is distinct from old.db_cleanup_status
    or new.db_inventory_version is distinct from old.db_inventory_version
    or new.db_observed_row_count is distinct from old.db_observed_row_count
    or new.db_deleted_row_count is distinct from old.db_deleted_row_count
    or new.db_anonymized_row_count is distinct from old.db_anonymized_row_count
    or new.db_retained_row_count is distinct from old.db_retained_row_count
    or new.db_sub_finalized_at is distinct from old.db_sub_finalized_at;

  if old.db_cleanup_status in ('succeeded', 'not_needed') and (
    v_db_evidence_changed or new.metadata is distinct from old.metadata
  ) then
    raise exception using errcode = 'check_violation', message = 'account deletion DB terminal evidence is immutable';
  end if;

  if v_db_evidence_changed and not (
    old.db_cleanup_status not in ('succeeded', 'not_needed')
    and old.db_sub_finalized_at is null
    and old.db_observed_row_count = 0
    and old.db_deleted_row_count = 0
    and old.db_anonymized_row_count = 0
    and old.db_retained_row_count = 0
    and new.status = 'confirmed'
    and new.failure_stage is null
    and new.failure_reason_code is null
    and new.provider_cleanup_status in ('succeeded', 'not_needed')
    and new.provider_sub_finalized_at is not null
    and new.storage_cleanup_status in ('succeeded', 'not_needed')
    and new.storage_sub_finalized_at is not null
    and new.db_cleanup_status in ('succeeded', 'not_needed')
    and new.db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3','script-brush-up.account-db.v4')
    and new.db_sub_finalized_at is not null
    and new.last_attempted_at = new.db_sub_finalized_at
    and new.metadata = '{}'::jsonb
    and new.db_observed_row_count = new.db_deleted_row_count + new.db_anonymized_row_count + new.db_retained_row_count
    and (
      (new.db_cleanup_status = 'not_needed' and new.db_deleted_row_count = 0 and new.db_anonymized_row_count = 0)
      or
      (new.db_cleanup_status = 'succeeded' and new.db_deleted_row_count + new.db_anonymized_row_count > 0)
    )
  ) then
    raise exception using errcode = 'insufficient_privilege', message = 'account deletion DB terminal state requires focused finalization';
  end if;

  return new;
end;
$$;

create or replace function public.account_deletion_auth_prior_stages_terminal(
  p_request public.account_deletion_requests
)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce((
    p_request.provider_snapshot_version = 'g5d-2a.account-provider.v1'
    and p_request.provider_snapshot_status = 'sealed'
    and p_request.provider_snapshot_seal_version = 1
    and p_request.provider_snapshot_sealed_at is not null
    and p_request.provider_cleanup_status in ('succeeded', 'not_needed')
    and p_request.provider_sub_finalized_at is not null
    and p_request.provider_locator_scrubbed_at = p_request.provider_sub_finalized_at
    and p_request.provider_verified_absent_count = p_request.provider_snapshot_target_count
    and p_request.provider_runner_lease_token is null
    and p_request.provider_runner_lease_expires_at is null
    and (
      (p_request.provider_cleanup_status = 'not_needed' and p_request.provider_snapshot_target_count = 0)
      or
      (p_request.provider_cleanup_status = 'succeeded' and p_request.provider_snapshot_target_count > 0)
    )
    and p_request.storage_snapshot_version = 'g5d-2e.account-storage.v1'
    and p_request.storage_snapshot_status = 'sealed'
    and p_request.storage_snapshot_seal_version = 1
    and p_request.storage_snapshot_sealed_at is not null
    and p_request.storage_snapshot_fingerprint is null
    and p_request.storage_cleanup_status in ('succeeded', 'not_needed')
    and p_request.storage_sub_finalized_at is not null
    and p_request.storage_locator_scrubbed_at = p_request.storage_sub_finalized_at
    and p_request.storage_verified_absent_count = p_request.storage_snapshot_target_count
    and p_request.storage_runner_lease_token is null
    and p_request.storage_runner_lease_expires_at is null
    and (
      (p_request.storage_cleanup_status = 'not_needed' and p_request.storage_snapshot_target_count = 0)
      or
      (p_request.storage_cleanup_status = 'succeeded' and p_request.storage_snapshot_target_count > 0)
    )
    and p_request.db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3','script-brush-up.account-db.v4')
    and p_request.db_cleanup_status in ('succeeded', 'not_needed')
    and p_request.db_sub_finalized_at is not null
    and p_request.db_observed_row_count =
      p_request.db_deleted_row_count + p_request.db_anonymized_row_count + p_request.db_retained_row_count
    and (
      (
        p_request.db_cleanup_status = 'not_needed'
        and p_request.db_deleted_row_count = 0
        and p_request.db_anonymized_row_count = 0
      )
      or
      (
        p_request.db_cleanup_status = 'succeeded'
        and p_request.db_deleted_row_count + p_request.db_anonymized_row_count > 0
      )
    )
    and p_request.metadata = '{}'::jsonb
  ), false);
$$;

create or replace function public.account_deletion_completion_prerequisites_terminal(
  p_request public.account_deletion_requests
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce((
    p_request.id is not null
    and p_request.status in ('confirmed', 'completed')
    and p_request.user_id is null
    and p_request.failure_stage is null
    and p_request.failure_reason_code is null
    and p_request.metadata = '{}'::jsonb

    and p_request.provider_snapshot_version = 'g5d-2a.account-provider.v1'
    and p_request.provider_snapshot_status = 'sealed'
    and p_request.provider_snapshot_seal_version = 1
    and p_request.provider_snapshot_sealed_at is not null
    and p_request.provider_cleanup_status in ('succeeded', 'not_needed')
    and p_request.provider_sub_finalized_at is not null
    and p_request.provider_locator_scrubbed_at = p_request.provider_sub_finalized_at
    and p_request.provider_runner_lease_token is null
    and p_request.provider_runner_lease_expires_at is null
    and p_request.provider_verified_absent_count = p_request.provider_snapshot_target_count
    and (
      (p_request.provider_cleanup_status = 'not_needed' and p_request.provider_snapshot_target_count = 0)
      or (p_request.provider_cleanup_status = 'succeeded' and p_request.provider_snapshot_target_count > 0)
    )
    and p_request.provider_snapshot_target_count::bigint = (
      select count(*)
      from public.account_deletion_provider_targets as target
      where target.deletion_request_id = p_request.id
    )
    and not exists (
      select 1
      from public.account_deletion_provider_targets as target
      where target.deletion_request_id = p_request.id
        and (
          target.user_id is not null
          or target.status <> 'verified_absent'
          or target.reconciliation_status <> 'verified_absent'
          or target.verified_absent_at is null
          or target.locator_scrubbed_at is distinct from p_request.provider_sub_finalized_at
          or target.source_voice_id is not null
          or target.provider_name is not null
          or target.provider_resource_id is not null
          or target.target_fingerprint is not null
          or target.next_retry_at is not null
          or target.last_failure_category is not null
          or target.manual_required_at is not null
        )
    )

    and p_request.storage_snapshot_version = 'g5d-2e.account-storage.v1'
    and p_request.storage_snapshot_status = 'sealed'
    and p_request.storage_snapshot_seal_version = 1
    and p_request.storage_snapshot_collection_token is null
    and p_request.storage_snapshot_collection_started_at is not null
    and p_request.storage_snapshot_sealed_at is not null
    and p_request.storage_snapshot_fingerprint is null
    and p_request.storage_cleanup_status in ('succeeded', 'not_needed')
    and p_request.storage_sub_finalized_at is not null
    and p_request.storage_locator_scrubbed_at = p_request.storage_sub_finalized_at
    and p_request.storage_runner_lease_token is null
    and p_request.storage_runner_lease_expires_at is null
    and p_request.storage_verified_absent_count = p_request.storage_snapshot_target_count
    and (
      (p_request.storage_cleanup_status = 'not_needed' and p_request.storage_snapshot_target_count = 0)
      or (p_request.storage_cleanup_status = 'succeeded' and p_request.storage_snapshot_target_count > 0)
    )
    and p_request.storage_snapshot_target_count::bigint = (
      select count(*)
      from public.account_deletion_storage_targets as target
      where target.deletion_request_id = p_request.id
    )
    and not exists (
      select 1
      from public.account_deletion_storage_targets as target
      where target.deletion_request_id = p_request.id
        and (
          target.user_id is not null
          or target.status <> 'verified_absent'
          or target.verification_status <> 'verified_absent'
          or target.verified_absent_at is null
          or target.locator_scrubbed_at is distinct from p_request.storage_sub_finalized_at
          or target.storage_bucket is not null
          or target.storage_object_key is not null
          or target.target_fingerprint is not null
          or target.source_refs is not null
          or target.next_retry_at is not null
          or target.last_failure_category is not null
          or target.manual_required_at is not null
        )
    )

    and p_request.db_inventory_version in ('g5d-2h.account-db.v1','script-revision.account-db.v2','beta-quota.account-db.v3','script-brush-up.account-db.v4')
    and p_request.db_cleanup_status in ('succeeded', 'not_needed')
    and p_request.db_sub_finalized_at is not null
    and p_request.db_observed_row_count >= 0
    and p_request.db_deleted_row_count >= 0
    and p_request.db_anonymized_row_count >= 0
    and p_request.db_retained_row_count >= 0
    and p_request.db_observed_row_count::bigint =
      p_request.db_deleted_row_count::bigint
        + p_request.db_anonymized_row_count::bigint
        + p_request.db_retained_row_count::bigint
    and (
      (
        p_request.db_cleanup_status = 'not_needed'
        and p_request.db_deleted_row_count = 0
        and p_request.db_anonymized_row_count = 0
      )
      or (
        p_request.db_cleanup_status = 'succeeded'
        and p_request.db_deleted_row_count::bigint + p_request.db_anonymized_row_count::bigint > 0
      )
    )
    and p_request.db_retained_row_count::bigint = 1::bigint
      + (select count(*) from public.account_deletion_provider_targets as target
          where target.deletion_request_id = p_request.id)
      + (select count(*) from public.account_deletion_storage_targets as target
          where target.deletion_request_id = p_request.id)

    and p_request.auth_intent_version = 'g5d-2m.auth-delete.v1'
    and p_request.auth_delete_target_user_id is null
    and p_request.auth_delete_generation in (0, 1)
    and p_request.auth_delete_requested_at is not null
    and p_request.auth_verification_attempt_count >= 1
    and p_request.auth_verification_result is null
    and p_request.auth_verification_result_attempt_count is null
    and p_request.auth_verified_absent_at is not null
    and p_request.auth_sub_finalized_at is not null
    and p_request.auth_verified_absent_at >= p_request.auth_delete_requested_at
    and p_request.auth_sub_finalized_at >= p_request.auth_verified_absent_at
    and (
      (p_request.auth_cleanup_status = 'not_needed' and p_request.auth_delete_generation = 0)
      or (p_request.auth_cleanup_status = 'succeeded' and p_request.auth_delete_generation = 1)
    )
  ), false);
$$;


alter function public.finalize_account_deletion_database_stage(uuid,uuid,text)
  rename to brush_up_legacy_v3_finalizer;
revoke all on function public.brush_up_legacy_v3_finalizer(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.finalize_account_deletion_database_stage(
  p_deletion_request_id uuid,
  p_expected_user_id uuid,
  p_expected_db_inventory_version text
)
returns table(
  db_cleanup_status text,
  safe_reason text,
  db_observed_row_count integer,
  db_deleted_row_count integer,
  db_anonymized_row_count integer,
  db_retained_row_count integer,
  already_finalized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.account_deletion_requests;
  v_owned_user_id uuid;
  v_retained_hold boolean := false;
  v_now timestamptz := transaction_timestamp();
  v_int_max constant bigint := 2147483647;
  v_changed bigint;

  v_revisions bigint; v_source_uses bigint;
  v_profiles bigint; v_scripts bigint; v_script_audios bigint; v_takes bigint;
  v_weak_words bigint; v_coach_feedback bigint; v_saved_model bigint; v_saved_best bigint;
  v_voices bigint; v_voice_consents bigint; v_processing_consents bigint;
  v_voice_operations bigint; v_voice_targets bigint; v_write_intents bigint;
  v_requests bigint; v_provider_targets bigint; v_quota_events bigint; v_storage_targets bigint;
  v_quota_reservations bigint;
  v_brush_candidates bigint; v_brush_consents bigint;

  v_current_provider_targets bigint; v_current_storage_targets bigint;
  v_prior_request_ids uuid[] := '{}'::uuid[];
  v_prior_provider_targets bigint := 0; v_prior_storage_targets bigint := 0;
  v_voice_retain_ids uuid[] := '{}'::uuid[]; v_voice_expired_ids uuid[] := '{}'::uuid[];
  v_voice_retain_targets bigint := 0; v_voice_expired_targets bigint := 0;
  v_quota_retain_ids uuid[] := '{}'::uuid[]; v_quota_expired_ids uuid[] := '{}'::uuid[];
  v_deleted bigint; v_anonymized bigint; v_retained bigint; v_observed bigint;
  v_terminal_status text;
  v_already_finalized boolean := false;
begin
  if p_expected_db_inventory_version in ('g5d-2h.account-db.v1', 'script-revision.account-db.v2', 'beta-quota.account-db.v3') then
    if exists(select 1 from public.script_brush_up_candidates where user_id=p_expected_user_id)
      or exists(select 1 from public.script_brush_up_consents where user_id=p_expected_user_id) then
      raise exception using errcode='check_violation',message='brush_up_legacy_inventory_has_new_rows'; end if;
    return query select * from public.brush_up_legacy_v3_finalizer(
      p_deletion_request_id,p_expected_user_id,p_expected_db_inventory_version);
    return;
  end if;
  if p_deletion_request_id is null or p_expected_user_id is null
    or p_expected_db_inventory_version is distinct from 'script-brush-up.account-db.v4' then
    raise exception using errcode = 'invalid_parameter_value', message = 'db_finalizer_identity_or_version_invalid';
  end if;

  -- Resolve lock identity from persisted ownership before taking the user lock;
  -- a caller cannot use a request ID to lock a different user.
  select request.user_id into v_owned_user_id
  from public.account_deletion_requests as request
  where request.id = p_deletion_request_id;
  if not found or v_owned_user_id is distinct from p_expected_user_id then
    raise exception using errcode = 'insufficient_privilege', message = 'db_finalizer_request_owner_mismatch';
  end if;

  perform public.g5c_b4_lock_voice_asset_user(v_owned_user_id);

  -- All same-owner requests precede evidence locks, in UUID order.
  perform 1 from public.account_deletion_requests where user_id = v_owned_user_id order by id for update;
  select * into v_request
  from public.account_deletion_requests as request
  where request.id = p_deletion_request_id and request.user_id = v_owned_user_id
  for update;
  if not found then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_request_changed';
  end if;

  if public.account_deletion_legal_hold_blocks(v_request, 'database') then
    raise exception using errcode = 'check_violation', message = 'legal_hold_active';
  end if;

  if v_request.db_cleanup_status in ('succeeded', 'not_needed') then
    if v_request.db_sub_finalized_at is null
      or v_request.db_inventory_version <> 'script-brush-up.account-db.v4'
      or v_request.db_observed_row_count < 0 or v_request.db_deleted_row_count < 0
      or v_request.db_anonymized_row_count < 0 or v_request.db_retained_row_count < 0
      or v_request.db_observed_row_count <>
        v_request.db_deleted_row_count + v_request.db_anonymized_row_count + v_request.db_retained_row_count
      or (v_request.db_cleanup_status = 'not_needed'
        and (v_request.db_deleted_row_count <> 0 or v_request.db_anonymized_row_count <> 0))
      or (v_request.db_cleanup_status = 'succeeded'
        and v_request.db_deleted_row_count + v_request.db_anonymized_row_count = 0) then
      raise exception using errcode = 'check_violation', message = 'db_finalizer_terminal_evidence_inconsistent';
    end if;
    v_already_finalized := true;
  else
    if v_request.status not in ('confirmed', 'db_cleanup_failed')
      or v_request.db_cleanup_status not in ('pending', 'failed')
      or v_request.db_sub_finalized_at is not null
      or v_request.db_inventory_version <> 'script-brush-up.account-db.v4'
      or v_request.db_observed_row_count <> 0 or v_request.db_deleted_row_count <> 0
      or v_request.db_anonymized_row_count <> 0 or v_request.db_retained_row_count <> 0 then
      raise exception using errcode = 'check_violation', message = 'db_finalizer_request_not_runnable';
    end if;
  end if;

  select count(*) into v_current_provider_targets
  from public.account_deletion_provider_targets as target
  where target.deletion_request_id = p_deletion_request_id;
  if v_request.provider_snapshot_version <> 'g5d-2a.account-provider.v1'
    or v_request.provider_snapshot_status <> 'sealed'
    or v_request.provider_snapshot_seal_version <> 1
    or v_request.provider_snapshot_sealed_at is null
    or v_request.provider_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.provider_sub_finalized_at is null
    or v_request.provider_locator_scrubbed_at is distinct from v_request.provider_sub_finalized_at
    or v_request.provider_runner_lease_token is not null or v_request.provider_runner_lease_expires_at is not null
    or v_request.provider_snapshot_target_count <> v_current_provider_targets
    or v_request.provider_verified_absent_count <> v_current_provider_targets
    or (v_request.provider_cleanup_status = 'not_needed' and v_current_provider_targets <> 0)
    or (v_request.provider_cleanup_status = 'succeeded' and v_current_provider_targets = 0)
    or exists (
      select 1 from public.account_deletion_provider_targets as target
      where target.deletion_request_id = p_deletion_request_id and (
        target.user_id is distinct from v_owned_user_id
        or target.status <> 'verified_absent' or target.reconciliation_status <> 'verified_absent'
        or target.verified_absent_at is null
        or target.source_voice_id is not null or target.provider_name is not null
        or target.provider_resource_id is not null or target.target_fingerprint is not null
        or target.locator_scrubbed_at is distinct from v_request.provider_sub_finalized_at
        or target.next_retry_at is not null or target.last_failure_category is not null
        or target.manual_required_at is not null
      )
    ) then
    raise exception using errcode = 'check_violation', message = 'db_finalizer_provider_prerequisite_invalid';
  end if;

  select count(*) into v_current_storage_targets
  from public.account_deletion_storage_targets as target
  where target.deletion_request_id = p_deletion_request_id;
  if v_request.storage_snapshot_version <> 'g5d-2e.account-storage.v1'
    or v_request.storage_snapshot_status <> 'sealed'
    or v_request.storage_snapshot_seal_version <> 1
    or v_request.storage_snapshot_collection_token is not null
    or v_request.storage_snapshot_collection_started_at is null
    or v_request.storage_snapshot_sealed_at is null
    or v_request.storage_snapshot_fingerprint is not null
    or v_request.storage_cleanup_status not in ('succeeded', 'not_needed')
    or v_request.storage_sub_finalized_at is null
    or v_request.storage_locator_scrubbed_at is distinct from v_request.storage_sub_finalized_at
    or v_request.storage_runner_lease_token is not null or v_request.storage_runner_lease_expires_at is not null
    or v_request.storage_snapshot_target_count <> v_current_storage_targets
    or v_request.storage_verified_absent_count <> v_current_storage_targets
    or (v_request.storage_cleanup_status = 'not_needed' and v_current_storage_targets <> 0)
    or (v_request.storage_cleanup_status = 'succeeded' and v_current_storage_targets = 0)
    or exists (
      select 1 from public.account_deletion_storage_targets as target
      where target.deletion_request_id = p_deletion_request_id and (
        target.user_id is distinct from v_owned_user_id
        or target.status <> 'verified_absent' or target.verification_status <> 'verified_absent'
        or target.verified_absent_at is null
        or target.storage_bucket is not null or target.storage_object_key is not null
        or target.target_fingerprint is not null or target.source_refs is not null
        or target.locator_scrubbed_at is distinct from v_request.storage_sub_finalized_at
        or target.next_retry_at is not null or target.last_failure_category is not null
        or target.manual_required_at is not null
      )
    ) then
    raise exception using errcode = 'check_violation', message = 'db_finalizer_storage_prerequisite_invalid';
  end if;

  -- A terminal replay is a read-only proof of the same current prerequisites,
  -- exact owned post-state, and retained count shape required at first commit.
  -- It never repairs evidence or newly introduced rows.
  if v_already_finalized then
    if v_request.status <> 'confirmed'
      or v_request.failure_stage is not null or v_request.failure_reason_code is not null
      or v_request.last_attempted_at is distinct from v_request.db_sub_finalized_at
      or v_request.metadata <> '{}'::jsonb
      or v_request.db_retained_row_count <>
        1 + v_current_provider_targets + v_current_storage_targets
      or exists (select 1 from public.script_brush_up_candidates where user_id=v_owned_user_id)
    or exists (select 1 from public.script_brush_up_consents where user_id=v_owned_user_id)
    or exists (select 1 from public.profiles where id = v_owned_user_id)
      or exists (select 1 from public.scripts where user_id = v_owned_user_id)
    or exists (select 1 from public.script_revisions r join public.scripts s on s.id=r.script_id where s.user_id=v_owned_user_id)
    or exists (select 1 from public.voice_source_uses where user_id=v_owned_user_id)
      or exists (select 1 from public.script_audios audio join public.scripts s on s.id = audio.script_id where s.user_id = v_owned_user_id)
      or exists (select 1 from public.takes where user_id = v_owned_user_id)
      or exists (select 1 from public.weak_words word join public.takes take on take.id = word.take_id where take.user_id = v_owned_user_id)
      or exists (select 1 from public.coach_feedback feedback join public.takes take on take.id = feedback.take_id where take.user_id = v_owned_user_id)
      or exists (select 1 from public.script_saved_model_audios where user_id = v_owned_user_id)
      or exists (select 1 from public.script_saved_best_takes where user_id = v_owned_user_id)
      or exists (select 1 from public.voices where user_id = v_owned_user_id)
      or exists (select 1 from public.voice_consents where user_id = v_owned_user_id)
      or exists (select 1 from public.processing_consents where user_id = v_owned_user_id)
      or exists (select 1 from public.voice_deletion_operations where user_id = v_owned_user_id)
      or exists (select 1 from public.voice_deletion_targets where user_id = v_owned_user_id)
      or exists (select 1 from public.voice_asset_write_intents where user_id = v_owned_user_id)
      or exists (select 1 from public.quota_events where user_id = v_owned_user_id)
      or exists (select 1 from public.beta_quota_reservations where user_id = v_owned_user_id)
      or exists (select 1 from public.account_deletion_requests where user_id = v_owned_user_id and id <> p_deletion_request_id)
      or (select count(*) from public.account_deletion_requests where id = p_deletion_request_id and user_id = v_owned_user_id) <> 1
      or (select count(*) from public.account_deletion_provider_targets where deletion_request_id = p_deletion_request_id and user_id = v_owned_user_id) <> v_current_provider_targets
      or (select count(*) from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id and user_id = v_owned_user_id) <> v_current_storage_targets then
      raise exception using errcode = 'check_violation', message = 'db_terminal_post_state_invalid';
    end if;

    return query select v_request.db_cleanup_status, 'already_finalized'::text,
      v_request.db_observed_row_count, v_request.db_deleted_row_count,
      v_request.db_anonymized_row_count, v_request.db_retained_row_count, true;
    return;
  end if;

  v_retained_hold := exists (select 1 from public.account_deletion_requests r
    where r.user_id = v_owned_user_id and public.retention_audit_hold_blocks(r));
  perform 1 from public.quota_events where user_id = v_owned_user_id order by id for update;
  perform 1 from public.voice_deletion_operations where user_id = v_owned_user_id order by id for update;
  perform 1 from public.voice_deletion_targets where user_id = v_owned_user_id order by id for update;
  if exists (select 1 from public.quota_events where user_id = v_owned_user_id
      and (retention_account_deletion_request_id is not null or attempted_at > v_now))
    or exists (select 1 from public.voice_deletion_operations where user_id = v_owned_user_id
      and (retention_account_deletion_request_id is not null or completed_at > v_now)) then
    raise exception using errcode = 'check_violation', message = 'retention_binding_invalid';
  end if;

  -- Every non-current owned request must be a safely classifiable cancelled or
  -- expired row. Active, manual, failed, or ambiguous prior authority blocks.
  select coalesce(array_agg(request.id order by request.id), '{}'::uuid[])
  into v_prior_request_ids
  from public.account_deletion_requests as request
  where request.user_id = v_owned_user_id and request.id <> p_deletion_request_id;

  if exists (
    select 1 from public.account_deletion_requests as prior
    where prior.id = any(v_prior_request_ids) and not (
      (
        (prior.status = 'cancelled' and prior.cancelled_at is not null)
        or (prior.status = 'expired' and prior.expires_at is not null and prior.expires_at <= v_now)
      )
      and prior.provider_cleanup_status in ('pending', 'succeeded', 'not_needed')
      and prior.storage_cleanup_status in ('pending', 'succeeded', 'not_needed')
      and prior.db_cleanup_status in ('pending', 'succeeded', 'not_needed')
      and prior.auth_cleanup_status = 'pending'
      and prior.provider_runner_lease_token is null and prior.provider_runner_lease_expires_at is null
      and prior.storage_runner_lease_token is null and prior.storage_runner_lease_expires_at is null
      and (
        (
          prior.provider_cleanup_status = 'pending'
          and prior.provider_snapshot_status = 'pending' and prior.provider_snapshot_seal_version = 0
          and prior.provider_snapshot_target_count = 0 and prior.provider_verified_absent_count = 0
          and prior.provider_sub_finalized_at is null and prior.provider_locator_scrubbed_at is null
          and not exists (select 1 from public.account_deletion_provider_targets t where t.deletion_request_id = prior.id)
        ) or (
          prior.provider_cleanup_status in ('succeeded', 'not_needed')
          and prior.provider_snapshot_version = 'g5d-2a.account-provider.v1'
          and prior.provider_snapshot_status = 'sealed' and prior.provider_snapshot_seal_version = 1
          and prior.provider_snapshot_sealed_at is not null and prior.provider_sub_finalized_at is not null
          and prior.provider_locator_scrubbed_at = prior.provider_sub_finalized_at
          and prior.provider_snapshot_target_count = (
            select count(*) from public.account_deletion_provider_targets t where t.deletion_request_id = prior.id
          )
          and prior.provider_verified_absent_count = prior.provider_snapshot_target_count
          and (
            (prior.provider_cleanup_status = 'not_needed' and prior.provider_snapshot_target_count = 0)
            or (prior.provider_cleanup_status = 'succeeded' and prior.provider_snapshot_target_count > 0)
          )
          and not exists (
            select 1 from public.account_deletion_provider_targets t where t.deletion_request_id = prior.id and (
              t.user_id is distinct from v_owned_user_id or t.status <> 'verified_absent'
              or t.reconciliation_status <> 'verified_absent' or t.verified_absent_at is null
              or t.locator_scrubbed_at is distinct from prior.provider_sub_finalized_at
              or t.source_voice_id is not null or t.provider_name is not null
              or t.provider_resource_id is not null or t.target_fingerprint is not null
              or t.next_retry_at is not null or t.last_failure_category is not null
              or t.manual_required_at is not null
            )
          )
        )
      )
      and (
        (
          prior.storage_cleanup_status = 'pending'
          and prior.storage_snapshot_status = 'pending' and prior.storage_snapshot_seal_version = 0
          and prior.storage_snapshot_target_count = 0 and prior.storage_verified_absent_count = 0
          and prior.storage_sub_finalized_at is null and prior.storage_locator_scrubbed_at is null
          and not exists (select 1 from public.account_deletion_storage_targets t where t.deletion_request_id = prior.id)
        ) or (
          prior.storage_cleanup_status in ('succeeded', 'not_needed')
          and prior.storage_snapshot_version = 'g5d-2e.account-storage.v1'
          and prior.storage_snapshot_status = 'sealed' and prior.storage_snapshot_seal_version = 1
          and prior.storage_snapshot_collection_token is null and prior.storage_snapshot_fingerprint is null
          and prior.storage_snapshot_collection_started_at is not null
          and prior.storage_snapshot_sealed_at is not null and prior.storage_sub_finalized_at is not null
          and prior.storage_locator_scrubbed_at = prior.storage_sub_finalized_at
          and prior.storage_snapshot_target_count = (
            select count(*) from public.account_deletion_storage_targets t where t.deletion_request_id = prior.id
          )
          and prior.storage_verified_absent_count = prior.storage_snapshot_target_count
          and (
            (prior.storage_cleanup_status = 'not_needed' and prior.storage_snapshot_target_count = 0)
            or (prior.storage_cleanup_status = 'succeeded' and prior.storage_snapshot_target_count > 0)
          )
          and not exists (
            select 1 from public.account_deletion_storage_targets t where t.deletion_request_id = prior.id and (
              t.user_id is distinct from v_owned_user_id or t.status <> 'verified_absent'
              or t.verification_status <> 'verified_absent' or t.verified_absent_at is null
              or t.locator_scrubbed_at is distinct from prior.storage_sub_finalized_at
              or t.storage_bucket is not null or t.storage_object_key is not null
              or t.target_fingerprint is not null or t.source_refs is not null
              or t.next_retry_at is not null or t.last_failure_category is not null
              or t.manual_required_at is not null
            )
          )
        )
      )
      and (
        (prior.db_cleanup_status = 'pending' and prior.db_sub_finalized_at is null
          and prior.db_observed_row_count = 0 and prior.db_deleted_row_count = 0
          and prior.db_anonymized_row_count = 0 and prior.db_retained_row_count = 0)
        or
        (prior.db_cleanup_status in ('succeeded', 'not_needed') and prior.db_sub_finalized_at is not null
          and prior.db_observed_row_count = prior.db_deleted_row_count
            + prior.db_anonymized_row_count + prior.db_retained_row_count)
      )
    )
  ) then
    raise exception using errcode = 'object_in_use', message = 'db_finalizer_prior_request_blocked';
  end if;

  select count(*) into v_prior_provider_targets from public.account_deletion_provider_targets
    where deletion_request_id = any(v_prior_request_ids);
  select count(*) into v_prior_storage_targets from public.account_deletion_storage_targets
    where deletion_request_id = any(v_prior_request_ids);

  -- Cross-owner FK anomalies could make a classified parent delete mutate User B.
  if exists (
    select 1 from public.scripts s join public.takes t on t.script_id = s.id
      where s.user_id = v_owned_user_id and t.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.scripts s join public.script_saved_model_audios saved on saved.script_id = s.id
      where s.user_id = v_owned_user_id and saved.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.scripts s join public.script_saved_best_takes saved on saved.script_id = s.id
      where s.user_id = v_owned_user_id and saved.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.takes t join public.script_saved_best_takes saved on saved.take_id = t.id
      where t.user_id = v_owned_user_id and saved.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.script_audios audio
      join public.scripts s on s.id = audio.script_id
      join public.script_saved_model_audios saved on saved.script_audio_id = audio.id
      where s.user_id = v_owned_user_id and saved.user_id <> v_owned_user_id
  ) or exists (
    select 1 from public.script_audios audio join public.scripts s on s.id = audio.script_id
      join public.voices voice on voice.id = audio.voice_id
      where (s.user_id = v_owned_user_id and voice.user_id <> v_owned_user_id)
         or (voice.user_id = v_owned_user_id and s.user_id <> v_owned_user_id)
  ) or exists (
    select 1 from public.voice_consents consent join public.voices voice on voice.consent_id = consent.id
      where consent.user_id = v_owned_user_id and voice.user_id <> v_owned_user_id
  ) then
    raise exception using errcode = 'check_violation', message = 'db_finalizer_cross_owner_relation_invalid';
  end if;

  if exists(select 1 from public.script_brush_up_candidates where user_id=v_owned_user_id
    and provider_cleanup_state not in ('not_created','verified_absent')) then
    raise exception using errcode='object_in_use',message='db_finalizer_brush_up_provider_unresolved'; end if;
  if exists(select 1 from public.script_brush_up_candidates where user_id=v_owned_user_id
    and asset_cleanup_state in ('pending','failed')) then
    raise exception using errcode='object_in_use',message='db_finalizer_brush_up_asset_unresolved'; end if;
  perform public.beta_quota_expire_stale_for_user(v_owned_user_id);
  if exists (select 1 from public.beta_quota_reservations
    where user_id = v_owned_user_id and status in ('reserved', 'provider_started')) then
    raise exception using errcode = 'object_in_use', message = 'db_finalizer_quota_operation_active';
  end if;

  if exists (select 1 from public.voice_asset_write_intents
    where user_id = v_owned_user_id and status in ('reserved', 'manual_required')) then
    raise exception using errcode = 'object_in_use', message = 'db_finalizer_write_intent_blocked';
  end if;
  if exists (select 1 from public.voice_asset_write_intents
    where user_id = v_owned_user_id and status not in ('completed', 'cancelled')) then
    raise exception using errcode = 'check_violation', message = 'db_finalizer_write_intent_invalid';
  end if;

  -- Failed voice operations cannot be mapped uniquely to the already-scrubbed
  -- account Provider/Storage target locators, so they remain fail-closed.
  if exists (
    select 1 from public.voice_deletion_operations as operation
    where operation.user_id = v_owned_user_id and not (
      operation.status = 'completed'
      and operation.current_stage is null
      and operation.snapshot_version = 'g5c-b.voice-only.v1'
      and operation.snapshot_status = 'succeeded'
      and operation.consent_withdrawal_status in ('succeeded', 'not_needed')
      and operation.post_delete_verification_status = 'succeeded'
      and operation.completed_at is not null
      and operation.sensitive_snapshot_scrubbed_at is not null
      and operation.consent_snapshot_id is null
      and cardinality(operation.consent_snapshot_ids) = 0
      and operation.lease_token is null and operation.lease_expires_at is null
      and operation.audit_expires_at = operation.completed_at + interval '90 days'
      and not exists (
        select 1 from public.voice_deletion_targets as target
        where target.operation_id = operation.id and (
          target.user_id is distinct from v_owned_user_id
          or target.status <> 'verified_absent' or target.locator_scrubbed_at is null
          or target.source_row_id is not null or target.provider_name is not null
          or target.provider_resource_id is not null or target.storage_bucket is not null
          or target.storage_object_key is not null or target.target_fingerprint is not null
        )
      )
    )
  ) or exists (
    select 1 from public.voice_deletion_targets as target
    left join public.voice_deletion_operations as operation on operation.id = target.operation_id
    where target.user_id = v_owned_user_id and operation.user_id is distinct from v_owned_user_id
  ) then
    raise exception using errcode = 'object_in_use', message = 'db_finalizer_voice_operation_blocked';
  end if;

  select
    coalesce(array_agg(operation.id order by operation.id)
      filter (where operation.audit_expires_at > v_now or v_retained_hold), '{}'::uuid[]),
    coalesce(array_agg(operation.id order by operation.id)
      filter (where operation.audit_expires_at <= v_now and not v_retained_hold), '{}'::uuid[])
  into v_voice_retain_ids, v_voice_expired_ids
  from public.voice_deletion_operations as operation
  where operation.user_id = v_owned_user_id;
  select count(*) into v_voice_retain_targets from public.voice_deletion_targets
    where operation_id = any(v_voice_retain_ids);
  select count(*) into v_voice_expired_targets from public.voice_deletion_targets
    where operation_id = any(v_voice_expired_ids);

  select
    coalesce(array_agg(event.id order by event.id)
      filter (where event.retention_expires_at > v_now or v_retained_hold), '{}'::uuid[]),
    coalesce(array_agg(event.id order by event.id)
      filter (where event.retention_expires_at <= v_now and not v_retained_hold), '{}'::uuid[])
  into v_quota_retain_ids, v_quota_expired_ids
  from public.quota_events as event
  where event.user_id = v_owned_user_id;

  select count(*) into v_quota_reservations from public.beta_quota_reservations where user_id = v_owned_user_id;
  select count(*) into v_brush_candidates from public.script_brush_up_candidates where user_id=v_owned_user_id;
  select count(*) into v_brush_consents from public.script_brush_up_consents where user_id=v_owned_user_id;
  select count(*) into v_revisions from public.script_revisions r join public.scripts s on s.id=r.script_id where s.user_id=v_owned_user_id;
  select count(*) into v_source_uses from public.voice_source_uses where user_id=v_owned_user_id;
  -- v2 inventories the two additional cascade children explicitly.
  select
    (select count(*) from public.profiles where id = v_owned_user_id),
    (select count(*) from public.scripts where user_id = v_owned_user_id),
    (select count(*) from public.script_audios audio join public.scripts s on s.id = audio.script_id
      where s.user_id = v_owned_user_id),
    (select count(*) from public.takes where user_id = v_owned_user_id),
    (select count(*) from public.weak_words word join public.takes take on take.id = word.take_id
      where take.user_id = v_owned_user_id),
    (select count(*) from public.coach_feedback feedback join public.takes take on take.id = feedback.take_id
      where take.user_id = v_owned_user_id),
    (select count(*) from public.script_saved_model_audios where user_id = v_owned_user_id),
    (select count(*) from public.script_saved_best_takes where user_id = v_owned_user_id),
    (select count(*) from public.voices where user_id = v_owned_user_id),
    (select count(*) from public.voice_consents where user_id = v_owned_user_id),
    (select count(*) from public.processing_consents where user_id = v_owned_user_id),
    (select count(*) from public.voice_deletion_operations where user_id = v_owned_user_id),
    (select count(*) from public.voice_deletion_targets where user_id = v_owned_user_id),
    (select count(*) from public.voice_asset_write_intents where user_id = v_owned_user_id),
    (select count(*) from public.account_deletion_requests where user_id = v_owned_user_id),
    (select count(*) from public.account_deletion_provider_targets where user_id = v_owned_user_id),
    (select count(*) from public.quota_events where user_id = v_owned_user_id),
    (select count(*) from public.account_deletion_storage_targets where user_id = v_owned_user_id)
  into v_profiles, v_scripts, v_script_audios, v_takes, v_weak_words, v_coach_feedback,
    v_saved_model, v_saved_best, v_voices, v_voice_consents, v_processing_consents,
    v_voice_operations, v_voice_targets, v_write_intents, v_requests, v_provider_targets,
    v_quota_events, v_storage_targets;

  v_deleted := v_revisions + v_source_uses + v_profiles + v_scripts + v_script_audios + v_takes + v_weak_words
    + v_coach_feedback + v_saved_model + v_saved_best + v_voices + v_voice_consents
    + v_processing_consents + cardinality(v_voice_expired_ids) + v_voice_expired_targets
    + v_write_intents + v_quota_reservations + v_brush_candidates + v_brush_consents + cardinality(v_prior_request_ids) + v_prior_provider_targets
    + v_prior_storage_targets + cardinality(v_quota_expired_ids);
  v_anonymized := cardinality(v_voice_retain_ids) + v_voice_retain_targets
    + cardinality(v_quota_retain_ids);
  v_retained := 1 + v_current_provider_targets + v_current_storage_targets;
  v_observed := v_revisions + v_source_uses + v_profiles + v_scripts + v_script_audios + v_takes + v_weak_words
    + v_coach_feedback + v_saved_model + v_saved_best + v_voices + v_voice_consents
    + v_processing_consents + v_voice_operations + v_voice_targets + v_write_intents
    + v_requests + v_provider_targets + v_quota_events + v_storage_targets + v_quota_reservations + v_brush_candidates + v_brush_consents;

  if v_observed <> v_deleted + v_anonymized + v_retained
    or greatest(v_observed, v_deleted, v_anonymized, v_retained) > v_int_max then
    raise exception using errcode = 'numeric_value_out_of_range', message = 'db_finalizer_count_partition_invalid';
  end if;

  delete from public.account_deletion_requests where id = any(v_prior_request_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_prior_request_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_prior_request_drift'; end if;

  delete from public.voice_deletion_operations where id = any(v_voice_expired_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_voice_expired_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_expiry_drift'; end if;

  update public.voice_deletion_operations set user_id = null, retention_account_deletion_request_id = p_deletion_request_id where id = any(v_voice_retain_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_voice_retain_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_anonymization_drift'; end if;

  delete from public.voice_asset_write_intents where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_write_intents then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_write_intent_drift'; end if;

  -- Candidates reference quota reservations and owned script audio. Remove
  -- their provenance first, while the Provider and Storage stages are sealed.
  delete from public.script_brush_up_candidates where user_id=v_owned_user_id;
  get diagnostics v_changed=row_count;
  if v_changed<>v_brush_candidates then raise exception using errcode='serialization_failure',message='db_finalizer_brush_candidate_drift'; end if;
  delete from public.script_brush_up_consents where user_id=v_owned_user_id;
  get diagnostics v_changed=row_count;
  if v_changed<>v_brush_consents then raise exception using errcode='serialization_failure',message='db_finalizer_brush_consent_drift'; end if;

  delete from public.beta_quota_reservations where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_quota_reservations then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_quota_reservation_drift'; end if;

  delete from public.quota_events where id = any(v_quota_expired_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_quota_expired_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_quota_expiry_drift'; end if;

  update public.quota_events
  set user_id = null, retention_account_deletion_request_id = p_deletion_request_id, subject_id = null, target_resource_id = null,
      idempotency_key = null, dedupe_key = null, request_fingerprint = null,
      provider_request_id = null, metadata = '{}'::jsonb, identifier_scrubbed_at = v_now
  where id = any(v_quota_retain_ids);
  get diagnostics v_changed = row_count;
  if v_changed <> cardinality(v_quota_retain_ids) then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_quota_anonymization_drift'; end if;

  -- weak_words, coach_feedback, and saved-best rows disappear through the take
  -- parent; script_audios and saved-model rows disappear through the script
  -- parent. They remain part of D from the pre-inventory above.
  delete from public.takes where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_takes then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_take_drift'; end if;
  delete from public.scripts where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_scripts then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_script_drift'; end if;
  delete from public.voices where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_voices then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_drift'; end if;
  delete from public.voice_consents where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_voice_consents then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_voice_consent_drift'; end if;
  delete from public.processing_consents where user_id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_processing_consents then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_processing_consent_drift'; end if;
  delete from public.profiles where id = v_owned_user_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_profiles then raise exception using errcode = 'serialization_failure', message = 'db_finalizer_profile_drift'; end if;

  -- Re-inventory and retained-shape verification before terminal persistence.
  if exists (select 1 from public.profiles where id = v_owned_user_id)
    or exists (select 1 from public.scripts where user_id = v_owned_user_id)
    or exists (select 1 from public.script_revisions r join public.scripts s on s.id=r.script_id where s.user_id=v_owned_user_id)
    or exists (select 1 from public.voice_source_uses where user_id=v_owned_user_id)
    or exists (select 1 from public.script_audios audio join public.scripts s on s.id = audio.script_id where s.user_id = v_owned_user_id)
    or exists (select 1 from public.takes where user_id = v_owned_user_id)
    or exists (select 1 from public.weak_words word join public.takes take on take.id = word.take_id where take.user_id = v_owned_user_id)
    or exists (select 1 from public.coach_feedback feedback join public.takes take on take.id = feedback.take_id where take.user_id = v_owned_user_id)
    or exists (select 1 from public.script_saved_model_audios where user_id = v_owned_user_id)
    or exists (select 1 from public.script_saved_best_takes where user_id = v_owned_user_id)
    or exists (select 1 from public.voices where user_id = v_owned_user_id)
    or exists (select 1 from public.voice_consents where user_id = v_owned_user_id)
    or exists (select 1 from public.processing_consents where user_id = v_owned_user_id)
    or exists (select 1 from public.voice_deletion_operations where user_id = v_owned_user_id)
    or exists (select 1 from public.voice_deletion_targets where user_id = v_owned_user_id)
    or exists (select 1 from public.voice_asset_write_intents where user_id = v_owned_user_id)
    or exists (select 1 from public.quota_events where user_id = v_owned_user_id)
    or exists (select 1 from public.beta_quota_reservations where user_id = v_owned_user_id)
    or exists (select 1 from public.account_deletion_requests where user_id = v_owned_user_id and id <> p_deletion_request_id)
    or (select count(*) from public.account_deletion_requests where id = p_deletion_request_id and user_id = v_owned_user_id) <> 1
    or (select count(*) from public.account_deletion_provider_targets where deletion_request_id = p_deletion_request_id and user_id = v_owned_user_id) <> v_current_provider_targets
    or (select count(*) from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id and user_id = v_owned_user_id) <> v_current_storage_targets then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_post_state_owned_inventory_invalid';
  end if;

  if (select count(*) from public.voice_deletion_operations where id = any(v_voice_retain_ids)
      and user_id is null and status = 'completed'
      and retention_account_deletion_request_id = p_deletion_request_id) <> cardinality(v_voice_retain_ids)
    or (select count(*) from public.voice_deletion_targets where operation_id = any(v_voice_retain_ids)
      and user_id is null and status = 'verified_absent' and locator_scrubbed_at is not null
      and source_row_id is null and provider_name is null and provider_resource_id is null
      and storage_bucket is null and storage_object_key is null and target_fingerprint is null) <> v_voice_retain_targets
    or exists (select 1 from public.voice_deletion_operations where id = any(v_voice_expired_ids))
    or exists (select 1 from public.voice_deletion_targets where operation_id = any(v_voice_expired_ids))
    or (select count(*) from public.quota_events where id = any(v_quota_retain_ids)
      and user_id is null and identifier_scrubbed_at = v_now
      and subject_id is null and target_resource_id is null and idempotency_key is null
      and dedupe_key is null and request_fingerprint is null and provider_request_id is null
      and metadata = '{}'::jsonb and (retention_expires_at > v_now or v_retained_hold)
      and retention_account_deletion_request_id = p_deletion_request_id) <> cardinality(v_quota_retain_ids)
    or exists (select 1 from public.quota_events where id = any(v_quota_expired_ids)) then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_post_state_retention_invalid';
  end if;

  -- Re-check retained current Provider/Storage evidence after every mutation.
  if exists (select 1 from public.account_deletion_provider_targets where deletion_request_id = p_deletion_request_id and (
      user_id is distinct from v_owned_user_id or status <> 'verified_absent'
      or reconciliation_status <> 'verified_absent' or locator_scrubbed_at is null
      or source_voice_id is not null or provider_name is not null
      or provider_resource_id is not null or target_fingerprint is not null))
    or exists (select 1 from public.account_deletion_storage_targets where deletion_request_id = p_deletion_request_id and (
      user_id is distinct from v_owned_user_id or status <> 'verified_absent'
      or verification_status <> 'verified_absent' or locator_scrubbed_at is null
      or storage_bucket is not null or storage_object_key is not null
      or target_fingerprint is not null or source_refs is not null)) then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_retained_stage_evidence_invalid';
  end if;

  v_terminal_status := case when v_deleted = 0 and v_anonymized = 0 then 'not_needed' else 'succeeded' end;
  update public.account_deletion_requests
  set status = 'confirmed', failure_stage = null, failure_reason_code = null,
      db_cleanup_status = v_terminal_status,
      db_inventory_version = 'script-brush-up.account-db.v4',
      db_observed_row_count = v_observed::integer,
      db_deleted_row_count = v_deleted::integer,
      db_anonymized_row_count = v_anonymized::integer,
      db_retained_row_count = v_retained::integer,
      db_sub_finalized_at = v_now, last_attempted_at = v_now,
      metadata = '{}'::jsonb
  where id = p_deletion_request_id and user_id = v_owned_user_id
  returning * into v_request;
  if not found then
    raise exception using errcode = 'serialization_failure', message = 'db_finalizer_terminal_write_lost';
  end if;

  return query select v_terminal_status, 'db_cleanup_finalized'::text,
    v_observed::integer, v_deleted::integer, v_anonymized::integer, v_retained::integer, false;
end;
$$;


revoke all on function public.finalize_account_deletion_database_stage(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_account_deletion_database_stage(uuid,uuid,text) to service_role;

commit;
