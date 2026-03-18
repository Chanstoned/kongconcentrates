-- ═══════════════════════════════════════════════════════════════
--  KONG CONCENTRATES — WHOLESALE PORTAL  ·  Supabase Schema
--
--  Run this in your Supabase project:
--  Dashboard → SQL Editor → New query → paste and run
-- ═══════════════════════════════════════════════════════════════

-- Dispensary profiles (links to Supabase Auth users)
create table if not exists dispensaries (
  id            uuid references auth.users on delete cascade primary key,
  name          text not null,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  approved      boolean default false,
  reward_points integer not null default 0,
  created_at    timestamptz default now()
);

-- Wholesale product catalog
create table if not exists wholesale_products (
  id              uuid default gen_random_uuid() primary key,
  name            text not null,
  description     text,
  category        text,
  price_wholesale numeric(10,2) not null,
  unit_label      text default 'per unit',
  min_qty         integer default 1,
  available       boolean default true,
  created_at      timestamptz default now()
);

-- Orders
create table if not exists wholesale_orders (
  id             uuid default gen_random_uuid() primary key,
  dispensary_id  uuid references dispensaries(id) on delete cascade not null,
  status         text default 'received'
                   check (status in ('received','processing','out_for_delivery','complete')),
  total          numeric(10,2) not null,
  credit_applied numeric(10,2) not null default 0,
  points_earned  integer not null default 0,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Order line items
create table if not exists wholesale_order_items (
  id            uuid default gen_random_uuid() primary key,
  order_id      uuid references wholesale_orders(id) on delete cascade not null,
  product_id    uuid references wholesale_products(id) on delete set null,
  product_name  text not null,
  quantity      integer not null,
  unit_price    numeric(10,2) not null,
  subtotal      numeric(10,2) not null
);

-- ── Row Level Security ──────────────────────────────────────────

alter table dispensaries         enable row level security;
alter table wholesale_products   enable row level security;
alter table wholesale_orders     enable row level security;
alter table wholesale_order_items enable row level security;

-- Dispensaries: each user can only read/write their own profile
create policy "dispensary_self"
  on dispensaries for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Products: any authenticated user can read available products
create policy "products_authenticated_read"
  on wholesale_products for select
  using (auth.role() = 'authenticated' and available = true);

-- Orders: dispensaries can only see and create their own orders
create policy "orders_own_read"
  on wholesale_orders for select
  using (auth.uid() = dispensary_id);

create policy "orders_own_insert"
  on wholesale_orders for insert
  with check (auth.uid() = dispensary_id);

-- Order items: dispensaries can only see items from their own orders
create policy "order_items_own_read"
  on wholesale_order_items for select
  using (
    order_id in (
      select id from wholesale_orders where dispensary_id = auth.uid()
    )
  );

create policy "order_items_own_insert"
  on wholesale_order_items for insert
  with check (
    order_id in (
      select id from wholesale_orders where dispensary_id = auth.uid()
    )
  );

-- ── Products ─────────────────────────────────────────────────────

insert into wholesale_products (name, description, category, price_wholesale, unit_label, min_qty) values
  ('Pink Runtz', 'Live rosin, non-solvent. Fresh-frozen single-source.', 'Rosin', 30.00, 'per gram', 1),
  ('Bacio Mints', 'Live rosin, non-solvent. Fresh-frozen single-source.', 'Rosin', 30.00, 'per gram', 1),
  ('Hooch x White Rainbow', 'Live rosin, non-solvent. Fresh-frozen single-source.', 'Rosin', 30.00, 'per gram', 1),
  ('Sticky Buns', 'Live rosin, non-solvent. Fresh-frozen single-source.', 'Rosin', 30.00, 'per gram', 1),
  ('Devil Driver', 'Live rosin, non-solvent. Fresh-frozen single-source.', 'Rosin', 30.00, 'per gram', 1),
  ('Grape Pie', 'Live rosin, non-solvent. Fresh-frozen single-source.', 'Rosin', 30.00, 'per gram', 1),
  ('Bacio Mints Vape', 'Live rosin vape cartridge.', 'Vape', 30.00, 'each', 1),
  ('Creme Soda x Pink Runtz Hash Hole', 'Infused pre-roll with live rosin hash hole.', 'Pre-Roll', 40.00, 'each', 1)
on conflict do nothing;

-- ── Reward Points migration (run if tables already exist) ─────────
alter table dispensaries    add column if not exists reward_points  integer      not null default 0;
alter table wholesale_orders add column if not exists credit_applied numeric(10,2) not null default 0;
alter table wholesale_orders add column if not exists points_earned  integer      not null default 0;

-- ── Product image migration (run if table already exists) ──────────
alter table wholesale_products add column if not exists image_url text;

-- ── Commission payments (run once) ────────────────────────────────
create table if not exists wholesale_commission_payments (
  id         uuid primary key default gen_random_uuid(),
  amount     numeric(10,2) not null,
  note       text,
  paid_at    timestamptz not null default now(),
  created_at timestamptz default now()
);
alter table wholesale_commission_payments enable row level security;
-- No public policies — only accessible via service role key (admin API)
