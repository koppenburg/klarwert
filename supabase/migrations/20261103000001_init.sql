-- Klarwert: Grundschema
-- Datenschutz: Es werden nur Tarif- und Vertragsparameter unter einer internen Fallnummer gespeichert.
-- Der Kundenname ist ein freiwilliges Feld (cases.customer_name) und verlässt Supabase nie in Richtung Modell-API.

create extension if not exists pg_trgm;

-- Team -----------------------------------------------------------------------
create table public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members where user_id = (select auth.uid()));
$$;

-- Tarifkatalog -----------------------------------------------------------------
create table public.insurers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references public.insurers (id) on delete cascade,
  name text not null,
  code text,
  aliases text[] not null default '{}',
  layer text not null check (layer in ('riester', 'basis', 'layer3', 'bav')),
  product_type text check (product_type in ('fonds', 'klassisch', 'hybrid', 'index', 'sonstige')),
  created_at timestamptz not null default now(),
  unique (insurer_id, name)
);

create table public.tariff_generations (
  id uuid primary key default gen_random_uuid(),
  tariff_id uuid not null references public.tariffs (id) on delete cascade,
  label text not null,
  valid_from date,
  valid_to date,
  aliases text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  unique (tariff_id, label)
);

-- Bibliothek (Bedingungswerke sind unpersönlich) --------------------------------
create table public.library_documents (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid references public.tariff_generations (id) on delete set null,
  kind text not null check (kind in ('avb', 'tarifbestimmungen', 'pib', 'kostenblatt', 'sonstiges')),
  title text not null,
  storage_path text,
  source_url text,
  source_kind text not null default 'upload' check (source_kind in ('upload', 'websearch', 'manual')),
  status text not null default 'candidate' check (status in ('candidate', 'confirmed', 'rejected')),
  page_count integer,
  sha256 text,
  created_by uuid default auth.uid() references auth.users (id),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index library_documents_generation_idx on public.library_documents (generation_id);

create table public.library_pages (
  document_id uuid not null references public.library_documents (id) on delete cascade,
  page_number integer not null,
  content text not null,
  tsv tsvector generated always as (to_tsvector('german', content)) stored,
  primary key (document_id, page_number)
);
create index library_pages_tsv_idx on public.library_pages using gin (tsv);

-- Fälle -------------------------------------------------------------------------
create sequence public.case_number_seq;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('KW-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.case_number_seq')::text, 4, '0')),
  customer_name text, -- freiwillig, nur lokal; nie im API-Kontext
  title text,
  layer text check (layer in ('riester', 'basis', 'layer3', 'bav')),
  generation_id uuid references public.tariff_generations (id) on delete set null,
  status text not null default 'neu' check (status in ('neu', 'erkannt', 'tarif_zugeordnet', 'kosten_bestaetigt', 'analysiert')),
  fields_confirmed_at timestamptz,
  costs_confirmed_at timestamptz,
  costs_confirmed_by uuid references auth.users (id),
  analysis_assumptions jsonb,
  notes text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes integer,
  doc_role text not null default 'sonstiges' check (doc_role in ('police', 'nachtrag', 'standmitteilung', 'screenshot', 'angebot', 'pib', 'sonstiges')),
  original_path text,
  keep_original boolean not null default false,
  original_deleted_at timestamptz,
  sanitized_path text,
  -- je Seite: { pageNumber, source, textLength, imagePath?, boxes } – nie Klartext-PII
  sanitized_pages jsonb,
  -- nur Anzahl je PII-Art, nie die gefundenen Werte
  pii_summary jsonb,
  sanitize_warnings text[],
  sanitized_approved_at timestamptz,
  sanitized_approved_by uuid references auth.users (id),
  extracted_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index case_documents_case_idx on public.case_documents (case_id);

create table public.extractions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  model text not null,
  raw jsonb not null,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- erkannte und bestätigte Vertragsparameter (je Feld mit Konfidenz und Fundstelle)
create table public.case_fields (
  case_id uuid not null references public.cases (id) on delete cascade,
  key text not null,
  value jsonb,
  confidence numeric,
  source jsonb, -- { kind: 'document'|'manual'|'assumption', documentId, fileName, page, region, quote }
  status text not null default 'proposed' check (status in ('proposed', 'confirmed')),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (case_id, key)
);

