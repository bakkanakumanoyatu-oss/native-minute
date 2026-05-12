alter table public.takes
add column if not exists accuracy_score numeric;

alter table public.takes
add column if not exists fluency_score numeric;

alter table public.takes
add column if not exists rhythm_score numeric;

alter table public.takes
add column if not exists evaluation_summary_ja text;

alter table public.takes
add column if not exists evaluation_strengths_ja jsonb not null default '[]'::jsonb;

alter table public.coach_feedback
add column if not exists title text not null default '日本語コーチング';

alter table public.coach_feedback
add column if not exists next_step text not null default '';

alter table public.coach_feedback
add column if not exists focus_words jsonb not null default '[]'::jsonb;

drop policy if exists "weak_words_delete_own" on public.weak_words;
create policy "weak_words_delete_own"
on public.weak_words
for delete
using (
  exists (
    select 1
    from public.takes
    where takes.id = weak_words.take_id
      and takes.user_id = auth.uid()
  )
);

drop policy if exists "coach_feedback_delete_own" on public.coach_feedback;
create policy "coach_feedback_delete_own"
on public.coach_feedback
for delete
using (
  exists (
    select 1
    from public.takes
    where takes.id = coach_feedback.take_id
      and takes.user_id = auth.uid()
  )
);

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
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  persisted_take_id uuid;
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

  insert into public.takes (
    id,
    script_id,
    user_id,
    audio_path,
    duration_seconds,
    status,
    score,
    total_words,
    transcript_text,
    accuracy_score,
    fluency_score,
    rhythm_score,
    evaluation_summary_ja,
    evaluation_strengths_ja,
    evaluation_payload,
    coach_feedback_payload,
    reviewed_at
  )
  values (
    coalesce(p_take_id, gen_random_uuid()),
    p_script_id,
    current_user_id,
    p_audio_path,
    p_duration_seconds,
    coalesce(p_status, 'reviewed'),
    p_score,
    p_total_words,
    p_transcript_text,
    p_accuracy_score,
    p_fluency_score,
    p_rhythm_score,
    p_evaluation_summary_ja,
    coalesce(p_evaluation_strengths_ja, '[]'::jsonb),
    coalesce(p_evaluation_payload, '{}'::jsonb),
    coalesce(p_coach_feedback_payload, '{}'::jsonb),
    now()
  )
  on conflict (id) do update
  set script_id = excluded.script_id,
      user_id = excluded.user_id,
      audio_path = excluded.audio_path,
      duration_seconds = excluded.duration_seconds,
      status = excluded.status,
      score = excluded.score,
      total_words = excluded.total_words,
      transcript_text = excluded.transcript_text,
      accuracy_score = excluded.accuracy_score,
      fluency_score = excluded.fluency_score,
      rhythm_score = excluded.rhythm_score,
      evaluation_summary_ja = excluded.evaluation_summary_ja,
      evaluation_strengths_ja = excluded.evaluation_strengths_ja,
      evaluation_payload = excluded.evaluation_payload,
      coach_feedback_payload = excluded.coach_feedback_payload,
      reviewed_at = now()
  where public.takes.user_id = current_user_id
  returning id into persisted_take_id;

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

grant execute on function public.persist_review_bundle(
  uuid,
  uuid,
  text,
  integer,
  text,
  numeric,
  integer,
  text,
  numeric,
  numeric,
  numeric,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  jsonb,
  text,
  jsonb,
  jsonb
) to authenticated;
