-- Tarifrecherche: Kandidaten aus der Websuche je Versicherer (nie automatisch gültig)
create table public.tariff_candidates (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references public.insurers (id) on delete cascade,
  name text not null,
  code text,
  layer text check (layer in ('riester', 'basis', 'layer3', 'bav')),
  product_type text check (product_type in ('fonds', 'klassisch', 'hybrid', 'index', 'sonstige')),
  generation_label text,
  sales_status text check (sales_status in ('im Vertrieb', 'nicht mehr im Vertrieb', 'unklar')),
  product_url text,
  documents jsonb not null default '[]',
  source_urls text[] not null default '{}',
  reason text,
  status text not null default 'candidate' check (status in ('candidate', 'accepted', 'rejected')),
  generation_id uuid references public.tariff_generations (id) on delete set null,
  research_model text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tariff_candidates_insurer_idx on public.tariff_candidates (insurer_id);
alter table public.tariff_candidates enable row level security;
create policy team_all on public.tariff_candidates for all to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
create trigger tariff_candidates_touch before update on public.tariff_candidates for each row execute function public.touch_updated_at();

alter table public.library_documents add column if not exists tariff_candidate_id uuid references public.tariff_candidates (id) on delete set null;
alter table public.insurers add column if not exists last_research_at timestamptz;
alter table public.insurers add column if not exists last_research_remarks text;
