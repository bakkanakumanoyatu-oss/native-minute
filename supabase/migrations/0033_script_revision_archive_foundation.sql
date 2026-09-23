-- Local candidate only. Forward-only cutover; never infer historical Take content.
begin;
-- Fail before any baseline/write-contract change when v1 cleanup is in flight.
do $$ begin
 if exists(select 1 from public.account_deletion_requests where db_inventory_version='g5d-2h.account-db.v1'
   and db_cleanup_status not in ('succeeded','not_needed') and status not in ('cancelled','expired','completed')) then
   raise exception 'revision_cutover_requires_no_inflight_v1_deletion'; end if;
end; $$;

create table public.script_revisions (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  content text not null, locale text not null, target_seconds integer not null,
  origin text not null check (origin in ('create','edit','current_baseline')),
  created_at timestamptz not null default transaction_timestamp(),
  unique(script_id, id), unique(script_id, revision_no)
);
alter table public.scripts
  add column current_revision_id uuid,
  add column archived_at timestamptz,
  add column lock_version bigint not null default 1 check (lock_version > 0),
  add column practice_epoch bigint not null default 1 check (practice_epoch > 0),
  add constraint scripts_id_owner_unique unique(id, user_id);
insert into public.script_revisions(script_id, revision_no, content, locale, target_seconds, origin)
select id, 1, content, locale, target_seconds, 'current_baseline' from public.scripts;
update public.scripts s set current_revision_id = r.id from public.script_revisions r where r.script_id=s.id;
alter table public.scripts alter column current_revision_id set not null;
alter table public.scripts add constraint scripts_current_revision_fk foreign key(id,current_revision_id)
  references public.script_revisions(script_id,id) deferrable initially deferred;

-- NULL means UNVERIFIED_LEGACY, not an instruction to backfill.
alter table public.takes
  add column script_revision_id uuid,
  add column script_title_snapshot text,
  add column script_practice_epoch bigint,
  add constraint takes_revision_fk foreign key(script_id,script_revision_id)
    references public.script_revisions(script_id,id) deferrable initially deferred,
  add constraint takes_script_owner_fk foreign key(script_id,user_id)
    references public.scripts(id,user_id) on delete cascade,
  add constraint takes_revision_snapshot_shape check (
    (script_revision_id is null and script_title_snapshot is null and script_practice_epoch is null) or
    (script_revision_id is not null and script_title_snapshot is not null and script_practice_epoch > 0));
alter table public.script_audios
  add column script_revision_id uuid,
  add column generation_key_version smallint not null default 1 check(generation_key_version in (1,2)),
  add column generation_preset text,
  add column revision_binding text not null default 'legacy_unbound'
    check(revision_binding in ('legacy_unbound','baseline_compatible','generated')),
  add constraint script_audios_revision_fk foreign key(script_id,script_revision_id)
    references public.script_revisions(script_id,id) deferrable initially deferred,
  add constraint script_audios_revision_shape check (
    (script_revision_id is null and revision_binding='legacy_unbound' and generation_key_version=1) or
    (script_revision_id is not null and revision_binding='baseline_compatible' and generation_key_version=1) or
    (script_revision_id is not null and revision_binding='generated' and generation_key_version=2 and generation_preset is not null));
alter table public.voice_asset_write_intents
  add column script_revision_id uuid,
  add column script_practice_epoch bigint,
  add column generation_preset text;
-- Writer identities intentionally have no FK: deletion/cleanup retains durable evidence.
create index scripts_active_owner on public.scripts(user_id,updated_at desc) where archived_at is null;
create index scripts_archived_owner on public.scripts(user_id,archived_at desc) where archived_at is not null;
create index takes_revision_history on public.takes(user_id,script_id,script_revision_id,created_at desc) where status='reviewed';
create unique index script_audios_revision_cache on public.script_audios(script_id,script_revision_id,cache_key) where script_revision_id is not null;

alter table public.script_revisions enable row level security;
revoke all on public.script_revisions from public,anon,authenticated,service_role;
grant select on public.script_revisions to authenticated,service_role;
create policy script_revisions_owner_read on public.script_revisions for select to authenticated
  using(exists(select 1 from public.scripts s where s.id=script_id and s.user_id=auth.uid()));
