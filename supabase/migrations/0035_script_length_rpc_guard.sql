-- Match lib/script-length.ts at the authenticated RPC boundary. Forward-only;
-- existing script bodies and immutable revisions are not rewritten.
begin;

create schema script_length_private;
revoke all on schema script_length_private from public, anon, authenticated, service_role;

create function script_length_private.count_script_length(p_content text)
returns table(word_count integer, character_count integer)
language plpgsql immutable strict
set search_path = pg_catalog
as $$
declare
  -- ECMAScript WhiteSpace + LineTerminator used by trim() and /\s+/u.
  -- All 25 code points are in the BMP, so replacing each with one ASCII
  -- space preserves the UTF-16 length of the trimmed content.
  v_js_whitespace constant text :=
    chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) ||
    chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
    chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) ||
    chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) ||
    chr(12288) || chr(65279);
  v_trimmed text;
  v_utf8 bytea;
  v_index integer;
begin
  v_trimmed := btrim(translate(p_content, v_js_whitespace, repeat(' ', 25)), ' ');
  word_count := case when v_trimmed = '' then 0
    else cardinality(regexp_split_to_array(v_trimmed, ' +')) end;
  character_count := char_length(v_trimmed);
  -- A UTF-8 four-byte sequence represents one astral code point and two
  -- JavaScript UTF-16 code units. PostgreSQL char_length counts it as one.
  v_utf8 := convert_to(v_trimmed, 'UTF8');
  for v_index in 0..octet_length(v_utf8) - 1 loop
    if get_byte(v_utf8, v_index) between 240 and 244 then
      character_count := character_count + 1;
    end if;
  end loop;
  return next;
end;
$$;
revoke all on function script_length_private.count_script_length(text)
  from public, anon, authenticated, service_role;

create or replace function public.create_script(p_title text,p_content text,p_locale text,p_target_seconds integer)
returns public.scripts language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); s public.scripts; sid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid();
  v_word_count integer; v_character_count integer;
begin
  perform public.script_owner_write_lock(u);
  if (select count(*) from public.scripts where user_id=u and archived_at is null)>=10 then
    raise exception using errcode='40001',message='script_limit_reached'; end if;
  if length(btrim(p_title)) not between 1 and 120 or p_content is null
    or length(btrim(p_locale))<2 or p_target_seconds not between 15 and 120 then
    raise exception using errcode='22023',message='request_invalid'; end if;
  select word_count,character_count into v_word_count,v_character_count
    from script_length_private.count_script_length(p_content);
  if v_word_count>200 or v_character_count not between 1 and 2000 then
    raise exception using errcode='22023',message='request_invalid'; end if;
  insert into public.scripts(id,user_id,title,content,locale,target_seconds,current_revision_id)
    values(sid,u,p_title,p_content,p_locale,p_target_seconds,rid) returning * into s;
  insert into public.script_revisions(id,script_id,revision_no,content,locale,target_seconds,origin)
    values(rid,sid,1,p_content,p_locale,p_target_seconds,'create');
  return s;
end; $$;

create or replace function public.edit_script(p_script_id uuid,p_expected_revision_id uuid,p_expected_lock_version bigint,p_patch jsonb)
returns public.scripts language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.scripts; rid uuid; title_value text; content_value text; locale_value text; seconds_value integer;
  v_word_count integer; v_character_count integer;
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
  if length(btrim(title_value)) not between 1 and 120
    or length(btrim(locale_value))<2 or seconds_value not between 15 and 120 then
    raise exception using errcode='22023',message='request_invalid'; end if;
  -- A pre-existing long body remains editable when its body is unchanged,
  -- including title-only and locale/duration edits.
  if content_value is distinct from s.content then
    select word_count,character_count into v_word_count,v_character_count
      from script_length_private.count_script_length(content_value);
    if v_word_count>200 or v_character_count not between 1 and 2000 then
      raise exception using errcode='22023',message='request_invalid'; end if;
  end if;
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

-- CREATE OR REPLACE keeps the existing ACL; restate the 0033 contract.
revoke all on function public.create_script(text,text,text,integer),
  public.edit_script(uuid,uuid,bigint,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_script(text,text,text,integer),
  public.edit_script(uuid,uuid,bigint,jsonb) to authenticated;

commit;
