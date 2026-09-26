begin;

-- EduGo forum contract hardening.
-- Non-destructive: never drops tables or rows. Existing non-empty legacy UUID conversions are refused.

create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='posts' and column_name='id'
      and data_type <> 'uuid'
  ) then
    if exists (select 1 from public.posts) then
      raise exception 'EduGo migration refused: public.posts contains rows and id is not uuid';
    end if;
    alter table public.posts alter column id type uuid using gen_random_uuid();
  end if;
end $$;

alter table public.posts
  alter column id set default gen_random_uuid(),
  alter column user_id set default auth.uid(),
  alter column user_id set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='id'
      and data_type <> 'uuid'
  ) then
    if exists (select 1 from public.comments) then
      raise exception 'EduGo migration refused: public.comments contains rows and id is not uuid';
    end if;
    alter table public.comments alter column id drop identity if exists;
    alter table public.comments alter column id type uuid using gen_random_uuid();
  end if;
end $$;

alter table public.comments
  alter column id set default gen_random_uuid(),
  alter column post_id set not null,
  alter column user_id set default auth.uid(),
  alter column user_id set not null,
  add column if not exists updated_at timestamptz default now();

alter table public.comments
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.post_likes
  alter column post_id set not null,
  alter column user_id set not null;

create unique index if not exists post_likes_post_user_unique
  on public.post_likes(post_id, user_id);

create index if not exists posts_user_id_created_at_idx
  on public.posts(user_id, created_at desc);

create index if not exists posts_created_at_idx
  on public.posts(created_at desc);

create index if not exists comments_post_id_created_at_idx
  on public.comments(post_id, created_at asc);

create index if not exists comments_user_id_idx
  on public.comments(user_id);

create index if not exists post_likes_post_id_idx
  on public.post_likes(post_id);

create index if not exists post_likes_user_id_idx
  on public.post_likes(user_id);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, nombre, email, avatar_url, rol)
  values (
    new.id,
    coalesce(
      nullif(left(new.raw_user_meta_data->>'nombre', 80), ''),
      nullif(left(new.raw_user_meta_data->>'display_name', 80), ''),
      'Usuario'
    ),
    coalesce(new.email, nullif(left(new.raw_user_meta_data->>'email', 160), '')),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    'estudiante'
  )
  on conflict (id) do update set
    nombre = excluded.nombre,
    email = excluded.email,
    updated_at = now();

  return new;
end;
$function$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function private.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
before update on public.comments
for each row execute function private.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.profiles enable row level security;

drop policy if exists posts_public_read on public.posts;
drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_delete_own on public.posts;

create policy posts_public_read
on public.posts for select
to anon, authenticated
using (privacy='public' or (select auth.uid())=user_id);

create policy posts_insert_own
on public.posts for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy posts_update_own
on public.posts for update
to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

create policy posts_delete_own
on public.posts for delete
to authenticated
using ((select auth.uid())=user_id);

drop policy if exists comments_select_visible on public.comments;
drop policy if exists comments_insert_own on public.comments;
drop policy if exists comments_update_own on public.comments;
drop policy if exists comments_delete_own on public.comments;

create policy comments_select_visible
on public.comments for select
to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id=comments.post_id
      and (p.privacy='public' or p.user_id=(select auth.uid()))
  )
);

create policy comments_insert_own
on public.comments for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid())=user_id
  and exists (
    select 1 from public.posts p
    where p.id=comments.post_id
      and (p.privacy='public' or p.user_id=(select auth.uid()))
  )
);

create policy comments_update_own
on public.comments for update
to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

create policy comments_delete_own
on public.comments for delete
to authenticated
using ((select auth.uid())=user_id);

drop policy if exists post_likes_read_authenticated on public.post_likes;
drop policy if exists post_likes_insert_own on public.post_likes;
drop policy if exists post_likes_delete_own on public.post_likes;

create policy post_likes_read_authenticated
on public.post_likes for select
to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id=post_likes.post_id
      and (p.privacy='public' or p.user_id=(select auth.uid()))
  )
);

create policy post_likes_insert_own
on public.post_likes for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid())=user_id
  and exists (
    select 1 from public.posts p
    where p.id=post_likes.post_id
      and (p.privacy='public' or p.user_id=(select auth.uid()))
  )
);

create policy post_likes_delete_own
on public.post_likes for delete
to authenticated
using ((select auth.uid())=user_id);

revoke insert, update, delete on table public.post_likes from anon, authenticated;

create or replace function public.toggle_post_like(p_post_id uuid)
returns table(liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_exists boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_post_id is null then
    raise exception 'INVALID_POST_ID';
  end if;

  if not exists (
    select 1
    from public.posts
    where id=p_post_id
      and (privacy='public' or user_id=v_user_id)
  ) then
    raise exception 'POST_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_post_id::text, 0)
  );

  select exists (
    select 1
    from public.post_likes
    where user_id=v_user_id and post_id=p_post_id
  ) into v_exists;

  if v_exists then
    delete from public.post_likes
    where user_id=v_user_id and post_id=p_post_id;
    liked := false;
  else
    insert into public.post_likes(user_id, post_id)
    values(v_user_id, p_post_id)
    on conflict(post_id, user_id) do nothing;
    liked := true;
  end if;

  select count(*) into like_count
  from public.post_likes
  where post_id=p_post_id;

  return next;
end;
$function$;

revoke execute on function public.toggle_post_like(uuid) from public, anon;
grant execute on function public.toggle_post_like(uuid) to authenticated;

commit;