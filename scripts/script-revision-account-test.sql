-- Future deletion v2 preserves the closed v1 proof and includes archived revisions.
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000030','delete@example.invalid');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000030',false);
create temp table deletion_script as select x.* from public.create_script('Delete subject','Original','en-US',60) x;
select public.edit_script(id,current_revision_id,lock_version,'{"content":"Updated"}') from deletion_script;
select public.set_script_archived(id,true,2) from deletion_script;
select pg_temp.create_ready_request(auth.uid(),'70000000-0000-4000-8000-000000000030');
select pg_temp.reject('select public.create_script(''late'',''blocked'',''en-US'',60)','account_deletion_active');
select pg_temp.reject(format('select public.set_script_archived(%L,false,3)',id),'account_deletion_active') from deletion_script;
create temp table deletion_result as select * from public.finalize_account_deletion_database_stage('70000000-0000-4000-8000-000000000030',auth.uid(),'beta-quota.account-db.v3');
select pg_temp.assert_true((select db_deleted_row_count=4 and db_retained_row_count=1 and db_observed_row_count=5 from deletion_result),'v3 counts include profile script revisions');
select pg_temp.assert_true(not exists(select 1 from public.script_revisions where script_id=(select id from deletion_script)),'cascade revisions');
select pg_temp.assert_true((select already_finalized from public.finalize_account_deletion_database_stage('70000000-0000-4000-8000-000000000030',auth.uid(),'beta-quota.account-db.v3')),'v3 retry');
select 'ACCOUNT_V3_CASCADE_FENCE_COUNTS_PASS';
