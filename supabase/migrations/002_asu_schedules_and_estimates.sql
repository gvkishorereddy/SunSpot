-- Extend the original MVP without deleting existing buildings or reports.
-- This migration is safe to re-run: columns, data, policies, and seeds are
-- created or reconciled idempotently.

do $migration$
declare
  reports_kind "char";
  crowd_reports_kind "char";
  crowd_reports_is_compatible boolean;
begin
  select c.relkind
    into crowd_reports_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'crowd_reports';

  select count(*) = 7
    into crowd_reports_is_compatible
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'crowd_reports'
     and (
       (column_name = 'id' and udt_name = 'uuid') or
       (column_name = 'building_id' and udt_name = 'uuid') or
       column_name in (
         'crowd_level', 'note', 'distance_m', 'location_accuracy_m', 'created_at'
       )
     );

  -- Earlier prototypes used a bigint-based crowd_reports table. Keep it as a
  -- read-only archive instead of dropping it, then promote the working reports
  -- table to the canonical name.
  if crowd_reports_kind = 'r' and not crowd_reports_is_compatible then
    if to_regclass('public.crowd_reports_legacy') is null then
      alter table public.crowd_reports rename to crowd_reports_legacy;
    else
      raise exception 'Both an incompatible crowd_reports table and crowd_reports_legacy already exist';
    end if;
  end if;

  select c.relkind
    into reports_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'reports';

  if to_regclass('public.crowd_reports') is null and reports_kind = 'r' then
    alter table public.reports rename to crowd_reports;
  end if;
end
$migration$;

create table if not exists public.crowd_reports (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  crowd_level smallint not null check (crowd_level between 1 and 10),
  note text check (note is null or char_length(note) <= 280),
  distance_m integer not null check (distance_m >= 0),
  location_accuracy_m integer not null check (location_accuracy_m >= 0),
  created_at timestamptz not null default now()
);

-- If both names already existed before this migration, preserve any original
-- report rows by copying them into the canonical table.
do $migration$
declare
  reports_kind "char";
begin
  select c.relkind
    into reports_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'reports';

  if reports_kind = 'r' then
    insert into public.crowd_reports (
      id, building_id, crowd_level, note, distance_m, location_accuracy_m, created_at
    )
    select id, building_id, crowd_level, note, distance_m, location_accuracy_m, created_at
      from public.reports
    on conflict (id) do nothing;
  end if;
end
$migration$;

alter table public.buildings
  add column if not exists category text not null default 'Library',
  add column if not exists weekly_hours jsonb not null default '{}'::jsonb,
  add column if not exists special_hours jsonb not null default '{}'::jsonb,
  add column if not exists official_hours_url text,
  add column if not exists location_source_url text,
  add column if not exists hours_verified_on date,
  add column if not exists baseline_crowd_level smallint not null default 5,
  add column if not exists timezone text not null default 'America/Phoenix';

