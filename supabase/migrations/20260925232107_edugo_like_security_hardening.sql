-- EduGo incremental hardening applied to Supabase project ajrgcnclpziovihjsjym.
-- Non-destructive: removes only a duplicate auth trigger/function and redundant
-- unique indexes; preserves all application rows.

alter table public.post_likes
  drop constraint if exists post_likes_post_user_unique;
drop index if exists public.post_likes_user_post_uidx;
drop index if exists public.post_likes_post_user_unique;

alter table public.post_likes
  add constraint post_likes_post_user_unique unique (post_id, user_id);

create or replace function public.toggle_post_like(p_post_id uuid)
returns table(liked boolean, like_count bigint)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_exists boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.posts
    where id = p_post_id
      and (privacy = 'public' or author_id = v_user_id)
  ) then
    raise exception 'POST_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_post_id::text, 0)
  );

  select exists (
    select 1 from public.post_likes
    where user_id = v_user_id and post_id = p_post_id
  ) into v_exists;

  if v_exists then
    delete from public.post_likes
    where user_id = v_user_id and post_id = p_post_id;
    liked := false;
  else
    insert into public.post_likes(user_id, post_id)
    values (v_user_id, p_post_id)
    on conflict (post_id, user_id) do nothing;
    liked := true;
  end if;

  select count(*) into like_count
  from public.post_likes
  where post_id = p_post_id;

  return next;
end;
$$;

revoke execute on function public.toggle_post_like(uuid) from public, anon;
grant execute on function public.toggle_post_like(uuid) to authenticated;


-- Keep the single required Auth -> profile trigger intact.
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

-- Do not expose profile email through the client-facing table grants.
revoke select (email) on table public.profiles from authenticated;
