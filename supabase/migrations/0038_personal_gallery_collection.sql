-- Personal Gallery is private collection data. No provider or quota work happens here.
begin;

create function public.personal_gallery_utf16_length(p_text text) returns integer
language sql immutable strict set search_path=pg_catalog as $$
  select coalesce(sum(case when ascii(substr(p_text, n, 1)) > 65535 then 2 else 1 end), 0)::integer
  from generate_series(1, length(p_text)) as n;
$$;
revoke all on function public.personal_gallery_utf16_length(text) from public, anon, authenticated, service_role;

create table public.personal_gallery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scene_title text not null check (length(btrim(scene_title)) between 1 and 240),
  source_example_id text check (source_example_id is null or length(source_example_id) between 1 and 128),
  source_type text check (source_type is null or length(source_type) <= 80),
  work_title text check (work_title is null or length(work_title) <= 240),
  speaker text check (speaker is null or length(speaker) <= 160),
  context text check (context is null or length(context) <= 4000),
  personal_note text check (personal_note is null or length(personal_note) <= 4000),
  excerpt_text text check (excerpt_text is null or public.personal_gallery_utf16_length(excerpt_text) <= 20000),
  source_url text check (source_url is null or (length(source_url) <= 2048 and source_url ~* '^https?://')),
  source_locator text check (source_locator is null or length(source_locator) <= 2048),
  speaking_notes text[] not null default '{}'::text[] check (cardinality(speaking_notes) <= 20),
  themes text[] not null default '{}'::text[] check (cardinality(themes) <= 20),
  locale text not null default 'en-US' check (length(locale) between 2 and 20),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  lock_version bigint not null default 1 check (lock_version > 0),
  unique(id, user_id)
);
create unique index personal_gallery_example_once on public.personal_gallery_items(user_id, source_example_id)
  where source_example_id is not null;
create index personal_gallery_recent on public.personal_gallery_items(user_id, created_at desc, id desc);
create index personal_gallery_work on public.personal_gallery_items(user_id, work_title, id);
create trigger personal_gallery_updated_at before update on public.personal_gallery_items
  for each row execute function public.set_updated_at();

alter table public.personal_gallery_items enable row level security;
revoke all on public.personal_gallery_items from public, anon, authenticated, service_role;
grant select on public.personal_gallery_items to authenticated, service_role;
create policy personal_gallery_read_own on public.personal_gallery_items for select to authenticated
  using (user_id = auth.uid());

alter table public.scripts add column source_gallery_item_id uuid
  references public.personal_gallery_items(id) on delete set null;
create unique index scripts_one_per_gallery_item on public.scripts(user_id, source_gallery_item_id)
  where source_gallery_item_id is not null;
create function public.guard_script_gallery_source() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.source_gallery_item_id is not null and not exists (
    select 1 from public.personal_gallery_items
    where id=new.source_gallery_item_id and user_id=new.user_id
  ) then
    raise exception using errcode='23503',message='gallery_source_owner_mismatch';
  end if;
  return new;
end; $$;
create trigger guard_script_gallery_source before insert or update of source_gallery_item_id,user_id
  on public.scripts for each row execute function public.guard_script_gallery_source();

-- Only product RPCs write; this validator also guards callers invoking an RPC directly.
create function public.personal_gallery_validate_patch(p_patch jsonb, p_allow_example boolean default false)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text;
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception using errcode='22023',message='gallery_request_invalid'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('scene_title','source_type','work_title','speaker','context','personal_note',
      'excerpt_text','source_url','source_locator','speaking_notes','themes','locale')
      and not (p_allow_example and k='source_example_id') then
      raise exception using errcode='22023',message='gallery_request_invalid'; end if;
    if k in ('speaking_notes','themes') then
      if jsonb_typeof(p_patch->k) <> 'array' or exists (
        select 1 from jsonb_array_elements(p_patch->k) v
        where jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 240
      ) then raise exception using errcode='22023',message='gallery_request_invalid'; end if;
    elsif jsonb_typeof(p_patch->k) not in ('string','null') then
      raise exception using errcode='22023',message='gallery_request_invalid';
    end if;
  end loop;
  if octet_length(p_patch::text) > 90000 then
    raise exception using errcode='22023',message='gallery_request_invalid'; end if;
end; $$;