do $migration$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'buildings_category_check'
  ) then
    alter table public.buildings
      add constraint buildings_category_check
      check (category in ('Library', 'Student union', 'Student center', 'Event venue'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'buildings_weekly_hours_object_check'
  ) then
    alter table public.buildings
      add constraint buildings_weekly_hours_object_check
      check (jsonb_typeof(weekly_hours) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'buildings_special_hours_object_check'
  ) then
    alter table public.buildings
      add constraint buildings_special_hours_object_check
      check (jsonb_typeof(special_hours) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'buildings_baseline_crowd_level_check'
  ) then
    alter table public.buildings
      add constraint buildings_baseline_crowd_level_check
      check (baseline_crowd_level between 1 and 10);
  end if;
end
$migration$;

create index if not exists crowd_reports_building_id_idx
  on public.crowd_reports (building_id);

create index if not exists crowd_reports_created_at_idx
  on public.crowd_reports (created_at desc);

create index if not exists crowd_reports_building_id_created_at_idx
  on public.crowd_reports (building_id, created_at desc);

alter table public.buildings enable row level security;
alter table public.crowd_reports enable row level security;

drop policy if exists buildings_active_read on public.buildings;
create policy buildings_active_read
  on public.buildings
  for select
  to anon, authenticated
  using (active = true);

drop policy if exists crowd_reports_recent_read on public.crowd_reports;
create policy crowd_reports_recent_read
  on public.crowd_reports
  for select
  to anon, authenticated
  using (created_at >= now() - interval '1 hour');

-- Browser roles may read only the scoped rows above. They cannot create,
-- update, delete, or truncate data. Valid submissions go through the server
-- route, which validates payload and proximity before using the secret key.
revoke insert, update, delete, truncate on public.buildings from anon, authenticated;
revoke insert, update, delete, truncate on public.crowd_reports from anon, authenticated;
grant select on public.buildings to anon, authenticated;
grant select on public.crowd_reports to anon, authenticated;
grant select, insert on public.crowd_reports to service_role;

do $migration$
begin
  if to_regclass('public.crowd_reports_legacy') is not null then
    execute 'revoke all on public.crowd_reports_legacy from anon, authenticated';
  end if;
end
$migration$;

insert into public.buildings (
  slug,
  name,
  campus,
  address,
  latitude,
  longitude,
  verification_radius_m,
  active,
  category,
  weekly_hours,
  special_hours,
  official_hours_url,
  location_source_url,
  hours_verified_on,
  baseline_crowd_level,
  timezone
)
values
  (
    'hayden-library-tempe',
    'Hayden Library',
    'Tempe',
    '300 E Orange Mall, Tempe, AZ 85281',
    33.4190755,
    -111.9346142,
    300,
    true,
    'Library',
    '{"monday":[{"open":"07:00","close":"24:00"}],"tuesday":[{"open":"07:00","close":"24:00"}],"wednesday":[{"open":"07:00","close":"24:00"}],"thursday":[{"open":"07:00","close":"24:00"}],"friday":[{"open":"07:00","close":"22:00"}],"saturday":[{"open":"09:00","close":"22:00"}],"sunday":[{"open":"10:00","close":"24:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-11-11":[],"2026-11-26":[],"2026-11-27":[],"2026-12-24":[],"2026-12-25":[],"2027-01-18":[]}'::jsonb,
    'https://lib.asu.edu/news/asu-library-hours-fall-2026',
    'https://lib.asu.edu/locations/hayden',
    '2026-09-02',
    7,
    'America/Phoenix'
  ),
  (
    'noble-library-tempe',
    'Noble Library',
    'Tempe',
    '601 E Tyler Mall, Tempe, AZ 85281',
    33.4200,
    -111.9306,
    300,
    true,
    'Library',
    '{"monday":[{"open":"07:00","close":"24:00"}],"tuesday":[{"open":"07:00","close":"24:00"}],"wednesday":[{"open":"07:00","close":"24:00"}],"thursday":[{"open":"07:00","close":"24:00"}],"friday":[{"open":"07:00","close":"21:00"}],"saturday":[{"open":"10:00","close":"21:00"}],"sunday":[{"open":"10:00","close":"24:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-11-11":[],"2026-11-26":[],"2026-11-27":[],"2026-12-24":[],"2026-12-25":[],"2027-01-18":[]}'::jsonb,
    'https://lib.asu.edu/news/asu-library-hours-fall-2026',
    'https://lib.asu.edu/locations/noble',
    '2026-09-02',
    6,
    'America/Phoenix'
  ),
  (
    'design-arts-library-tempe',
    'Design and the Arts Library',
    'Tempe',
    '810 S Forest Mall, Design North 153, Tempe, AZ 85281',
    33.42160,
    -111.93875,
    300,
    true,
    'Library',
    '{"monday":[{"open":"08:00","close":"20:00"}],"tuesday":[{"open":"08:00","close":"20:00"}],"wednesday":[{"open":"08:00","close":"20:00"}],"thursday":[{"open":"08:00","close":"20:00"}],"friday":[{"open":"08:00","close":"17:00"}],"saturday":[],"sunday":[{"open":"13:00","close":"20:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-11-11":[],"2026-11-26":[],"2026-11-27":[],"2026-12-24":[],"2026-12-25":[],"2027-01-18":[]}'::jsonb,
    'https://lib.asu.edu/news/asu-library-hours-fall-2026',
    'https://lib.asu.edu/locations/design',
    '2026-09-02',
    4,
    'America/Phoenix'
  ),
  (
    'music-library-tempe',
    'Music Library',
    'Tempe',
    '50 E Gammage Pkwy, Music Building W302, Tempe, AZ 85281',
    33.41542,
    -111.93938,
    300,
    true,
    'Library',
    '{"monday":[{"open":"08:00","close":"20:00"}],"tuesday":[{"open":"08:00","close":"20:00"}],"wednesday":[{"open":"08:00","close":"20:00"}],"thursday":[{"open":"08:00","close":"20:00"}],"friday":[{"open":"08:00","close":"18:00"}],"saturday":[{"open":"13:00","close":"17:00"}],"sunday":[{"open":"13:00","close":"17:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-11-11":[],"2026-11-26":[],"2026-11-27":[],"2026-12-24":[],"2026-12-25":[],"2027-01-18":[]}'::jsonb,
    'https://lib.asu.edu/news/asu-library-hours-fall-2026',
    'https://lib.asu.edu/locations/music',
    '2026-09-02',
    3,
    'America/Phoenix'
  ),
  (
    'downtown-phoenix-campus-library',
    'Downtown Phoenix campus Library',
    'Downtown Phoenix',
    '411 N Central Ave, University Center Lower Level, Phoenix, AZ 85004',
    33.45296,
    -112.07416,
    300,
    true,
    'Library',
    '{"monday":[{"open":"08:00","close":"22:00"}],"tuesday":[{"open":"08:00","close":"22:00"}],"wednesday":[{"open":"08:00","close":"22:00"}],"thursday":[{"open":"08:00","close":"22:00"}],"friday":[{"open":"08:00","close":"19:00"}],"saturday":[],"sunday":[{"open":"10:00","close":"18:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-11-11":[],"2026-11-26":[],"2026-11-27":[],"2026-12-24":[],"2026-12-25":[],"2027-01-18":[]}'::jsonb,
    'https://lib.asu.edu/news/asu-library-hours-fall-2026',
    'https://lib.asu.edu/locations/downtown',
    '2026-09-02',
    5,
    'America/Phoenix'
  ),
  (
    'polytechnic-campus-library',
    'Polytechnic campus Library',
    'Polytechnic',
    '5988 S Backus Mall, Academic Center Lower Level, Mesa, AZ 85212',
    33.30714,
    -111.67843,
    300,
    true,
    'Library',
    '{"monday":[{"open":"08:00","close":"22:00"}],"tuesday":[{"open":"08:00","close":"22:00"}],"wednesday":[{"open":"08:00","close":"22:00"}],"thursday":[{"open":"08:00","close":"22:00"}],"friday":[{"open":"08:00","close":"19:00"}],"saturday":[{"open":"11:00","close":"19:00"}],"sunday":[{"open":"12:00","close":"22:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-11-11":[],"2026-11-26":[],"2026-11-27":[],"2026-12-24":[],"2026-12-25":[],"2027-01-18":[]}'::jsonb,
    'https://lib.asu.edu/news/asu-library-hours-fall-2026',
    'https://lib.asu.edu/locations/polytechnic',
    '2026-09-02',
    4,
    'America/Phoenix'
  ),
  (
    'fletcher-library-west-valley',
    'Fletcher Library',
    'West Valley',
    '4701 W Thunderbird Rd, Phoenix, AZ 85306',
    33.60790,
    -112.15975,
    350,
    true,
    'Library',
    '{"monday":[{"open":"07:30","close":"22:00"}],"tuesday":[{"open":"07:30","close":"22:00"}],"wednesday":[{"open":"07:30","close":"22:00"}],"thursday":[{"open":"07:30","close":"22:00"}],"friday":[{"open":"07:30","close":"18:00"}],"saturday":[],"sunday":[{"open":"11:00","close":"19:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-11-11":[],"2026-11-26":[],"2026-11-27":[],"2026-12-24":[],"2026-12-25":[],"2027-01-18":[]}'::jsonb,
    'https://lib.asu.edu/news/asu-library-hours-fall-2026',
    'https://lib.asu.edu/locations/fletcher',
    '2026-09-02',
    4,
    'America/Phoenix'
  ),
  (
    'memorial-union-tempe',
    'Memorial Union',
    'Tempe',
    '301 E Orange Mall, Tempe, AZ 85281',
    33.4177504,
    -111.9343817,
    350,
    true,
    'Student union',
    '{"monday":[{"open":"06:30","close":"22:00"}],"tuesday":[{"open":"06:30","close":"22:00"}],"wednesday":[{"open":"06:30","close":"22:00"}],"thursday":[{"open":"06:30","close":"22:00"}],"friday":[{"open":"06:30","close":"22:00"}],"saturday":[{"open":"08:00","close":"22:00"}],"sunday":[{"open":"10:00","close":"22:00"}]}'::jsonb,
    '{"2026-09-07":[{"open":"09:00","close":"20:00"}],"2026-10-10":[{"open":"08:00","close":"18:00"}],"2026-10-11":[{"open":"08:00","close":"18:00"}],"2026-10-12":[{"open":"06:30","close":"19:00"}],"2026-10-13":[{"open":"06:30","close":"19:00"}],"2026-11-11":[],"2026-11-25":[{"open":"06:30","close":"17:00"}],"2026-11-26":[],"2026-11-27":[],"2026-11-28":[],"2026-11-29":[]}'::jsonb,
    'https://eoss.asu.edu/mu',
    'https://eoss.asu.edu/mu',
    '2026-09-02',
    8,
    'America/Phoenix'
  ),
  (
    'student-pavilion-tempe',
    'Student Pavilion',
    'Tempe',
    '400 E Orange St, Tempe, AZ 85287',
    33.41855,
    -111.93346,
    350,
    true,
    'Event venue',
    '{"monday":[{"open":"07:00","close":"21:00"}],"tuesday":[{"open":"07:00","close":"21:00"}],"wednesday":[{"open":"07:00","close":"21:00"}],"thursday":[{"open":"07:00","close":"21:00"}],"friday":[{"open":"07:00","close":"21:00"}],"saturday":[{"open":"08:00","close":"17:00"}],"sunday":[]}'::jsonb,
    '{"2026-09-07":[],"2026-10-09":[],"2026-10-10":[],"2026-10-11":[],"2026-10-12":[],"2026-10-13":[],"2026-11-11":[],"2026-11-25":[{"open":"06:30","close":"17:00"}],"2026-11-26":[],"2026-11-27":[],"2026-11-28":[],"2026-11-29":[]}'::jsonb,
    'https://eoss.asu.edu/student-pavilion',
    'https://tours.asu.edu/tempe/student-pavilion',
    '2026-09-02',
    6,
    'America/Phoenix'
  ),
  (
    'student-center-post-office-downtown',
    'Student Center @ the Post Office',
    'Downtown Phoenix',
    '522 N Central Ave, Phoenix, AZ 85004',
    33.4544697,
    -112.0746113,
    300,
    true,
    'Student center',
    '{"monday":[{"open":"08:00","close":"20:00"}],"tuesday":[{"open":"08:00","close":"20:00"}],"wednesday":[{"open":"08:00","close":"20:00"}],"thursday":[{"open":"08:00","close":"20:00"}],"friday":[{"open":"08:00","close":"20:00"}],"saturday":[],"sunday":[]}'::jsonb,
    '{"2026-09-07":[],"2026-10-10":[],"2026-10-11":[],"2026-10-12":[{"open":"08:00","close":"20:00"}],"2026-10-13":[{"open":"08:00","close":"20:00"}],"2026-11-11":[],"2026-11-25":[{"open":"08:00","close":"18:00"}],"2026-11-26":[],"2026-11-27":[],"2026-11-28":[],"2026-11-29":[]}'::jsonb,
    'https://eoss.asu.edu/downtown-student-center',
    'https://eoss.asu.edu/downtown-student-center',
    '2026-09-02',
    5,
    'America/Phoenix'
  ),
  (
    'polytechnic-student-union',
    'Polytechnic Student Union',
    'Polytechnic',
    '5999 S Backus Mall, Mesa, AZ 85212',
    33.30716,
    -111.6770328,
    350,
    true,
    'Student union',
    '{"monday":[{"open":"07:00","close":"20:00"}],"tuesday":[{"open":"07:00","close":"20:00"}],"wednesday":[{"open":"07:00","close":"20:00"}],"thursday":[{"open":"07:00","close":"20:00"}],"friday":[{"open":"07:00","close":"20:00"}],"saturday":[{"open":"08:00","close":"20:00"}],"sunday":[{"open":"08:00","close":"20:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-11-11":[],"2026-11-25":[{"open":"07:00","close":"17:00"}],"2026-11-26":[],"2026-11-27":[],"2026-11-28":[],"2026-11-29":[]}'::jsonb,
    'https://eoss.asu.edu/polyunion',
    'https://eoss.asu.edu/polyunion',
    '2026-09-02',
    6,
    'America/Phoenix'
  ),
  (
    'university-center-west-valley',
    'University Center at West Valley',
    'West Valley',
    '13590 N 47th Ave, Glendale, AZ 85306',
    33.6089528,
    -112.1608974,
    350,
    true,
    'Student center',
    '{"monday":[{"open":"07:00","close":"22:00"}],"tuesday":[{"open":"07:00","close":"22:00"}],"wednesday":[{"open":"07:00","close":"22:00"}],"thursday":[{"open":"07:00","close":"22:00"}],"friday":[{"open":"07:00","close":"22:00"}],"saturday":[{"open":"10:00","close":"16:00"}],"sunday":[{"open":"10:00","close":"16:00"}]}'::jsonb,
    '{"2026-09-07":[],"2026-10-10":[],"2026-10-11":[],"2026-10-12":[{"open":"07:00","close":"17:00"}],"2026-10-13":[{"open":"07:00","close":"17:00"}],"2026-11-11":[],"2026-11-26":[],"2026-11-27":[]}'::jsonb,
    'https://eoss.asu.edu/UC',
    'https://eoss.asu.edu/UC',
    '2026-09-02',
    5,
    'America/Phoenix'
  )
on conflict (slug) do update set
  name = excluded.name,
  campus = excluded.campus,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  verification_radius_m = excluded.verification_radius_m,
  active = excluded.active,
  category = excluded.category,
  weekly_hours = excluded.weekly_hours,
  special_hours = excluded.special_hours,
  official_hours_url = excluded.official_hours_url,
  location_source_url = excluded.location_source_url,
  hours_verified_on = excluded.hours_verified_on,
  baseline_crowd_level = excluded.baseline_crowd_level,
  timezone = excluded.timezone;

-- Keep the old name as a server-only, updatable compatibility view while any
-- previously deployed app instance finishes draining.
do $migration$
declare
  reports_kind "char";
begin
  select c.relkind
    into reports_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'reports';

  if reports_kind is null then
    execute $view$
      create view public.reports
      with (security_invoker = true)
      as select id, building_id, crowd_level, note, distance_m,
                location_accuracy_m, created_at
           from public.crowd_reports
    $view$;
  end if;
end
$migration$;

revoke all on public.reports from anon, authenticated;
grant select, insert on public.reports to service_role;

comment on table public.crowd_reports is
  'Validated, proximity-checked crowd reports retained for historical use; public reads are limited to the latest hour by RLS.';
comment on column public.buildings.weekly_hours is
  'Arizona local-time weekly intervals keyed by lowercase weekday.';
comment on column public.buildings.special_hours is
  'Date-keyed local-time overrides; an empty interval array means closed.';
