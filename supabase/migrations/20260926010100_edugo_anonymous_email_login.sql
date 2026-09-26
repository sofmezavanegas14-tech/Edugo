-- EduGo: support anonymous email-only sessions without email delivery.
-- The email entered by the visitor is stored as profile metadata; it is not verified.
-- Anonymous Auth must be enabled in Supabase Dashboard > Authentication > Providers.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.profiles (id, nombre, email, avatar_url, rol)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'nombre',''),
      nullif(new.raw_user_meta_data->>'display_name',''),
      'Usuario'
    ),
    coalesce(new.email, nullif(new.raw_user_meta_data->>'email','')),
    nullif(new.raw_user_meta_data->>'avatar_url',''),
    'estudiante'
  )
  on conflict (id) do update set
    nombre = excluded.nombre,
    email = excluded.email,
    updated_at = now();

  return new;
end;
$function$;
