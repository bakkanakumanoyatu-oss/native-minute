insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000071','gallery-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000072','gallery-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000073','gallery-c@example.invalid');

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000071',false);
do $$ declare i public.personal_gallery_items; s public.scripts; s2 public.scripts;
begin
  i:=public.create_personal_gallery_item('{"scene_title":"Quick"}'::jsonb);
  if i.excerpt_text is not null or i.lock_version<>1 then raise exception 'quick add scene-only failed'; end if;
  i:=public.update_personal_gallery_item(i.id,1,'{"excerpt_text":"Hello 😀 world.\nAnother sentence.","personal_note":"private memo"}'::jsonb);
  if i.lock_version<>2 or i.excerpt_text is null then raise exception 'excerpt update failed'; end if;
  begin perform public.create_script_from_personal_gallery(i.id,2,'Quick','injected text');
    raise exception 'injected selection accepted';
  exception when sqlstate '22023' then null; end;
  s:=public.create_script_from_personal_gallery(i.id,2,'Quick',null);
  s2:=public.create_script_from_personal_gallery(i.id,2,'Quick',null);
  if s.id<>s2.id or s.source_gallery_item_id<>i.id then raise exception 'script idempotency/source failed'; end if;
  i:=public.update_personal_gallery_item(i.id,2,'{"excerpt_text":"Changed after script"}'::jsonb);
  if (select content from public.scripts where id=s.id) <> s.content then
    raise exception 'gallery edit changed script'; end if;
  perform public.delete_personal_gallery_item(i.id,3);
  if not exists(select 1 from public.scripts where id=s.id and source_gallery_item_id is null) then
    raise exception 'gallery delete removed script'; end if;
  if not exists(select 1 from public.script_revisions where script_id=s.id and content=s.content) then
    raise exception 'gallery delete removed revision'; end if;
end $$;

-- A can store a long collection excerpt. Only a contained, short range may become a script.
do $$ declare i public.personal_gallery_items; s public.scripts;
begin
  i:=public.create_personal_gallery_item(jsonb_build_object('scene_title','Long','excerpt_text',repeat('word ',300)));
  begin perform public.create_script_from_personal_gallery(i.id,1,'Long',null);
    raise exception 'long full excerpt accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.create_script_from_personal_gallery(i.id,1,'Long',repeat('word ',201));
    raise exception 'long selection accepted';
  exception when sqlstate '22023' then null; end;
  s:=public.create_script_from_personal_gallery(i.id,1,'Long',repeat('word ',20));
  if s.content<>repeat('word ',20) then raise exception 'range changed'; end if;
  i:=public.create_personal_gallery_item(jsonb_build_object('scene_title','Long UTF16',
    'excerpt_text',repeat('a',2100)));
  begin perform public.create_script_from_personal_gallery(i.id,1,'Long UTF16',repeat('a',2001));
    raise exception '2001 UTF16 selection accepted';
  exception when sqlstate '22023' then null; end;
  i:=public.create_personal_gallery_item(jsonb_build_object('scene_title','20k UTF16',
    'excerpt_text',repeat('😀',10000)));
  if length(i.excerpt_text)<>10000 then raise exception 'UTF16 storage acceptance failed'; end if;
  begin perform public.create_personal_gallery_item(jsonb_build_object('scene_title','Over storage guard',
    'excerpt_text',repeat('😀',10001)));
    raise exception 'over storage guard accepted';
  exception when check_violation then null; end;
end $$;

-- Authenticated direct writes are closed.
do $$ begin
  begin insert into public.personal_gallery_items(user_id,scene_title)
    values('10000000-0000-4000-8000-000000000071','direct');
    raise exception 'direct insert accepted';
  exception when insufficient_privilege then null; end;
  begin update public.personal_gallery_items set scene_title='direct' where scene_title='Long';
    raise exception 'direct update accepted';
  exception when insufficient_privilege then null; end;
  begin delete from public.personal_gallery_items where scene_title='Long';
    raise exception 'direct delete accepted';
  exception when insufficient_privilege then null; end;
end $$;

set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
do $$ declare a public.personal_gallery_items; b public.personal_gallery_items;
begin
  a:=public.save_personal_gallery_example('10000000-0000-4000-8000-000000000071',
    '{"scene_title":"Example","source_example_id":"official-one","work_title":"Work","themes":["Hope"]}'::jsonb);
  b:=public.save_personal_gallery_example('10000000-0000-4000-8000-000000000071',
    '{"scene_title":"Forged overwrite","source_example_id":"official-one"}'::jsonb);
  if a.id<>b.id or b.scene_title<>'Example' or b.excerpt_text is not null then raise exception 'example snapshot/idempotency failed'; end if;
  perform set_config('test.a_gallery_id',a.id::text,false);
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000072',false);
do $$ declare a_id uuid;
begin
  perform public.create_personal_gallery_item('{"scene_title":"B own"}'::jsonb);
  select id into a_id from public.personal_gallery_items where source_example_id='official-one';
  if a_id is not null then raise exception 'B read A'; end if;
  -- A's opaque ID must not be writable by B even when known.
  begin perform public.update_personal_gallery_item(
    current_setting('test.a_gallery_id')::uuid,1,'{"scene_title":"bad"}'::jsonb);
    raise exception 'B update accepted';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.delete_personal_gallery_item(current_setting('test.a_gallery_id')::uuid,1);
    raise exception 'B delete accepted';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.create_script_from_personal_gallery(current_setting('test.a_gallery_id')::uuid,1,'Bad',null);
    raise exception 'B script create accepted';
  exception when sqlstate 'P0002' then null; end;
  if (select count(*) from public.search_personal_gallery_items('private',null,null,'recent',30,0))<>0 then
    raise exception 'B search included A'; end if;
  begin perform public.save_personal_gallery_example(auth.uid(),
    '{"scene_title":"forged","source_example_id":"official-one"}'::jsonb);
    raise exception 'B invoked server-only example save';
  exception when insufficient_privilege then null; end;
