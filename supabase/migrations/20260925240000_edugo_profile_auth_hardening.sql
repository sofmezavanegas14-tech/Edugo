-- EduGo incremental profile/auth hardening.
-- Non-destructive: restores the single required auth profile trigger if an
-- earlier migration removed it, and limits client profile reads to public fields.

create schema if not exists private;

create or replace function private.handle_new_edugo_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  base_name text;
begin
  base_name := coalesce(
    nullif(left(new.raw_user_meta_data->>'display_name', 120), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuario'
  );

  insert into public.profiles(id, nombre)
  values (new.id, base_name)
  on conflict (id) do update
    set nombre = coalesce(nullif(excluded.nombre, ''), public.profiles.nombre),
        updated_at = now();

  return new;
end;
$$;

revoke execute on function private.handle_new_edugo_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_edugo on auth.users;
create trigger on_auth_user_created_edugo
after insert on auth.users
for each row execute function private.handle_new_edugo_user();

-- The browser only needs public profile fields for the forum.
revoke select (email) on table public.profiles from authenticated;
