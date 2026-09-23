-- Synthetic identities/content only, inserted before the foundation migration.
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','legacy@example.invalid');
insert into public.scripts(id,user_id,title,content) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Legacy current title','Current content is not historical proof.');
insert into public.takes(id,user_id,script_id,audio_path,status,favorite,display_name)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001',
'20000000-0000-4000-8000-000000000001','recordings/synthetic-'||n,case when n=7 then 'completed' else 'reviewed' end,n=1,case when n=1 then 'Saved name' end from generate_series(1,7) n;
insert into public.voices(id,user_id,provider,provider_voice_id,label,is_default) values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','mock','synthetic','Fixture',true);
insert into public.script_audios(id,script_id,voice_id,provider,cache_key,storage_path) values('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','mock','legacy-v1','synthetic');
insert into public.weak_words(take_id,word,score) values('30000000-0000-4000-8000-000000000001','word',70);
insert into public.coach_feedback(take_id,summary) values('30000000-0000-4000-8000-000000000001','Legacy feedback');