-- Kostenfaktoren: gehören zur Tarifgeneration; vertragsindividuelle Abweichungen als Override (case_id gesetzt)
create table public.cost_items (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid references public.tariff_generations (id) on delete cascade,
  case_id uuid references public.cases (id) on delete cascade,
  key text not null,
  value jsonb,
  unit text,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected')),
  source_kind text not null check (source_kind in ('library', 'websearch', 'manual', 'document', 'assumption')),
  source_document_id uuid references public.library_documents (id) on delete set null,
  page integer,
  quote text,
  source_note text,
  confidence numeric,
  proposed_by text not null default 'user' check (proposed_by in ('model', 'user')),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_items_scope check ((generation_id is not null) <> (case_id is not null))
);
create unique index cost_items_generation_key on public.cost_items (generation_id, key) where case_id is null and status <> 'rejected';
create unique index cost_items_case_key on public.cost_items (case_id, key) where generation_id is null and status <> 'rejected';

-- Vergleiche und Reports --------------------------------------------------------
create table public.comparisons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  case_ids uuid[] not null check (cardinality(case_ids) between 2 and 3),
  assumptions jsonb not null default '{}',
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases (id) on delete cascade,
  comparison_id uuid references public.comparisons (id) on delete cascade,
  snapshot jsonb not null,
  pdf_path text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- Report-Gate auf Datenbankebene: kein Report ohne bestätigte Kostenfaktoren
create or replace function public.enforce_report_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cases%rowtype;
begin
  if new.case_id is null then
    return new;
  end if;
  select * into c from public.cases where id = new.case_id;
  if c.costs_confirmed_at is null or c.fields_confirmed_at is null then
    raise exception 'Report nicht möglich: Vertragsdaten und Kostenfaktoren sind nicht vollständig bestätigt';
  end if;
  if exists (
    select 1 from public.cost_items ci
    where ci.status = 'proposed'
      and (ci.case_id = c.id or (c.generation_id is not null and ci.generation_id = c.generation_id))
  ) then
    raise exception 'Report nicht möglich: es gibt unbestätigte Kostenfaktoren';
  end if;
  return new;
end;
$$;

create trigger reports_gate before insert on public.reports
for each row execute function public.enforce_report_gate();

-- Bestätigungen von Kostenfaktoren heben die Fall-Bestätigung auf, wenn sich Werte ändern
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cases_touch before update on public.cases for each row execute function public.touch_updated_at();
create trigger cost_items_touch before update on public.cost_items for each row execute function public.touch_updated_at();
create trigger case_fields_touch before update on public.case_fields for each row execute function public.touch_updated_at();

-- RLS: alle Tabellen nur für Teammitglieder ------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['team_members','insurers','tariffs','tariff_generations','library_documents','library_pages','cases','case_documents','extractions','case_fields','cost_items','comparisons','reports']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['insurers','tariffs','tariff_generations','library_documents','library_pages','cases','case_documents','extractions','case_fields','cost_items','comparisons','reports']
  loop
    execute format('create policy team_all on public.%I for all to authenticated using ((select public.is_team_member())) with check ((select public.is_team_member()))', t);
  end loop;
end;
$$;

create policy team_members_read on public.team_members for select to authenticated using ((select public.is_team_member()));

-- Volltextsuche in der Bibliothek
create or replace function public.search_library(q text, max_results integer default 20)
returns table (document_id uuid, page_number integer, title text, kind text, generation_id uuid, snippet text, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.document_id, p.page_number, d.title, d.kind, d.generation_id,
         ts_headline('german', p.content, websearch_to_tsquery('german', q), 'MaxFragments=2, MaxWords=25, MinWords=8') as snippet,
         ts_rank(p.tsv, websearch_to_tsquery('german', q)) as rank
  from public.library_pages p
  join public.library_documents d on d.id = p.document_id
  where p.tsv @@ websearch_to_tsquery('german', q)
    and d.status <> 'rejected'
  order by rank desc
  limit max_results;
$$;

-- Storage-Buckets (privat) -------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('originals', 'originals', false, 26214400),
  ('sanitized', 'sanitized', false, 26214400),
  ('library', 'library', false, 52428800),
  ('reports', 'reports', false, 26214400)
on conflict (id) do nothing;

create policy klarwert_storage_team on storage.objects for all to authenticated
  using (bucket_id in ('originals', 'sanitized', 'library', 'reports') and (select public.is_team_member()))
  with check (bucket_id in ('originals', 'sanitized', 'library', 'reports') and (select public.is_team_member()));
