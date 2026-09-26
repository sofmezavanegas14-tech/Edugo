-- EduGo profile column hardening.
-- Applied in Supabase as migration 20260925235950_edugo_profile_column_hardening.
-- Non-destructive: no rows are deleted or modified.

revoke select (email) on table public.profiles from authenticated;
revoke insert (email) on table public.profiles from authenticated;
revoke update (email) on table public.profiles from authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, email, avatar_url, rol)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nombre',''), 'Usuario'),
    new.email,
    nullif(new.raw_user_meta_data->>'avatar_url',''),
    'estudiante'
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;
