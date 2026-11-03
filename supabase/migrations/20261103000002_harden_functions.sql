-- pg_trgm wird nicht benötigt (Matching läuft in TypeScript)
drop extension if exists pg_trgm;
revoke execute on function public.enforce_report_gate() from public, anon, authenticated;
revoke execute on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;
revoke execute on function public.search_library(text, integer) from public, anon;
grant execute on function public.search_library(text, integer) to authenticated;
