create extension if not exists pgcrypto with schema extensions;

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  campus text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  verification_radius_m integer not null default 300 check (verification_radius_m > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  crowd_level smallint not null check (crowd_level between 1 and 10),
  note text check (note is null or char_length(note) <= 280),
  distance_m integer not null check (distance_m >= 0),
  location_accuracy_m integer not null check (location_accuracy_m >= 0),
  created_at timestamptz not null default now()
);

create index if not exists reports_building_id_idx
  on public.reports (building_id);

create index if not exists reports_created_at_idx
  on public.reports (created_at desc);

create index if not exists reports_building_id_created_at_idx
  on public.reports (building_id, created_at desc);

alter table public.buildings enable row level security;
alter table public.reports enable row level security;

-- Deliberately no public policies. All access goes through server routes using
-- the server-only Supabase secret key, which bypasses RLS.

insert into public.buildings (
  slug,
  name,
  campus,
  latitude,
  longitude,
  verification_radius_m,
  active
)
values
  ('hayden-library-tempe', 'Hayden Library', 'Tempe', 33.4190755, -111.9346142, 300, true),
  ('noble-library-tempe', 'Noble Library', 'Tempe', 33.4200, -111.9306, 300, true)
on conflict (slug) do update set
  name = excluded.name,
  campus = excluded.campus,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  verification_radius_m = excluded.verification_radius_m,
  active = excluded.active;
