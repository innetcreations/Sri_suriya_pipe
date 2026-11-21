-- Sri Suriya Polymers website - Supabase setup (run ONCE)
-- Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- The website keeps a full copy of its text data (pages, products, settings, themes, users, enquiries...)
-- in ONE row of this table, so it survives hosts that forget their files (Vercel, free web hosts).
-- Pictures are not stored here, only their web addresses.

create table if not exists public.ssp_state (
  id         text primary key,                 -- always 'main'
  version    bigint      not null default 1,   -- goes up by 1 on every save
  payload    jsonb       not null,             -- the snapshot
  updated_at timestamptz not null default now()
);

-- SECURITY: switch Row Level Security ON and add NO policies.
-- Result: the public "anon" / "authenticated" keys can neither read nor write this table.
-- Only the website's SERVER, which uses the secret (service_role) key, can - that key bypasses RLS.
alter table public.ssp_state enable row level security;
revoke all on public.ssp_state from anon, authenticated;