create function public.create_personal_gallery_item(p_patch jsonb)
returns public.personal_gallery_items language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.personal_gallery_items;
begin
  perform public.script_owner_write_lock(auth.uid());
  perform public.personal_gallery_validate_patch(p_patch);
  insert into public.personal_gallery_items(user_id,scene_title,source_type,work_title,speaker,context,
    personal_note,excerpt_text,source_url,source_locator,speaking_notes,themes,locale)
  values(auth.uid(),p_patch->>'scene_title',p_patch->>'source_type',p_patch->>'work_title',
    p_patch->>'speaker',p_patch->>'context',p_patch->>'personal_note',p_patch->>'excerpt_text',
    p_patch->>'source_url',p_patch->>'source_locator',
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'speaking_notes') x),'{}'::text[]),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'themes') x),'{}'::text[]),
    coalesce(p_patch->>'locale','en-US')) returning * into v;
  return v;
end; $$;

-- The server resolves the public ID and supplies the canonical metadata with service role.
-- Authenticated callers cannot set source_example_id or call this function.
create function public.save_personal_gallery_example(p_user_id uuid,p_patch jsonb)
returns public.personal_gallery_items language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.personal_gallery_items;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='gallery_server_only'; end if;
  perform public.script_owner_write_lock(p_user_id);
  perform public.personal_gallery_validate_patch(p_patch,true);
  if nullif(p_patch->>'source_example_id','') is null then
    raise exception using errcode='22023',message='gallery_request_invalid'; end if;
  insert into public.personal_gallery_items(user_id,scene_title,source_example_id,source_type,work_title,
    speaker,context,source_url,source_locator,speaking_notes,themes,locale)
  values(p_user_id,p_patch->>'scene_title',p_patch->>'source_example_id',p_patch->>'source_type',
    p_patch->>'work_title',p_patch->>'speaker',p_patch->>'context',p_patch->>'source_url',
    p_patch->>'source_locator',
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'speaking_notes') x),'{}'::text[]),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'themes') x),'{}'::text[]),
    coalesce(p_patch->>'locale','en-US'))
  on conflict (user_id,source_example_id) where source_example_id is not null do nothing;
  select * into v from public.personal_gallery_items
    where user_id=p_user_id and source_example_id=p_patch->>'source_example_id';
  return v;
end; $$;

create function public.update_personal_gallery_item(p_item_id uuid,p_expected_lock_version bigint,p_patch jsonb)
returns public.personal_gallery_items language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.personal_gallery_items;
begin
  perform public.script_owner_write_lock(auth.uid());
  perform public.personal_gallery_validate_patch(p_patch);
  select * into v from public.personal_gallery_items where id=p_item_id and user_id=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='gallery_item_not_found'; end if;
  if v.lock_version is distinct from p_expected_lock_version then
    raise exception using errcode='40001',message='gallery_edit_conflict'; end if;
  update public.personal_gallery_items set
    scene_title=case when p_patch ? 'scene_title' then p_patch->>'scene_title' else scene_title end,
    source_type=case when p_patch ? 'source_type' then p_patch->>'source_type' else source_type end,
    work_title=case when p_patch ? 'work_title' then p_patch->>'work_title' else work_title end,
    speaker=case when p_patch ? 'speaker' then p_patch->>'speaker' else speaker end,
    context=case when p_patch ? 'context' then p_patch->>'context' else context end,
    personal_note=case when p_patch ? 'personal_note' then p_patch->>'personal_note' else personal_note end,
    excerpt_text=case when p_patch ? 'excerpt_text' then p_patch->>'excerpt_text' else excerpt_text end,
    source_url=case when p_patch ? 'source_url' then p_patch->>'source_url' else source_url end,
    source_locator=case when p_patch ? 'source_locator' then p_patch->>'source_locator' else source_locator end,
    speaking_notes=case when p_patch ? 'speaking_notes' then
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'speaking_notes') x),'{}'::text[]) else speaking_notes end,
    themes=case when p_patch ? 'themes' then
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'themes') x),'{}'::text[]) else themes end,
    locale=case when p_patch ? 'locale' then p_patch->>'locale' else locale end,
    lock_version=lock_version+1 where id=v.id returning * into v;
  return v;
end; $$;

