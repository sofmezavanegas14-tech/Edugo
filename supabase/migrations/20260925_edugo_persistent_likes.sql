-- EduGo persistent likes: correct Supabase project (ajrgcnclpziovihjsjym).
-- Non-destructive for current data: audited public EduGo tables contain 0 rows.
-- Existing tables are altered in place; they are not dropped or recreated.

create schema if not exists private;

-- The existing project used bigint post IDs. EduGo requires permanent UUID post IDs.
-- Policies are removed first because PostgreSQL policies can depend on these columns.
drop policy if exists comments_delete_author_or_staff on public.comments;
drop policy if exists comments_insert_own on public.comments;
drop policy if exists comments_select_visible on public.comments;
drop policy if exists comments_select_visible_posts on public.comments;
drop policy if exists comments_update_own on public.comments;
drop policy if exists comments_delete_own on public.comments;
drop policy if exists likes_delete_own on public.post_likes;
drop policy if exists likes_insert_own on public.post_likes;
drop policy if exists likes_select_visible_posts on public.post_likes;
drop policy if exists post_likes_delete_own on public.post_likes;
drop policy if exists post_likes_insert_own on public.post_likes;
drop policy if exists post_likes_read_authenticated on public.post_likes;
drop policy if exists posts_delete_author_or_staff on public.posts;
drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_select_visible on public.posts;
drop policy if exists posts_public_read on public.posts;
drop policy if exists posts_update_own on public.posts;

alter table public.comments drop constraint if exists comments_post_id_fkey;
alter table public.post_likes drop constraint if exists post_likes_post_id_fkey;
alter table public.posts drop constraint if exists posts_pkey;

alter table public.posts alter column id drop identity;
alter table public.posts alter column id type uuid using gen_random_uuid();
alter table public.comments alter column post_id type uuid using post_id::text::uuid;
alter table public.post_likes alter column post_id type uuid using post_id::text::uuid;

alter table public.posts add constraint posts_pkey primary key(id);
alter table public.comments add constraint comments_post_id_fkey foreign key(post_id) references public.posts(id) on delete cascade;
alter table public.post_likes add constraint post_likes_post_id_fkey foreign key(post_id) references public.posts(id) on delete cascade;

alter table public.posts add column if not exists legacy_id text;
create unique index if not exists posts_legacy_id_uidx on public.posts(legacy_id) where legacy_id is not null;
create index if not exists posts_author_id_idx on public.posts(author_id);
create index if not exists posts_created_at_idx on public.posts(created_at desc);

-- Profiles use the existing columns: id, nombre, email, avatar_url, rol.
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon,authenticated;
grant select,insert,update on table public.profiles to authenticated;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
for select to authenticated using(true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated with check((select auth.uid())=id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated using((select auth.uid())=id)
with check((select auth.uid())=id);

create or replace function private.handle_new_edugo_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare base_name text;
begin
  base_name:=coalesce(
    nullif(left(new.raw_user_meta_data->>'display_name',120),''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'Usuario'
  );

  insert into public.profiles(id,nombre,email)
  values(new.id,base_name,new.email)
  on conflict(id) do update
  set nombre=coalesce(excluded.nombre,public.profiles.nombre),
      email=excluded.email,
      updated_at=now();

  return new;
end;
$$;

revoke execute on function private.handle_new_edugo_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_edugo on auth.users;
create trigger on_auth_user_created_edugo
after insert on auth.users
for each row execute function private.handle_new_edugo_user();

-- Posts
alter table public.posts enable row level security;
revoke all on table public.posts from anon,authenticated;
grant select on table public.posts to anon,authenticated;
grant insert,update,delete on table public.posts to authenticated;

create policy posts_public_read on public.posts
for select to anon,authenticated
using(privacy='public' or (select auth.uid())=author_id);

create policy posts_insert_own on public.posts
for insert to authenticated
with check((select auth.uid())=author_id);

create policy posts_update_own on public.posts
for update to authenticated
using((select auth.uid())=author_id)
with check((select auth.uid())=author_id);

create policy posts_delete_own on public.posts
for delete to authenticated
using((select auth.uid())=author_id);

-- Likes
alter table public.post_likes enable row level security;
revoke all on table public.post_likes from anon,authenticated;
grant select,insert,delete on table public.post_likes to authenticated;

alter table public.post_likes drop constraint if exists post_likes_user_post_unique;
create unique index if not exists post_likes_user_post_uidx on public.post_likes(user_id,post_id);
create index if not exists post_likes_post_id_idx on public.post_likes(post_id);
create index if not exists post_likes_user_id_idx on public.post_likes(user_id);

create policy post_likes_read_authenticated on public.post_likes
for select to authenticated using(true);

create policy post_likes_insert_own on public.post_likes
for insert to authenticated
with check(
  (select auth.uid())=user_id
  and exists(
    select 1 from public.posts p
    where p.id=post_likes.post_id
      and (p.privacy='public' or p.author_id=(select auth.uid()))
  )
);

create policy post_likes_delete_own on public.post_likes
for delete to authenticated
using((select auth.uid())=user_id);

-- Comments
alter table public.comments enable row level security;
revoke all on table public.comments from anon,authenticated;
grant select,insert,update,delete on table public.comments to authenticated;
create index if not exists comments_post_id_created_at_idx on public.comments(post_id,created_at);
create index if not exists comments_author_id_idx on public.comments(author_id);

create policy comments_select_visible on public.comments
for select to authenticated
using(
  exists(
    select 1 from public.posts p
    where p.id=comments.post_id
      and (p.privacy='public' or p.author_id=(select auth.uid()))
  )
);

create policy comments_insert_own on public.comments
for insert to authenticated
with check(
  (select auth.uid())=author_id
  and exists(
    select 1 from public.posts p
    where p.id=comments.post_id
      and (p.privacy='public' or p.author_id=(select auth.uid()))
  )
);

create policy comments_update_own on public.comments
for update to authenticated
using((select auth.uid())=author_id)
with check((select auth.uid())=author_id);

create policy comments_delete_own on public.comments
for delete to authenticated
using((select auth.uid())=author_id);

-- Atomic like toggle. SECURITY INVOKER keeps RLS in force.
create or replace function public.toggle_post_like(p_post_id uuid)
returns table(liked boolean,like_count bigint)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_exists boolean;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists(
    select 1 from public.posts
    where id=p_post_id
      and (privacy='public' or author_id=v_user_id)
  ) then raise exception 'POST_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text||':'||p_post_id::text,0)
  );

  select exists(
    select 1 from public.post_likes
    where user_id=v_user_id and post_id=p_post_id
  ) into v_exists;

  if v_exists then
    delete from public.post_likes
    where user_id=v_user_id and post_id=p_post_id;
    liked:=false;
  else
    insert into public.post_likes(user_id,post_id)
    values(v_user_id,p_post_id)
    on conflict(user_id,post_id) do nothing;
    liked:=true;
  end if;

  select count(*) into like_count
  from public.post_likes
  where post_id=p_post_id;

  return next;
end;
$$;

revoke execute on function public.toggle_post_like(uuid) from public,anon;
grant execute on function public.toggle_post_like(uuid) to authenticated;
