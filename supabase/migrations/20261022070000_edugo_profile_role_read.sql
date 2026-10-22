-- EduGo: allow authenticated users to read their role field without granting role writes.
-- The existing least-privilege grants keep INSERT/UPDATE restricted to non-privileged profile fields.
-- Apply only after confirming the target project's current schema and migration history.
grant select (rol) on table public.profiles to authenticated;