create function public.delete_personal_gallery_item(p_item_id uuid,p_expected_lock_version bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.personal_gallery_items;
begin
  perform public.script_owner_write_lock(auth.uid());
  select * into v from public.personal_gallery_items where id=p_item_id and user_id=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='gallery_item_not_found'; end if;
  if v.lock_version is distinct from p_expected_lock_version then
    raise exception using errcode='40001',message='gallery_edit_conflict'; end if;
  delete from public.personal_gallery_items where id=v.id;
  return true;
end; $$;

create function public.create_script_from_personal_gallery(
  p_item_id uuid,p_expected_lock_version bigint,p_script_title text,p_selected_text text default null)
returns public.scripts language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.personal_gallery_items; s public.scripts; body text;
begin
  perform public.script_owner_write_lock(auth.uid());
  select * into v from public.personal_gallery_items where id=p_item_id and user_id=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='gallery_item_not_found'; end if;
  select * into s from public.scripts where user_id=auth.uid() and source_gallery_item_id=v.id;
  if found then return s; end if;
  if v.lock_version is distinct from p_expected_lock_version then
    raise exception using errcode='40001',message='gallery_edit_conflict'; end if;
  if v.excerpt_text is null or btrim(v.excerpt_text)='' then
    raise exception using errcode='22023',message='gallery_excerpt_required'; end if;
  body:=coalesce(p_selected_text,v.excerpt_text);
  if p_selected_text is not null and (p_selected_text='' or strpos(v.excerpt_text,p_selected_text)=0) then
    raise exception using errcode='22023',message='gallery_range_invalid'; end if;
  -- create_script owns the 200-word / 2,000 UTF-16 check, active-10, and revision snapshot.
  s:=public.create_script(p_script_title,body,v.locale,60);
  update public.scripts set source_gallery_item_id=v.id where id=s.id returning * into s;
  return s;
end; $$;

create function public.search_personal_gallery_items(
  p_query text default null,p_source_type text default null,p_theme text default null,
  p_sort text default 'recent',p_limit integer default 30,p_offset integer default 0)
returns setof public.personal_gallery_items
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or length(coalesce(p_query,'')) > 120 or p_sort not in ('recent','work')
    or p_limit not between 1 and 101 or p_offset not between 0 and 10000 then
    raise exception using errcode='22023',message='gallery_request_invalid'; end if;
  return query select i.* from public.personal_gallery_items i
  where i.user_id=auth.uid()
    and (nullif(p_source_type,'') is null or i.source_type=p_source_type)
    and (nullif(p_theme,'') is null or p_theme=any(i.themes))
    and (nullif(btrim(p_query),'') is null or
      strpos(lower(i.scene_title),lower(btrim(p_query)))>0 or
      strpos(lower(coalesce(i.work_title,'')),lower(btrim(p_query)))>0 or
      strpos(lower(coalesce(i.speaker,'')),lower(btrim(p_query)))>0 or
      strpos(lower(coalesce(i.personal_note,'')),lower(btrim(p_query)))>0 or
      strpos(lower(coalesce(i.excerpt_text,'')),lower(btrim(p_query)))>0 or
      strpos(lower(coalesce(i.source_type,'')),lower(btrim(p_query)))>0)
  order by case when p_sort='work' then lower(coalesce(i.work_title,'')) end asc,
    case when p_sort='recent' then i.created_at end desc,
    i.id desc
  limit p_limit offset p_offset;
end; $$;

revoke all on function public.guard_script_gallery_source(),
  public.personal_gallery_validate_patch(jsonb,boolean),
  public.create_personal_gallery_item(jsonb),public.save_personal_gallery_example(uuid,jsonb),
  public.update_personal_gallery_item(uuid,bigint,jsonb),public.delete_personal_gallery_item(uuid,bigint),
  public.create_script_from_personal_gallery(uuid,bigint,text,text),
  public.search_personal_gallery_items(text,text,text,text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.create_personal_gallery_item(jsonb),
  public.update_personal_gallery_item(uuid,bigint,jsonb),public.delete_personal_gallery_item(uuid,bigint),
  public.create_script_from_personal_gallery(uuid,bigint,text,text),
  public.search_personal_gallery_items(text,text,text,text,integer,integer) to authenticated;
grant execute on function public.save_personal_gallery_example(uuid,jsonb) to service_role;

commit;
