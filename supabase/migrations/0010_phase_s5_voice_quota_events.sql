alter table public.quota_events
  drop constraint if exists quota_events_event_type_check,
  add constraint quota_events_event_type_check check (
    event_type in (
      'script_generation_attempt',
      'script_audio_generation_attempt'
    )
  );

alter table public.quota_events
  drop constraint if exists quota_events_category_check,
  add constraint quota_events_category_check check (
    category in (
      'text_generation_quota',
      'voice_generation_quota'
    )
  );

alter table public.quota_events
  drop constraint if exists quota_events_status_check,
  add constraint quota_events_status_check check (
    status in (
      'attempted',
      'succeeded',
      'failed',
      'skipped',
      'not_billable',
      'cache_hit',
      'partial'
    )
  );

alter table public.quota_events
  drop constraint if exists quota_events_failure_stage_check,
  add constraint quota_events_failure_stage_check check (
    failure_stage is null
    or failure_stage in (
      'provider_selection',
      'provider_config',
      'provider_request',
      'provider_response_parse',
      'pipeline_validation',
      'pipeline_rejected',
      'response_shaping',
      'quota_event_write',
      'storage_staging',
      'cache_lookup',
      'ownership_check'
    )
  );

alter table public.quota_events
  drop constraint if exists quota_events_subject_type_check,
  add constraint quota_events_subject_type_check check (
    subject_type in (
      'script_studio',
      'saved_script'
    )
  );

alter table public.quota_events
  drop constraint if exists quota_events_target_resource_type_check,
  add constraint quota_events_target_resource_type_check check (
    target_resource_type in (
      'none',
      'script_audio'
    )
  );