drop policy scripts_crud_own on public.scripts;
create policy scripts_read_own on public.scripts for select to authenticated using(user_id=auth.uid());
drop policy takes_crud_own on public.takes;
create policy takes_read_own on public.takes for select to authenticated using(user_id=auth.uid());
create policy takes_metadata_own on public.takes for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
-- Ordinary product callers can only read scripts and change personal Take metadata.
revoke insert,update,delete,truncate,references,trigger on public.scripts from public,anon,authenticated,service_role;
revoke insert,update,delete,truncate,references,trigger on public.takes from public,anon,authenticated,service_role;
grant update(favorite,display_name) on public.takes to authenticated;
revoke insert,update,delete,truncate on public.weak_words,public.coach_feedback from public,anon,authenticated,service_role;

create function public.script_owner_write_lock(p_user_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_user_id is null then raise exception using errcode='42501',message='auth_required'; end if;
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  if exists(select 1 from public.account_deletion_requests where user_id=p_user_id and status in
    ('requested','confirmed','processing','provider_cleanup_failed','storage_cleanup_failed','db_cleanup_failed','auth_cleanup_failed'))
    or public.account_deletion_db_writer_fence_active(p_user_id) then
    raise exception using errcode='55006',message='account_deletion_active';
  end if;
end; $$;

create function public.assert_script_practice(p_user_id uuid,p_script_id uuid,p_revision_id uuid,p_epoch bigint)
returns public.scripts language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.scripts;
begin
  perform public.script_owner_write_lock(p_user_id);
  select * into s from public.scripts where id=p_script_id and user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='script_not_found'; end if;
  if s.archived_at is not null then raise exception using errcode='40001',message='script_archived'; end if;
  if p_revision_id is null or s.current_revision_id is distinct from p_revision_id then
    raise exception using errcode='40001',message='script_revision_conflict'; end if;
  if p_epoch is null or s.practice_epoch is distinct from p_epoch then
    raise exception using errcode='40001',message='practice_state_conflict'; end if;
  return s;
end; $$;

create function public.guard_script_revision() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid;
begin
  if tg_op='UPDATE' then raise exception using errcode='23514',message='script_revision_immutable'; end if;
  select user_id into owner_id from public.scripts where id=new.script_id;
  perform public.script_owner_write_lock(owner_id);
  return new;
end; $$;
create trigger guard_script_revision before insert or update on public.script_revisions
  for each row execute function public.guard_script_revision();
create function public.check_script_projection() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.scripts s left join public.script_revisions r
    on r.script_id=s.id and r.id=s.current_revision_id where s.id=new.id
    and (r.id is null or row(s.content,s.locale,s.target_seconds) is distinct from row(r.content,r.locale,r.target_seconds))) then
    raise exception using errcode='23514',message='script_projection_mismatch'; end if;
  return null;
end; $$;
create constraint trigger check_script_projection after insert or update on public.scripts
  deferrable initially deferred for each row execute function public.check_script_projection();
create function public.guard_script_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
    raise exception using errcode='23514',message='script_owner_immutable'; end if;
  perform public.script_owner_write_lock(new.user_id);
  return new;
end; $$;
create trigger guard_script_identity before update on public.scripts for each row execute function public.guard_script_identity();

create function public.create_script(p_title text,p_content text,p_locale text,p_target_seconds integer)
returns public.scripts language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); s public.scripts; sid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid();
begin
  perform public.script_owner_write_lock(u);
  if (select count(*) from public.scripts where user_id=u and archived_at is null)>=10 then
    raise exception using errcode='40001',message='script_limit_reached'; end if;
  if length(btrim(p_title)) not between 1 and 120 or length(btrim(p_content)) not between 1 and 4000
    or length(btrim(p_locale))<2 or p_target_seconds not between 15 and 120 then
    raise exception using errcode='22023',message='request_invalid'; end if;
  insert into public.scripts(id,user_id,title,content,locale,target_seconds,current_revision_id)
    values(sid,u,p_title,p_content,p_locale,p_target_seconds,rid) returning * into s;
  insert into public.script_revisions(id,script_id,revision_no,content,locale,target_seconds,origin)
    values(rid,sid,1,p_content,p_locale,p_target_seconds,'create');
  return s;
end; $$;

