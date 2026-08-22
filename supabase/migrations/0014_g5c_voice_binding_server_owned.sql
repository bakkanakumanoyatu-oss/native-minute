-- G5C-A P1-1: provider provenance in public.voices is a server-owned binding.
-- Owner reads remain available, but authenticated Data API clients cannot create,
-- rewrite, or delete provider bindings. Server-side writes use the service-role
-- client only after resolving the authenticated request owner.
drop policy if exists "voices_insert_own" on public.voices;
drop policy if exists "voices_update_own" on public.voices;
drop policy if exists "voices_delete_own" on public.voices;
