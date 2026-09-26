-- EduGo profile least-privilege grants.
-- Applied in Supabase as migration 20260926000039_edugo_profiles_least_privilege.
-- Non-destructive: changes privileges only.

revoke all on table public.profiles from authenticated;
grant select (id, nombre, avatar_url) on table public.profiles to authenticated;
grant insert (id, nombre, avatar_url) on table public.profiles to authenticated;
grant update (nombre, avatar_url) on table public.profiles to authenticated;