create function public.edit_script(p_script_id uuid,p_expected_revision_id uuid,p_expected_lock_version bigint,p_patch jsonb)
returns public.scripts language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.scripts; rid uuid; title_value text; content_value text; locale_value text; seconds_value integer;
begin
  perform public.script_owner_write_lock(auth.uid());
  select * into s from public.scripts where id=p_script_id and user_id=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='script_not_found'; end if;
  if s.archived_at is not null then raise exception using errcode='40001',message='script_archived'; end if;
  if p_expected_revision_id is distinct from s.current_revision_id or p_expected_lock_version is distinct from s.lock_version then
    raise exception using errcode='40001',message='script_edit_conflict'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('title','content','locale','target_seconds')) then
    raise exception using errcode='22023',message='request_invalid'; end if;
  title_value:=coalesce(p_patch->>'title',s.title); content_value:=coalesce(p_patch->>'content',s.content);
  locale_value:=coalesce(p_patch->>'locale',s.locale); seconds_value:=coalesce((p_patch->>'target_seconds')::integer,s.target_seconds);
  if length(btrim(title_value)) not between 1 and 120 or length(btrim(content_value)) not between 1 and 4000
    or length(btrim(locale_value))<2 or seconds_value not between 15 and 120 then
    raise exception using errcode='22023',message='request_invalid'; end if;
  if row(title_value,content_value,locale_value,seconds_value)=row(s.title,s.content,s.locale,s.target_seconds) then return s; end if;
  rid:=s.current_revision_id;
  if row(content_value,locale_value,seconds_value) is distinct from row(s.content,s.locale,s.target_seconds) then
    insert into public.script_revisions(script_id,revision_no,content,locale,target_seconds,origin)
    select s.id,max(revision_no)+1,content_value,locale_value,seconds_value,'edit'
      from public.script_revisions where script_id=s.id returning id into rid;
  end if;
  update public.scripts set title=title_value,content=content_value,locale=locale_value,target_seconds=seconds_value,
    current_revision_id=rid, lock_version=lock_version+1,
    practice_epoch=practice_epoch+case when current_revision_id=rid then 0 else 1 end
    where id=s.id returning * into s;
  return s;
end; $$;

create function public.set_script_archived(p_script_id uuid,p_archived boolean,p_expected_lock_version bigint)
returns public.scripts language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.scripts;
begin
  perform public.script_owner_write_lock(auth.uid());
  select * into s from public.scripts where id=p_script_id and user_id=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='script_not_found'; end if;
  if p_archived is null then raise exception using errcode='22023',message='request_invalid'; end if;
  -- Repeated single-direction requests are harmless, including stale retries.
  if (s.archived_at is not null)=p_archived then return s; end if;
  if p_expected_lock_version is distinct from s.lock_version then
    raise exception using errcode='40001',message='script_edit_conflict'; end if;
  if not p_archived and (select count(*) from public.scripts where user_id=auth.uid() and archived_at is null)>=10 then
    raise exception using errcode='40001',message='script_limit_reached'; end if;
  update public.scripts set archived_at=case when p_archived then transaction_timestamp() else null end,
    lock_version=lock_version+1,practice_epoch=practice_epoch+1 where id=s.id returning * into s;
  return s;
end; $$;

