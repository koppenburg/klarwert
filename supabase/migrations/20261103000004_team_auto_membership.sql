-- Bestätigte Konten mit E-Mail-Adresse der Firmendomain werden automatisch Teammitglied.
create table if not exists public.team_settings (
  id boolean primary key default true check (id),
  allowed_email_domain text not null default 'koppenburg.info'
);
insert into public.team_settings (id) values (true) on conflict do nothing;
alter table public.team_settings enable row level security;
create policy team_settings_read on public.team_settings for select to authenticated using ((select public.is_team_member()));

create or replace function public.auto_team_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  domain text;
begin
  select allowed_email_domain into domain from public.team_settings where id;
  if new.email_confirmed_at is not null and domain is not null and lower(new.email) like '%@' || lower(domain) then
    insert into public.team_members (user_id, display_name)
    values (new.id, split_part(new.email, '@', 1))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.auto_team_membership() from public, anon, authenticated;

create trigger on_auth_user_team after insert or update of email_confirmed_at on auth.users
for each row execute function public.auto_team_membership();
