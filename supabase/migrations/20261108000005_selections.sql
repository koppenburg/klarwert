-- Tarifselektion: gespeicherte Kundenprofile und Ergebnisse (ohne Namen; optional einem Fall zugeordnet)
create table public.selections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  case_id uuid references public.cases (id) on delete set null,
  profile jsonb not null,
  results jsonb not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.selections enable row level security;
create policy team_all on public.selections for all to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
