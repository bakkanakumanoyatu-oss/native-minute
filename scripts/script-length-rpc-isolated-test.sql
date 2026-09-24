-- Runs only in the network-disabled local PostgreSQL fixture. The runner
-- prepends script_length_rpc_cases with expected counts from lib/script-length.ts.
do $$
declare bad_labels text;
begin
  select string_agg(c.label, ', ' order by c.label) into bad_labels
  from pg_temp.script_length_rpc_cases c
  cross join lateral script_length_private.count_script_length(c.content) counts
  where row(counts.word_count, counts.character_count)
    is distinct from row(c.word_count, c.character_count);
  if bad_labels is not null then raise exception 'JS/PostgreSQL count mismatch: %', bad_labels; end if;
  if has_schema_privilege('authenticated','script_length_private','USAGE')
    or has_schema_privilege('anon','script_length_private','USAGE')
    or has_schema_privilege('service_role','script_length_private','USAGE')
    or has_function_privilege('authenticated','script_length_private.count_script_length(text)','EXECUTE')
    or has_function_privilege('anon','script_length_private.count_script_length(text)','EXECUTE')
    or has_function_privilege('service_role','script_length_private.count_script_length(text)','EXECUTE') then
    raise exception 'private helper grant leaked'; end if;
  if not has_function_privilege('authenticated','public.create_script(text,text,text,integer)','EXECUTE')
    or not has_function_privilege('authenticated','public.edit_script(uuid,uuid,bigint,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.create_script(text,text,text,integer)','EXECUTE')
    or has_function_privilege('anon','public.edit_script(uuid,uuid,bigint,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.create_script(text,text,text,integer)','EXECUTE')
    or has_function_privilege('service_role','public.edit_script(uuid,uuid,bigint,jsonb)','EXECUTE') then
    raise exception 'public RPC grant mismatch'; end if;
  if (select count(*) from pg_proc where oid in (
      'public.create_script(text,text,text,integer)'::regprocedure,
      'public.edit_script(uuid,uuid,bigint,jsonb)'::regprocedure)
      and prosecdef and proconfig @> array['search_path=pg_catalog, public']) <> 2 then
    raise exception 'SECURITY DEFINER/search_path contract changed'; end if;
end $$;

insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000071','length-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000072','length-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000073','length-quota@example.invalid');

-- Simulate a retained pre-guard body, including one beyond 0033's old 4000
-- character validation. This is fixture setup, not a migration rewrite.
begin;
insert into public.scripts(id,user_id,title,content,locale,target_seconds,current_revision_id)
values('20000000-0000-4000-8000-000000000071','10000000-0000-4000-8000-000000000071',
  'Existing long',repeat('L',4501),'en-US',60,'60000000-0000-4000-8000-000000000071');
insert into public.script_revisions(id,script_id,revision_no,content,locale,target_seconds,origin)
values('60000000-0000-4000-8000-000000000071','20000000-0000-4000-8000-000000000071',
  1,repeat('L',4501),'en-US',60,'current_baseline');
commit;

grant select on pg_temp.script_length_rpc_cases to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000071',false);

-- These calls run as the actual authenticated role, with no service/API layer.
do $$
declare c record; created public.scripts; before_count integer;
begin
  for c in select * from pg_temp.script_length_rpc_cases where allowed order by label loop
    created := public.create_script(c.label,c.content,'en-US',60);
    if created.user_id is distinct from auth.uid() or created.content is distinct from c.content then
      raise exception 'direct create returned wrong owner/content: %',c.label; end if;
    perform public.set_script_archived(created.id,true,created.lock_version);
  end loop;
  for c in select * from pg_temp.script_length_rpc_cases where not allowed order by label loop
    select count(*) into before_count from public.scripts where user_id=auth.uid();
    begin
      perform public.create_script(c.label,c.content,'en-US',60);
      raise exception 'direct create incorrectly accepted %',c.label;
    exception when sqlstate '22023' then
      if sqlerrm <> 'request_invalid' then raise; end if;
    end;
    if (select count(*) from public.scripts where user_id=auth.uid()) <> before_count then
      raise exception 'rejected create wrote a script: %',c.label; end if;
  end loop;
