-- Visit Schedule Site — Supabase Schema
-- Run this in the Supabase SQL editor for the new project.

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  bm_count int default 0,
  footfall_data jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  role text not null check (role in ('admin','pre_sales','store_manager','receptionist','store_bm')),
  passcode text,
  store_id uuid references stores(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists store_visits (
  id uuid primary key default gen_random_uuid(),
  kylas_id text unique,
  store_id uuid references stores(id) on delete cascade,
  customer_name text not null,
  phone text,
  visit_date date,
  visit_time text,
  categories jsonb default '[]',
  sku_links jsonb default '[]',
  presales_notes text,
  availability_status text check (availability_status in ('available','partial','unavailable')),
  availability_notes text,
  arrival_time timestamptz,
  assigned_bm_id uuid references profiles(id) on delete set null,
  bm_comments text,
  house_stage text,
  follow_up text,
  visit_status text default 'scheduled' check (visit_status in ('scheduled','arrived','bm_assigned','completed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists bm_status (
  id uuid primary key default gen_random_uuid(),
  bm_id uuid references profiles(id) on delete cascade,
  store_id uuid references stores(id) on delete cascade,
  status text default 'free' check (status in ('free','engaged','potentially_available')),
  last_allocated_at timestamptz,
  active_client_count int default 0,
  updated_at timestamptz default now()
);

create table if not exists visit_assignments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references store_visits(id) on delete cascade,
  bm_id uuid references profiles(id) on delete cascade,
  assigned_at timestamptz default now(),
  store_id uuid references stores(id) on delete cascade
);

-- Row-level security (open policies — app uses anon key, no auth layer)
alter table stores enable row level security;
alter table profiles enable row level security;
alter table store_visits enable row level security;
alter table bm_status enable row level security;
alter table visit_assignments enable row level security;

create policy "anon_all" on stores for all using (true) with check (true);
create policy "anon_all" on profiles for all using (true) with check (true);
create policy "anon_all" on store_visits for all using (true) with check (true);
create policy "anon_all" on bm_status for all using (true) with check (true);
create policy "anon_all" on visit_assignments for all using (true) with check (true);

-- Seed: first admin (update email/name as needed before running)
-- insert into profiles (name, email, role) values ('Admin', 'admin@materialdepot.com', 'admin');

-- Public holidays: dates that use weekend footfall for slot capacity
create table if not exists public_holidays (
  id uuid default gen_random_uuid() primary key,
  date text not null unique,  -- 'YYYY-MM-DD'
  name text not null,
  created_at timestamptz default now()
);