-- The previous reservation signature cannot reserve practice work without identity.
alter function public.reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text) rename to revision_base_reserve_voice_asset;
revoke all on function public.revision_base_reserve_voice_asset(uuid,text,uuid,integer,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
create function public.reserve_voice_asset_write_intent(
  p_user_id uuid,p_kind text,p_lease_token uuid,p_lease_seconds integer,
  p_script_id uuid default null,p_voice_id uuid default null,p_cache_key text default null,
  p_storage_bucket text default null,p_storage_object_key text default null,
  p_script_revision_id uuid default null,p_script_practice_epoch bigint default null,p_generation_preset text default null)
returns public.voice_asset_write_intents language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.voice_asset_write_intents;
begin
  if p_kind in ('script_audio_create','recording_upload') then
    perform public.assert_script_practice(p_user_id,p_script_id,p_script_revision_id,p_script_practice_epoch);
    if p_kind='recording_upload' and exists(select 1 from public.voice_asset_write_intents
      where user_id=p_user_id and kind='recording_upload' and storage_object_key=p_storage_object_key
        and (script_revision_id is distinct from p_script_revision_id or script_practice_epoch is distinct from p_script_practice_epoch)) then
      raise exception using errcode='40001',message='recording_revision_conflict'; end if;
    if p_kind='script_audio_create' and nullif(p_generation_preset,'') is null then
      raise exception using errcode='22023',message='request_invalid'; end if;
  end if;
  v:=public.revision_base_reserve_voice_asset(p_user_id,p_kind,p_lease_token,p_lease_seconds,
    p_script_id,p_voice_id,p_cache_key,p_storage_bucket,p_storage_object_key);
  update public.voice_asset_write_intents set script_revision_id=p_script_revision_id,
    script_practice_epoch=p_script_practice_epoch,generation_preset=p_generation_preset where id=v.id returning * into v;
  return v;
end; $$;

-- Only this restricted claim may create new Takes. Existing NULL rows remain legacy.
create function public.claim_review_take(p_take_id uuid,p_script_id uuid,p_audio_path text,p_revision_id uuid,p_epoch bigint)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.scripts; t public.takes;
begin
  perform public.script_owner_write_lock(auth.uid());
  select * into t from public.takes where id=p_take_id for update;
  if found then
    if t.user_id is distinct from auth.uid() or t.script_id is distinct from p_script_id
      or t.audio_path is distinct from p_audio_path or t.script_revision_id is null
      or t.script_revision_id is distinct from p_revision_id or t.script_practice_epoch is distinct from p_epoch then return 'conflict'; end if;
    if t.status='reviewed' then return 'reviewed'; end if;
    if t.status='pending' then return 'processing'; end if;
    return 'conflict';
  end if;
  s:=public.assert_script_practice(auth.uid(),p_script_id,p_revision_id,p_epoch);
  if not exists(select 1 from public.voice_asset_write_intents where user_id=auth.uid()
    and kind='recording_upload' and status='completed' and script_id=p_script_id
    and script_revision_id=p_revision_id and script_practice_epoch=p_epoch
    and p_audio_path='storage://recordings/'||storage_object_key) then
    raise exception using errcode='40001',message='recording_revision_conflict'; end if;
  insert into public.takes(id,user_id,script_id,audio_path,status,script_revision_id,script_title_snapshot,script_practice_epoch)
    values(p_take_id,auth.uid(),p_script_id,p_audio_path,'pending',p_revision_id,s.title,p_epoch);
  return 'claimed';
end; $$;
create function public.release_review_take_claim(p_take_id uuid,p_script_id uuid,p_audio_path text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.g5c_b4_lock_voice_asset_user(auth.uid());
  delete from public.takes where id=p_take_id and user_id=auth.uid() and script_id=p_script_id
    and audio_path=p_audio_path and status='pending' and script_revision_id is not null;
end; $$;

create function public.guard_take_revision_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and row(new.id,new.user_id,new.script_id,new.script_revision_id,new.script_title_snapshot,new.script_practice_epoch,new.audio_path)
    is distinct from row(old.id,old.user_id,old.script_id,old.script_revision_id,old.script_title_snapshot,old.script_practice_epoch,old.audio_path) then
    raise exception using errcode='23514',message='take_identity_immutable'; end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.status is distinct from old.status) then
    perform public.assert_script_practice(new.user_id,new.script_id,new.script_revision_id,new.script_practice_epoch);
  end if;
  return new;
end; $$;
create trigger guard_take_revision_identity before insert or update on public.takes for each row execute function public.guard_take_revision_identity();

create or replace function public.finalize_recording_upload_write_intent(
  p_intent_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_storage_object_key text
)
returns public.voice_asset_write_intents
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.voice_asset_write_intents;
begin
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);
  select * into v_intent from public.voice_asset_write_intents
  where id = p_intent_id and user_id = p_user_id for update;

  if not found or v_intent.kind <> 'recording_upload' or v_intent.status <> 'reserved'
    or v_intent.lease_token is distinct from p_lease_token or v_intent.lease_expires_at <= now()
    or v_intent.storage_bucket <> 'recordings'
    or v_intent.storage_object_key is distinct from p_storage_object_key then
    raise exception using errcode = 'check_violation', message = 'recording upload writer finalization rejected';
  end if;

  perform public.assert_script_practice(p_user_id,v_intent.script_id,v_intent.script_revision_id,v_intent.script_practice_epoch);
  update public.voice_asset_write_intents
  set status = 'completed', lease_token = null, lease_expires_at = null
  where id = p_intent_id returning * into v_intent;
  return v_intent;
end;
$$;

