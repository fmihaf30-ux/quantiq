-- Quantiq Database Schema (Idempotent / Safe to re-run)
-- Paste and Run in Supabase SQL Editor

-- 1. Profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'ultimate', 'platinum')),
  plan_status text not null default 'active' check (plan_status in ('active', 'trial', 'past_due', 'canceled')),
  ai_credits_remaining integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. MT5 Accounts (MetaApi bridges)
create table if not exists public.mt5_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  account_number text not null,
  broker text not null,
  server text not null,
  account_name text not null default 'MT5 Account',
  currency text not null default 'USD',
  balance numeric(14,2) not null default 0.00,
  equity numeric(14,2) not null default 0.00,
  free_margin numeric(14,2) not null default 0.00,
  leverage integer not null default 500,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'reauth_required', 'connecting')),
  metaapi_account_id text,
  is_simulated boolean not null default false,
  last_connected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.mt5_accounts enable row level security;

drop policy if exists "Users can CRUD own MT5 accounts" on public.mt5_accounts;
create policy "Users can CRUD own MT5 accounts"
  on public.mt5_accounts for all
  using (auth.uid() = user_id);

-- 3. Cloud Bots
create table if not exists public.cloud_bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  mt5_account_id uuid references public.mt5_accounts(id) on delete cascade not null,
  name text not null,
  symbol text not null,
  timeframe text not null,
  status text not null default 'running' check (status in ('running', 'stopped', 'starting', 'error')),
  strategy_spec jsonb not null,
  total_trades integer not null default 0,
  winning_trades integer not null default 0,
  total_profit numeric(14,2) not null default 0.00,
  win_rate numeric(5,2) not null default 0.00,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cloud_bots enable row level security;

drop policy if exists "Users can CRUD own cloud bots" on public.cloud_bots;
create policy "Users can CRUD own cloud bots"
  on public.cloud_bots for all
  using (auth.uid() = user_id);

-- 4. Cloud Bot Trades
create table if not exists public.cloud_bot_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  bot_id uuid references public.cloud_bots(id) on delete set null,
  mt5_account_id uuid references public.mt5_accounts(id) on delete cascade not null,
  ticket bigint not null,
  symbol text not null,
  type text not null check (type in ('buy', 'sell')),
  volume numeric(8,2) not null,
  open_price numeric(14,5) not null,
  close_price numeric(14,5),
  stop_loss numeric(14,5),
  take_profit numeric(14,5),
  profit numeric(14,2) not null default 0.00,
  status text not null default 'open' check (status in ('open', 'closed', 'canceled')),
  open_time timestamptz not null default now(),
  close_time timestamptz,
  exit_reason text check (exit_reason in ('tp', 'sl', 'manual', 'bot_stop'))
);

alter table public.cloud_bot_trades enable row level security;

drop policy if exists "Users can CRUD own bot trades" on public.cloud_bot_trades;
create policy "Users can CRUD own bot trades"
  on public.cloud_bot_trades for all
  using (auth.uid() = user_id);

-- 5. Cloud Bot Logs (Realtime enabled)
create table if not exists public.cloud_bot_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  bot_id uuid references public.cloud_bots(id) on delete cascade not null,
  log_type text not null check (log_type in ('trade', 'order', 'signal', 'status_change', 'error', 'debug', 'warning')),
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.cloud_bot_logs enable row level security;

drop policy if exists "Users can view own bot logs" on public.cloud_bot_logs;
create policy "Users can view own bot logs"
  on public.cloud_bot_logs for select
  using (auth.uid() = user_id);

-- 6. Analysis History
create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  timeframe text not null,
  bias text not null,
  confidence text not null,
  summary text not null,
  raw_result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.analysis_history enable row level security;

drop policy if exists "Users can view own analysis history" on public.analysis_history;
create policy "Users can view own analysis history"
  on public.analysis_history for select
  using (auth.uid() = user_id);

-- 7. Realtime publications (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cloud_bot_logs'
  ) then
    alter publication supabase_realtime add table public.cloud_bot_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cloud_bot_trades'
  ) then
    alter publication supabase_realtime add table public.cloud_bot_trades;
  end if;
end $$;

-- 8. Auto-create profile trigger on auth.users insert
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
