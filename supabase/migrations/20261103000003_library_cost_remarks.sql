alter table public.library_documents add column if not exists cost_remarks jsonb;
alter table public.library_documents add column if not exists search_meta jsonb;