create or replace function public.finalize_script_audio_write_intent(
  p_intent_id uuid,
  p_user_id uuid,
  p_lease_token uuid,
  p_provider text,
  p_storage_path text,
  p_stored_asset jsonb,
  p_duration_seconds numeric default null
)
returns public.script_audios
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.voice_asset_write_intents;
  v_script_user_id uuid;
  v_voice_user_id uuid;
  v_voice_provider text;
  v_audio public.script_audios;
begin
  perform public.g5c_b4_lock_voice_asset_user(p_user_id);

  select * into v_intent from public.voice_asset_write_intents
  where id = p_intent_id and user_id = p_user_id for update;
  select user_id into v_script_user_id from public.scripts where id = v_intent.script_id;
  select user_id, provider into v_voice_user_id, v_voice_provider from public.voices where id = v_intent.voice_id;

  if v_intent.id is null or v_intent.kind <> 'script_audio_create' or v_intent.status <> 'reserved'
    or v_intent.lease_token is distinct from p_lease_token or v_intent.lease_expires_at <= now()
    or v_script_user_id is distinct from p_user_id or v_voice_user_id is distinct from p_user_id
    or p_provider is distinct from v_voice_provider or nullif(p_storage_path, '') is null
    or jsonb_typeof(p_stored_asset) <> 'object'
    or p_stored_asset ->> 'storageBucket' is distinct from v_intent.storage_bucket
    or p_stored_asset ->> 'storageObjectKey' is distinct from v_intent.storage_object_key then
    raise exception using errcode = 'check_violation', message = 'script audio writer finalization rejected';
  end if;

  perform public.assert_script_practice(p_user_id,v_intent.script_id,v_intent.script_revision_id,v_intent.script_practice_epoch);
  insert into public.script_audios (
    script_id, voice_id, provider, cache_key, storage_path, stored_asset, duration_seconds, script_revision_id, generation_key_version, generation_preset, revision_binding
  ) values (
    v_intent.script_id, v_intent.voice_id, p_provider, v_intent.cache_key,
    p_storage_path, p_stored_asset, p_duration_seconds, v_intent.script_revision_id, 2, v_intent.generation_preset, 'generated'
  ) returning * into v_audio;

  update public.voice_asset_write_intents
  set status = 'completed', lease_token = null, lease_expires_at = null,
      storage_bucket = null, storage_object_key = null
  where id = p_intent_id;

  return v_audio;
end;
$$;