end $$;

create temp table script_length_rpc_state as
select x.* from public.create_script('Edit target','short original','en-US',60) x;
create temp table script_length_rpc_before as
select s.id,s.content,s.current_revision_id,s.lock_version,s.practice_epoch,s.updated_at,
  (select count(*) from public.script_revisions r where r.script_id=s.id) as revision_count
from public.scripts s where s.id=(select id from pg_temp.script_length_rpc_state);

do $$
declare c record; original public.scripts; later public.scripts;
begin
  select * into original from public.scripts where id=(select id from pg_temp.script_length_rpc_state);
  for c in select * from pg_temp.script_length_rpc_cases
    where label in ('words_201','characters_2001','both_over','astral_over','empty','only_js_whitespace') loop
    begin
      perform public.edit_script(original.id,original.current_revision_id,original.lock_version,
        jsonb_build_object('content',c.content));
      raise exception 'direct edit incorrectly accepted %',c.label;
    exception when sqlstate '22023' then
      if sqlerrm <> 'request_invalid' then raise; end if;
    end;
    select * into later from public.scripts where id=original.id;
    if row(later.content,later.current_revision_id,later.lock_version,later.practice_epoch,later.updated_at)
      is distinct from row(original.content,original.current_revision_id,original.lock_version,original.practice_epoch,original.updated_at)
      or (select count(*) from public.script_revisions where script_id=original.id) <> 1 then
      raise exception 'rejected edit changed revision, pointer, lock or epoch: %',c.label; end if;
  end loop;
end $$;

-- A changed body at the joint exact boundary creates one immutable revision.
create temp table script_length_rpc_edited as
select x.* from pg_temp.script_length_rpc_state original,
  pg_temp.script_length_rpc_cases c,
  lateral public.edit_script(original.id,original.current_revision_id,original.lock_version,
    jsonb_build_object('content',c.content)) x where c.label='both_exact';
do $$
declare before_row record; after_row record;
begin
  select * into before_row from pg_temp.script_length_rpc_before;
  select * into after_row from pg_temp.script_length_rpc_edited;
  if after_row.current_revision_id=before_row.current_revision_id
    or after_row.lock_version<>before_row.lock_version+1
    or after_row.practice_epoch<>before_row.practice_epoch+1
    or (select count(*) from public.script_revisions where script_id=after_row.id)<>2
    or (select content from public.script_revisions where id=before_row.current_revision_id)<>before_row.content then
    raise exception 'valid body edit revision transaction mismatch'; end if;
end $$;

-- Exercise every permitted JS count case through a changed-body edit as well.
create temp table script_length_rpc_edit_cases as
select * from pg_temp.script_length_rpc_cases where allowed and label<>'both_exact';
do $$
declare c record; previous public.scripts; edited public.scripts; previous_revisions integer;
begin
  for c in select * from pg_temp.script_length_rpc_edit_cases order by label loop
    select * into previous from public.scripts where id=(select id from pg_temp.script_length_rpc_state);
    select count(*) into previous_revisions from public.script_revisions where script_id=previous.id;
    edited := public.edit_script(previous.id,previous.current_revision_id,previous.lock_version,
      jsonb_build_object('content',c.content));
    if edited.content is distinct from c.content
      or edited.current_revision_id=previous.current_revision_id
      or edited.lock_version<>previous.lock_version+1
      or edited.practice_epoch<>previous.practice_epoch+1
      or (select count(*) from public.script_revisions where script_id=previous.id)<>previous_revisions+1
      or (select content from public.script_revisions where id=previous.current_revision_id)
        is distinct from previous.content then
      raise exception 'accepted direct edit changed revision transaction: %',c.label; end if;
  end loop;
