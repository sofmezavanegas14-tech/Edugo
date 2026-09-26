begin;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='author_id')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='user_id') then
    alter table public.posts rename column author_id to user_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='comments' and column_name='author_id')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='comments' and column_name='user_id') then
    alter table public.comments rename column author_id to user_id;
  end if;
end $$;

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.profiles enable row level security;

drop policy if exists posts_public_read on public.posts;
drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_delete_own on public.posts;
create policy posts_public_read on public.posts for select to anon, authenticated using (privacy='public' or (select auth.uid())=user_id);
create policy posts_insert_own on public.posts for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid())=user_id);
create policy posts_update_own on public.posts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy posts_delete_own on public.posts for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists comments_select_visible on public.comments;
drop policy if exists comments_insert_own on public.comments;
drop policy if exists comments_update_own on public.comments;
drop policy if exists comments_delete_own on public.comments;
create policy comments_select_visible on public.comments for select to authenticated using (exists (select 1 from public.posts p where p.id=comments.post_id and (p.privacy='public' or p.user_id=(select auth.uid()))));
create policy comments_insert_own on public.comments for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid())=user_id and exists (select 1 from public.posts p where p.id=comments.post_id and (p.privacy='public' or p.user_id=(select auth.uid()))));
create policy comments_update_own on public.comments for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy comments_delete_own on public.comments for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists post_likes_read_authenticated on public.post_likes;
drop policy if exists post_likes_insert_own on public.post_likes;
drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_read_authenticated on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id=post_likes.post_id and (p.privacy='public' or p.user_id=(select auth.uid()))));
create policy post_likes_insert_own on public.post_likes for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid())=user_id and exists (select 1 from public.posts p where p.id=post_likes.post_id and (p.privacy='public' or p.user_id=(select auth.uid()))));
create policy post_likes_delete_own on public.post_likes for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_authenticated on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);

revoke all on table public.profiles from anon, authenticated;
grant select (id,nombre,avatar_url) on public.profiles to authenticated;
grant update (nombre,avatar_url,email) on public.profiles to authenticated;

revoke all on table public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

revoke all on table public.comments from anon, authenticated;
grant select, insert, update, delete on public.comments to authenticated;

revoke all on table public.post_likes from anon, authenticated;
grant select, insert, delete on public.post_likes to authenticated;

create index if not exists posts_user_id_created_at_idx on public.posts (user_id, created_at desc);
create index if not exists comments_post_id_created_at_idx on public.comments (post_id, created_at asc);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists post_likes_post_id_idx on public.post_likes (post_id);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);

create or replace function public.toggle_post_like(p_post_id uuid)
returns table(liked boolean, like_count bigint)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_exists boolean;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_post_id is null then raise exception 'INVALID_POST_ID'; end if;
  if not exists (select 1 from public.posts where id=p_post_id and (privacy='public' or user_id=v_user_id)) then
    raise exception 'POST_NOT_FOUND';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_post_id::text,0));
  select exists (select 1 from public.post_likes where user_id=v_user_id and post_id=p_post_id) into v_exists;
  if v_exists then
    delete from public.post_likes where user_id=v_user_id and post_id=p_post_id;
    liked:=false;
  else
    insert into public.post_likes(user_id,post_id) values(v_user_id,p_post_id)
    on conflict(post_id,user_id) do nothing;
    liked:=true;
  end if;
  select count(*) into like_count from public.post_likes where post_id=p_post_id;
  return next;
end;
$function$;

revoke execute on function public.toggle_post_like(uuid) from anon;
grant execute on function public.toggle_post_like(uuid) to authenticated;

commit;