revoke all on function public.persist_review_bundle(uuid,uuid,text,integer,text,numeric,integer,text,numeric,numeric,numeric,text,jsonb,jsonb,jsonb,text,text,jsonb,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.persist_review_bundle(
  p_take_id uuid,
  p_script_id uuid,
  p_audio_path text,
  p_duration_seconds integer,
  p_status text,
  p_score numeric,
  p_total_words integer,
  p_transcript_text text,
  p_accuracy_score numeric,
  p_fluency_score numeric,
  p_rhythm_score numeric,
  p_evaluation_summary_ja text,
  p_evaluation_strengths_ja jsonb,
  p_evaluation_payload jsonb,
  p_coach_feedback_payload jsonb,
  p_coach_title text,
  p_coach_summary text,
  p_coach_bullets jsonb,
  p_coach_next_step text,
  p_coach_focus_words jsonb,
  p_weak_words jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  persisted_take_id uuid;
  claimed public.takes;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.scripts
    where id = p_script_id
      and user_id = current_user_id
  ) then
    raise exception 'script not found or access denied';
  end if;

  perform public.script_owner_write_lock(current_user_id);
  select * into claimed from public.takes where id=p_take_id and user_id=current_user_id for update;
  if not found or claimed.script_revision_id is null or claimed.script_id is distinct from p_script_id
    or claimed.audio_path is distinct from p_audio_path or p_status is distinct from 'reviewed' then
    raise exception using errcode='40001',message='review_claim_conflict'; end if;
  if claimed.status='reviewed' then return claimed.id; end if;
  if claimed.status<>'pending' then raise exception using errcode='40001',message='review_claim_conflict'; end if;
  perform public.assert_script_practice(current_user_id,p_script_id,claimed.script_revision_id,claimed.script_practice_epoch);
  update public.takes set duration_seconds=p_duration_seconds,status='reviewed',score=p_score,total_words=p_total_words,
    transcript_text=p_transcript_text,accuracy_score=p_accuracy_score,fluency_score=p_fluency_score,rhythm_score=p_rhythm_score,
    evaluation_summary_ja=p_evaluation_summary_ja,evaluation_strengths_ja=coalesce(p_evaluation_strengths_ja,'[]'::jsonb),
    evaluation_payload=coalesce(p_evaluation_payload,'{}'::jsonb),coach_feedback_payload=coalesce(p_coach_feedback_payload,'{}'::jsonb),
    reviewed_at=now() where id=claimed.id returning id into persisted_take_id;

  if persisted_take_id is null then
    raise exception 'take not found or access denied';
  end if;

  delete from public.weak_words where take_id = persisted_take_id;

  insert into public.weak_words (take_id, word, score, note)
  select
    persisted_take_id,
    item ->> 'word',
    nullif(item ->> 'score', '')::numeric,
    nullif(item ->> 'note', '')
  from jsonb_array_elements(coalesce(p_weak_words, '[]'::jsonb)) as item
  where coalesce(nullif(item ->> 'word', ''), '') <> '';

  delete from public.coach_feedback where take_id = persisted_take_id;

  insert into public.coach_feedback (
    take_id,
    locale,
    title,
    summary,
    bullets,
    next_step,
    focus_words
  )
  values (
    persisted_take_id,
    'ja',
    coalesce(p_coach_title, '日本語コーチング'),
    coalesce(p_coach_summary, ''),
    coalesce(p_coach_bullets, '[]'::jsonb),
    coalesce(p_coach_next_step, ''),
    coalesce(p_coach_focus_words, '[]'::jsonb)
  );

  return persisted_take_id;
end;
$$;
grant execute on function public.persist_review_bundle(uuid,uuid,text,integer,text,numeric,integer,text,numeric,numeric,numeric,text,jsonb,jsonb,jsonb,text,text,jsonb,text,jsonb,jsonb) to authenticated;

create function public.guard_script_audio_revision() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.voice_asset_write_intents; u uuid;
begin
  if tg_op='UPDATE' then
    if row(new.script_id,new.script_revision_id,new.cache_key,new.generation_key_version,new.generation_preset,new.revision_binding)
      is distinct from row(old.script_id,old.script_revision_id,old.cache_key,old.generation_key_version,old.generation_preset,old.revision_binding) then
      raise exception using errcode='23514',message='audio_revision_immutable'; end if;
    return new;
  end if;
  select user_id into u from public.scripts where id=new.script_id;
  perform public.script_owner_write_lock(u);
  select * into i from public.voice_asset_write_intents where user_id=u and script_id=new.script_id
    and kind='script_audio_create' and status='reserved' and script_revision_id=new.script_revision_id and cache_key=new.cache_key;
  if not found then raise exception using errcode='23514',message='audio_revision_reservation_required'; end if;
  perform public.assert_script_practice(u,new.script_id,new.script_revision_id,i.script_practice_epoch);
  return new;
end; $$;
create trigger guard_script_audio_revision before insert or update on public.script_audios for each row execute function public.guard_script_audio_revision();
revoke all on function public.guard_script_audio_revision() from public,anon,authenticated,service_role;

-- Explicit ACLs for every new function; no PUBLIC default EXECUTE.
revoke all on function public.script_owner_write_lock(uuid),public.assert_script_practice(uuid,uuid,uuid,bigint),
 public.guard_script_revision(),public.check_script_projection(),public.guard_script_identity(),public.guard_take_revision_identity(),
 public.create_script(text,text,text,integer),public.edit_script(uuid,uuid,bigint,jsonb),public.set_script_archived(uuid,boolean,bigint),
 public.claim_review_take(uuid,uuid,text,uuid,bigint),public.release_review_take_claim(uuid,uuid,text),
 public.reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text,uuid,bigint,text)
 from public,anon,authenticated,service_role;
grant execute on function public.create_script(text,text,text,integer),public.edit_script(uuid,uuid,bigint,jsonb),
 public.set_script_archived(uuid,boolean,bigint),public.claim_review_take(uuid,uuid,text,uuid,bigint),
 public.release_review_take_claim(uuid,uuid,text) to authenticated;
grant execute on function public.reserve_voice_asset_write_intent(uuid,text,uuid,integer,uuid,uuid,text,text,text,uuid,bigint,text) to service_role;
comment on column public.takes.script_revision_id is 'NULL = UNVERIFIED_LEGACY; never infer from current script.';
comment on table public.script_revisions is 'Immutable content; title at evaluation is stored on the Take. current_baseline is an observation at migration, not historical proof.';
commit;