end $$;

select public.create_personal_gallery_item('{"scene_title":"C-owned"}'::jsonb)
from generate_series(1,1) where false;
reset role;
do $$ declare a_script uuid; b_item uuid;
begin
  select id into a_script from public.scripts where title='Quick';
  select id into b_item from public.personal_gallery_items where scene_title='B own';
  begin update public.scripts set source_gallery_item_id=b_item where id=a_script;
    raise exception 'cross-owner source accepted';
  exception when foreign_key_violation then null; end;
end $$;

-- This user's profile cascades to Gallery without changing G5's explicit deletion inventory.
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000073',false);
do $$ declare n integer;
begin
  select count(*) into n from public.search_personal_gallery_items(null,null,null,'recent',101,0);
  if n<>0 then raise exception 'zero fixture failed'; end if;
  perform public.create_personal_gallery_item(jsonb_build_object('scene_title','fixture-'||i,
    'work_title','Work '||lpad(i::text,3,'0'),'source_type','Movies','themes',jsonb_build_array('Hope')))
    from generate_series(1,6) i;
  select count(*) into n from public.search_personal_gallery_items(null,null,null,'recent',101,0);
  if n<>6 then raise exception 'six fixture failed'; end if;
  perform public.create_personal_gallery_item(jsonb_build_object('scene_title','fixture-'||i,
    'work_title','Work '||lpad(i::text,3,'0'),'source_type','Movies','themes',jsonb_build_array('Hope')))
    from generate_series(7,60) i;
  select count(*) into n from public.search_personal_gallery_items(null,null,null,'recent',101,0);
  if n<>60 then raise exception 'sixty fixture failed'; end if;
  perform public.create_personal_gallery_item(jsonb_build_object('scene_title','fixture-'||i,
    'work_title','Work '||lpad(i::text,3,'0'),'source_type','Movies','themes',jsonb_build_array('Hope')))
    from generate_series(61,300) i;
  select count(*) into n from public.personal_gallery_items where user_id=auth.uid();
  if n<>300 then raise exception '300 fixture failed'; end if;
  select count(*) into n from public.search_personal_gallery_items(null,'Movies','Hope','work',30,270);
  if n<>30 then raise exception '300 pagination/filter failed'; end if;
  select count(*) into n from public.search_personal_gallery_items('fixture-299',null,null,'recent',30,0);
  if n<>1 then raise exception '300 search failed'; end if;
end $$;
reset role;
delete from public.profiles where id='10000000-0000-4000-8000-000000000073';
do $$ begin if exists(select 1 from public.personal_gallery_items where scene_title like 'fixture-%') then
  raise exception 'profile cascade failed'; end if; end $$;
do $$ begin if exists(select 1 from public.beta_quota_reservations) or exists(select 1 from public.quota_events) then
  raise exception 'gallery consumed quota'; end if; end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000071',false);
do $$ declare i public.personal_gallery_items;
begin
  perform public.create_script('Extra '||n,'Synthetic words.','en-US',60) from generate_series(1,8) n;
  if (select count(*) from public.scripts where user_id=auth.uid() and archived_at is null)<>10 then
    raise exception 'active ten setup failed'; end if;
  i:=public.create_personal_gallery_item('{"scene_title":"Eleventh","excerpt_text":"One more sentence."}'::jsonb);
  begin perform public.create_script_from_personal_gallery(i.id,1,'Eleventh',null);
    raise exception 'gallery bypassed active ten';
  exception when sqlstate '40001' then
    if sqlerrm<>'script_limit_reached' then raise; end if;
  end;
end $$;
reset role;

-- Active account deletion fences new writes, but already saved rows remain readable.
insert into public.account_deletion_requests(user_id,status)
  values('10000000-0000-4000-8000-000000000071','processing');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000071',false);
do $$ begin
  if (select count(*) from public.search_personal_gallery_items(null,null,null,'recent',30,0))<1 then raise exception 'A cannot read own'; end if;
  begin perform public.create_personal_gallery_item('{"scene_title":"blocked"}'::jsonb);
    raise exception 'deletion write accepted';
  exception when sqlstate '55006' then null; end;
end $$;
reset role;

set role anon;
do $$ begin
  begin perform count(*) from public.personal_gallery_items;
    raise exception 'anon read accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.create_personal_gallery_item('{"scene_title":"anon"}'::jsonb);
    raise exception 'anon RPC write accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
