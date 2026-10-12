-- FORMA marketplace schema. Run in the Supabase SQL Editor for a new project.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'customer' check (role in ('customer','employee','manager','creator')),
  created_at timestamptz not null default now()
);

create or replace function public.is_creator()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator') $$;

create or replace function public.has_order_role()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('creator','manager')) $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('customer','employee','manager','creator'));

create or replace function public.add_new_profile()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id,email,role) values(new.id,lower(new.email),'customer') on conflict(id) do update set email=excluded.email;
  return new;
end $$;
drop trigger if exists forma_auth_profile on auth.users;
create trigger forma_auth_profile after insert or update of email on auth.users for each row execute function public.add_new_profile();

create table if not exists public.products (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title jsonb not null,
  description jsonb not null,
  category text not null check (category in ('print','resin','laser')),
  price numeric(10,2) not null check (price >= 0),
  weight_kg numeric(8,3) not null default 0.1 check (weight_kg > 0),
  dimensions jsonb not null default '{}'::jsonb,
  image_url text,
  model_url text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'requested' check (status in ('requested','confirmed','in_production','shipped','cancelled')),
  items jsonb not null,
  shipping_address jsonb,
  shipping_rate jsonb,
  shipping_amount numeric(10,2) not null default 0 check (shipping_amount >= 0),
  currency text not null default 'EUR',
  total_items numeric(10,2) not null default 0 check (total_items >= 0),
  tracking_number text,
  tracking_url text,
  shipping_label_url text,
  payment_status text not null default 'not_started' check (payment_status in ('not_started','pending','paid','failed','refunded')),
  payment_provider text,
  payment_amount_eur numeric(10,2),
  payment_crypto_amount numeric(24,8),
  payment_transaction_hash text,
  payment_webhook_token text,
  payment_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
alter table public.orders add column if not exists shipping_label_url text;
alter table public.orders add column if not exists payment_status text not null default 'not_started';
alter table public.orders add column if not exists payment_provider text;
alter table public.orders add column if not exists payment_amount_eur numeric(10,2);
alter table public.orders add column if not exists payment_crypto_amount numeric(24,8);
alter table public.orders add column if not exists payment_transaction_hash text;
alter table public.orders add column if not exists payment_webhook_token text;
alter table public.orders add column if not exists payment_updated_at timestamptz;

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default 'Support request' check (char_length(subject) between 1 and 120),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_conversations_updated_idx on public.support_conversations(status,updated_at desc);
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_conversation_idx on public.support_messages(conversation_id,created_at);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "profiles_read_self_or_creator" on public.profiles;
drop policy if exists "profiles_read_self_or_order_staff" on public.profiles;
create policy "profiles_read_self_or_order_staff" on public.profiles for select to authenticated using (id=auth.uid() or public.has_order_role());
drop policy if exists "employees_read_assigned_customers" on public.profiles;
create policy "employees_read_assigned_customers" on public.profiles for select to authenticated using (
  exists(select 1 from public.orders o where o.assigned_to=auth.uid() and o.user_id=profiles.id)
);
drop policy if exists "creator_manage_profiles" on public.profiles;
create policy "creator_manage_profiles" on public.profiles for update to authenticated using (public.is_creator()) with check (role in ('customer','manager','creator'));

drop policy if exists "published_products_public_read" on public.products;
create policy "published_products_public_read" on public.products for select to anon,authenticated using (published or public.is_creator());
drop policy if exists "creator_insert_products" on public.products;
create policy "creator_insert_products" on public.products for insert to authenticated with check (public.is_creator());
drop policy if exists "creator_update_products" on public.products;
create policy "creator_update_products" on public.products for update to authenticated using (public.is_creator()) with check (public.is_creator());
drop policy if exists "creator_delete_products" on public.products;
create policy "creator_delete_products" on public.products for delete to authenticated using (public.is_creator());

drop policy if exists "customers_create_own_requests" on public.orders;
create policy "customers_create_own_requests" on public.orders for insert to authenticated with check (user_id=auth.uid() and status='requested' and payment_status='not_started' and payment_provider is null and payment_transaction_hash is null);
drop policy if exists "customers_and_staff_read_orders" on public.orders;
create policy "customers_staff_read_orders" on public.orders for select to authenticated using (user_id=auth.uid() or public.has_order_role() or assigned_to=auth.uid());
drop policy if exists "staff_update_orders" on public.orders;
drop policy if exists "employees_update_assigned_orders" on public.orders;
revoke update on public.orders from authenticated;

create or replace function public.assign_order(p_order_id uuid, p_employee_id uuid default null)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not public.has_order_role() then raise exception 'Only managers can assign orders'; end if;
  if p_employee_id is not null and not exists(select 1 from public.profiles where id=p_employee_id and role='employee') then raise exception 'Select an active employee'; end if;
  update public.orders set assigned_to=p_employee_id,updated_at=now() where id=p_order_id;
  if not found then raise exception 'Order not found'; end if;
end $$;

create or replace function public.update_assigned_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if p_status not in ('requested','confirmed','in_production','shipped','cancelled') then raise exception 'Invalid order status'; end if;
  if not exists(select 1 from public.orders where id=p_order_id and assigned_to=auth.uid()) then raise exception 'Order is not assigned to you'; end if;
  update public.orders set status=p_status,updated_at=now() where id=p_order_id;
end $$;
create or replace function public.set_team_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not public.is_creator() then raise exception 'Only the owner can manage employee access'; end if;
  if p_role not in ('customer','employee','manager') then raise exception 'Role must be customer, employee, or manager'; end if;
  update public.profiles set role=p_role where id=p_user_id and role <> 'creator';
  if not found then raise exception 'User not found or protected owner account'; end if;
end $$;
grant execute on function public.assign_order(uuid,uuid) to authenticated;
grant execute on function public.update_assigned_order_status(uuid,text) to authenticated;
grant execute on function public.set_team_role(uuid,text) to authenticated;

grant select on public.products to anon,authenticated;
grant insert,update,delete on public.products to authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert on public.orders to authenticated;
grant select,insert,update on public.support_conversations to authenticated;
grant select,insert on public.support_messages to authenticated;

drop policy if exists "customers_read_own_support" on public.support_conversations;
create policy "customers_read_own_support" on public.support_conversations for select to authenticated using (customer_id=auth.uid() or public.has_order_role());
drop policy if exists "customers_create_support" on public.support_conversations;
create policy "customers_create_support" on public.support_conversations for insert to authenticated with check (customer_id=auth.uid());
drop policy if exists "staff_update_support" on public.support_conversations;
create policy "staff_update_support" on public.support_conversations for update to authenticated using (public.has_order_role()) with check (public.has_order_role());
drop policy if exists "members_read_support_messages" on public.support_messages;
create policy "members_read_support_messages" on public.support_messages for select to authenticated using (public.has_order_role() or exists(select 1 from public.support_conversations c where c.id=conversation_id and c.customer_id=auth.uid()));
drop policy if exists "members_send_support_messages" on public.support_messages;
create policy "members_send_support_messages" on public.support_messages for insert to authenticated with check (sender_id=auth.uid() and (public.has_order_role() or exists(select 1 from public.support_conversations c where c.id=conversation_id and c.customer_id=auth.uid() and c.status='open')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('catalog','catalog',true,52428800,array['image/jpeg','image/png','image/webp','image/svg+xml','model/stl','application/sla','application/vnd.ms-pki.stl','application/octet-stream'])
on conflict(id) do update set public=true,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('customer-models','customer-models',false,26214400,array['model/stl','application/sla','application/vnd.ms-pki.stl','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=26214400;

drop policy if exists "catalog_assets_public_read" on storage.objects;
create policy "catalog_assets_public_read" on storage.objects for select to anon,authenticated using (bucket_id='catalog');
drop policy if exists "creator_upload_catalog_assets" on storage.objects;
create policy "creator_upload_catalog_assets" on storage.objects for insert to authenticated with check (bucket_id='catalog' and public.is_creator());
drop policy if exists "creator_update_catalog_assets" on storage.objects;
create policy "creator_update_catalog_assets" on storage.objects for update to authenticated using (bucket_id='catalog' and public.is_creator()) with check (bucket_id='catalog' and public.is_creator());
drop policy if exists "creator_delete_catalog_assets" on storage.objects;
create policy "creator_delete_catalog_assets" on storage.objects for delete to authenticated using (bucket_id='catalog' and public.is_creator());
drop policy if exists "customer_upload_own_model" on storage.objects;
create policy "customer_upload_own_model" on storage.objects for insert to authenticated with check (bucket_id='customer-models' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "customer_read_own_model" on storage.objects;
create policy "customer_read_own_model" on storage.objects for select to authenticated using (bucket_id='customer-models' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_creator()));

-- After creating your own account, find its UUID in Authentication > Users and run:
-- update public.profiles set role='creator' where id='YOUR_AUTH_USER_UUID';
-- Only use your own account UUID. This assignment is deliberately manual for first-owner bootstrap.

