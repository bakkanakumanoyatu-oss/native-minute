-- Synthetic IDs only. Existing account finalizer helpers are already loaded.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
insert into public.scripts(id,user_id,title,content) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Script A','Hello.'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Script B','Hello.');
insert into public.takes(id,script_id,user_id,audio_path,status,score) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','storage://recordings/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/take.wav','reviewed',70),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','mock/b.wav','reviewed',90);
select pg_temp.assert_true((select not favorite and display_name is null from public.takes where id='30000000-0000-4000-8000-000000000001'),'defaults');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
update public.takes set favorite=true,display_name='My recording' where id='30000000-0000-4000-8000-000000000001';
-- Deliberately omit user_id filtering: exercise RLS itself.
update public.takes set favorite=true,display_name='forbidden' where id='30000000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select count(*)=1 from public.takes),'RLS read isolation');
commit;
select pg_temp.assert_true((select favorite and display_name='My recording' and score=70 from public.takes where id='30000000-0000-4000-8000-000000000001'),'persisted owner update');
select pg_temp.assert_true((select not favorite and display_name is null and score=90 from public.takes where id='30000000-0000-4000-8000-000000000002'),'wrong owner no write');
select pg_temp.expect_sqlstate($$update public.takes set display_name=repeat('x',61)$$,array['23514'],'DB long name');
select pg_temp.expect_sqlstate($$update public.takes set display_name=''$$,array['23514'],'DB empty name');
select pg_temp.expect_sqlstate($$update public.takes set favorite=null$$,array['23502'],'DB null favorite');
select 'P2_RLS_PERSISTENCE_CONSTRAINTS_PASS';
-- Direct Take deletion removes both metadata fields with the row.
delete from public.takes where id='30000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(not exists(select 1 from public.takes where id='30000000-0000-4000-8000-000000000001'),'Take metadata absent');
-- Restore a named favorite, then run the ACTUAL existing Account DB finalizer.
insert into public.takes(id,script_id,user_id,audio_path,status,score,favorite,display_name) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','storage://recordings/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/take.wav','reviewed',70,true,'Private name');
select pg_temp.create_ready_request('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select db_cleanup_status='succeeded' from public.finalize_account_deletion_database_stage('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','g5d-2h.account-db.v1')),'account finalizer');
select pg_temp.assert_true(not exists(select 1 from public.takes where user_id='10000000-0000-4000-8000-000000000001'),'Account metadata absent');
select pg_temp.assert_true((select count(*)=1 from public.takes where user_id='10000000-0000-4000-8000-000000000002'),'other owner survives');
select pg_temp.assert_true(not exists(select 1 from public.account_deletion_requests where to_jsonb(account_deletion_requests)::text like '%Private name%'),'name not copied to retained audit');
select 'P2_TAKE_DELETE_ACCOUNT_FINALIZER_PASS';