end $$;

-- An oversized inherited body can be retitled, and can be revisioned for a
-- locale change while the content remains byte-for-byte unchanged.
create temp table script_length_rpc_long_title as
select x.* from public.edit_script('20000000-0000-4000-8000-000000000071',
  '60000000-0000-4000-8000-000000000071',1,'{"title":"Retitled"}'::jsonb) x;
create temp table script_length_rpc_long_locale as
select x.* from pg_temp.script_length_rpc_long_title previous,
  lateral public.edit_script(previous.id,previous.current_revision_id,previous.lock_version,
    '{"locale":"en-GB"}'::jsonb) x;
do $$
declare title_row record; locale_row record;
begin
  select * into title_row from pg_temp.script_length_rpc_long_title;
  select * into locale_row from pg_temp.script_length_rpc_long_locale;
  if title_row.current_revision_id<>'60000000-0000-4000-8000-000000000071'
    or title_row.lock_version<>2 or title_row.practice_epoch<>1
    or locale_row.current_revision_id=title_row.current_revision_id
    or locale_row.lock_version<>3 or locale_row.practice_epoch<>2
    or locale_row.content<>repeat('L',4501)
    or (select count(*) from public.script_revisions where script_id=locale_row.id)<>2 then
    raise exception 'existing long body compatibility mismatch'; end if;
  begin
    perform public.edit_script(locale_row.id,locale_row.current_revision_id,locale_row.lock_version,
      jsonb_build_object('content',repeat('M',4501)));
    raise exception 'changed inherited long body incorrectly accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'request_invalid' then raise; end if;
  end;
end $$;

-- Cross-owner direct RPC must retain the same not-found boundary.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000072',false);
do $$
declare target record;
begin
  select * into target from pg_temp.script_length_rpc_edited;
  begin
    perform public.edit_script(target.id,target.current_revision_id,target.lock_version,'{"title":"Foreign"}'::jsonb);
    raise exception 'cross-owner edit accepted';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'script_not_found' then raise; end if;
  end;
  if exists(select 1 from public.scripts where id=target.id) then
    raise exception 'cross-owner RLS leaked script'; end if;
end $$;

-- Active-10 is still enforced by the authenticated create RPC.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000073',false);
do $$
declare index integer;
begin
  for index in 1..10 loop
    perform public.create_script('Quota '||index,'short body','en-US',60);
  end loop;
  begin
    perform public.create_script('Quota 11','short body','en-US',60);
    raise exception 'active-10 limit bypassed';
  exception when sqlstate '40001' then
    if sqlerrm <> 'script_limit_reached' then raise; end if;
  end;
  if (select count(*) from public.scripts where user_id=auth.uid() and archived_at is null)<>10 then
    raise exception 'active-10 count changed'; end if;
end $$;
reset role;

-- No provider reservation, reference audio or Take writer was invoked by a
-- rejected edit; the original row and its revision remained unchanged.
do $$
declare before_row record; current_row record;
begin
  select * into before_row from pg_temp.script_length_rpc_before;
  select * into current_row from public.scripts where id=before_row.id;
  if (select count(*) from public.voice_asset_write_intents where script_id=before_row.id)<>0
    or (select count(*) from public.script_audios where script_id=before_row.id)<>0
    or (select count(*) from public.takes where script_id=before_row.id)<>0
    or (select count(*) from public.script_revisions where script_id=before_row.id)<>
      2+(select count(*) from pg_temp.script_length_rpc_edit_cases)
    or current_row.lock_version<>before_row.lock_version+1+(select count(*) from pg_temp.script_length_rpc_edit_cases)
    or current_row.practice_epoch<>before_row.practice_epoch+1+(select count(*) from pg_temp.script_length_rpc_edit_cases) then
    raise exception 'RPC edit/provider-writer postflight mismatch'; end if;
end $$;
select 'SCRIPT_LENGTH_AUTHENTICATED_RPC_PASS';
