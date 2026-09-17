-- Personal recording metadata stays on the owned Take, including deletion.
-- Automatic Best ranking and review persistence are deliberately unchanged.
alter table public.takes
  add column favorite boolean not null default false,
  add column display_name text,
  add constraint takes_display_name_length check (
    display_name is null or (
      char_length(display_name) between 1 and 60
      and display_name = btrim(display_name)
      and display_name !~ '[[:cntrl:]]'
    )
  );
