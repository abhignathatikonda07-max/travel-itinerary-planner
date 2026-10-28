-- Run once in your Supabase project's SQL Editor.
-- Users are managed by Supabase Auth (auth.users).
create table if not exists public.trips (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title varchar(100) not null check (length(btrim(title)) > 0),
  destination varchar(100) not null check (length(btrim(destination)) > 0),
  start_date date not null,
  end_date date not null,
  notes varchar(1000) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_dates check (end_date >= start_date and end_date <= start_date + 60)
);
create index if not exists idx_trips_owner_date on public.trips(user_id, start_date);
create table if not exists public.activities (
  id bigint generated always as identity primary key,
  trip_id bigint not null references public.trips(id) on delete cascade,
  title varchar(120) not null check (length(btrim(title)) > 0),
  activity_date date not null,
  start_time time,
  location varchar(150) not null default '',
  notes varchar(1000) not null default '',
  cost numeric(12,2) not null default 0 check (cost >= 0 and cost <= 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_activities_trip_date on public.activities(trip_id, activity_date, start_time);
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_trips_updated on public.trips;
create trigger trg_trips_updated before update on public.trips for each row execute function public.set_updated_at();
drop trigger if exists trg_activities_updated on public.activities;
create trigger trg_activities_updated before update on public.activities for each row execute function public.set_updated_at();
-- Enforce activity date against parent trip, including when trip dates change.
create or replace function public.validate_activity_date() returns trigger language plpgsql as $$
declare t record;
begin
 select start_date, end_date into t from public.trips where id = new.trip_id for update;
 if not found or new.activity_date < t.start_date or new.activity_date > t.end_date then
   raise exception 'Activity date must be inside trip dates';
 end if;
 return new;
end; $$;
drop trigger if exists trg_activity_date on public.activities;
create trigger trg_activity_date before insert or update on public.activities for each row execute function public.validate_activity_date();
create or replace function public.validate_trip_date_change() returns trigger language plpgsql as $$
begin
 if exists (select 1 from public.activities where trip_id = new.id and (activity_date < new.start_date or activity_date > new.end_date)) then
   raise exception 'Trip date range excludes existing activities';
 end if;
 return new;
end; $$;
drop trigger if exists trg_trip_dates on public.trips;
create trigger trg_trip_dates before update of start_date, end_date on public.trips for each row execute function public.validate_trip_date_change();
-- No direct browser table access. Express verifies token and ownership before using service-role client.
alter table public.trips enable row level security;
alter table public.activities enable row level security;
-- No policies: anon/authenticated have no table rows; service_role bypasses RLS on the server.
revoke all on public.trips, public.activities from anon, authenticated;
