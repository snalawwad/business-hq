-- =====================================================================
-- Ramadan Drop · Business HQ — database (Supabase / Postgres)
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- Every price, total and summary is calculated here, in the database,
-- so whoever adds an expense, both of you see the same numbers.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Who may use the tracker ----------------------------------
create table if not exists members (
  email text primary key,
  name  text
);

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Settings (one row) ---------------------------------------
create table if not exists settings (
  id                int primary key default 1 check (id = 1),
  budget            numeric not null default 1500,  -- KD
  multiplier        numeric not null default 2.5,   -- price = full cost × this
  round_to          numeric not null default 1,     -- round prices up to nearest KD
  pack_size         int     not null default 3,
  pack_discount     numeric not null default 0.10,  -- 0.10 = 10%
  planned_sets      int     not null default 100,   -- overheads are spread over these
  include_overheads boolean not null default true,
  target_min        numeric not null default 14,
  target_max        numeric not null default 20,
  tasks_per_day     int     not null default 3,      -- daily task feed size per person
  brand_name        text    not null default 'Diyafa',
  brand_ar          text    not null default 'ضيافة',
  ig_bio            text    not null default 'Ramadan uniforms for your household team · Kuwait
Family embroidery · Household packs
Order on WhatsApp ↓',
  shortlist         jsonb   not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),
  updated_by        text
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------- The Ramadan drop -----------------------------------------
create table if not exists styles (
  id           serial primary key,
  name         text unique not null,
  target_price numeric not null,
  sort         int not null default 0,
  active       boolean not null default true
);
insert into styles (name, target_price, sort) values
  ('Daily Stripe Shirt set', 14, 1),
  ('Tie Top set',            16, 2),
  ('Side-Button Tunic set',  16, 3),
  ('Wrap Top set',           18, 4),
  ('Kimono Hosting set',     20, 5)
on conflict (name) do nothing;

-- ---------- Expense categories ---------------------------------------
-- per_set  = goes into the cost of each set (enter "sets covered")
-- overhead = shared business costs, spread over planned_sets
create table if not exists categories (
  name text primary key,
  kind text not null check (kind in ('per_set', 'overhead')),
  sort int  not null default 0
);
insert into categories (name, kind, sort) values
  ('Fabric','per_set',1), ('Sewing','per_set',2), ('Embroidery','per_set',3),
  ('Trims & buttons','per_set',4), ('Labels & packaging','per_set',5), ('Delivery','per_set',6),
  ('Samples','overhead',10), ('Exhibition','overhead',11), ('Booth display','overhead',12),
  ('Photoshoot','overhead',13), ('Licence & bank','overhead',14), ('Marketing','overhead',15),
  ('Other','overhead',16)
on conflict (name) do nothing;

-- ---------- Expenses --------------------------------------------------
create table if not exists expenses (
  id             uuid primary key default gen_random_uuid(),
  spent_on       date not null default current_date,
  category       text not null references categories(name) on update cascade,
  scope          text not null default 'style' check (scope in ('style','all_styles','general')),
  style_id       int references styles(id) on delete set null,
  item           text not null default '',
  supplier       text not null default '',
  amount         numeric not null check (amount >= 0),     -- KD paid
  sets_covered   int check (sets_covered is null or sets_covered >= 0),
  notes          text not null default '',
  created_by     text default (auth.jwt() ->> 'email'),
  created_at     timestamptz not null default now(),
  constraint style_needed check (scope <> 'style' or style_id is not null)
);

-- ---------- Price overrides (optional, per style) ---------------------
create table if not exists price_overrides (
  style_id   int primary key references styles(id) on delete cascade,
  price      numeric not null check (price > 0),
  updated_by text default (auth.jwt() ->> 'email'),
  updated_at timestamptz not null default now()
);

-- ---------- Orders ----------------------------------------------------
create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  ordered_on    date not null default current_date,
  customer      text not null,
  channel       text not null default 'Instagram'
                check (channel in ('Exhibition','Instagram','WhatsApp','Referral','B2B')),
  style_id      int not null references styles(id),
  qty           int not null default 1 check (qty > 0),
  price_charged numeric check (price_charged is null or price_charged >= 0), -- blank = automatic price
  discount_pct  numeric not null default 0 check (discount_pct between 0 and 100),
  deposit       numeric not null default 0 check (deposit >= 0),
  status        text not null default 'New'
                check (status in ('New','Deposit paid','In production','Embroidery','Quality check','Out for delivery','Delivered','Cancelled')),
  embroidery    text not null default '',
  notes         text not null default '',
  created_by    text default (auth.jwt() ->> 'email'),
  created_at    timestamptz not null default now()
);


-- ---------- Launch plan: phases + tasks --------------------------------
create table if not exists phases (
  id     text primary key,
  name   text not null,
  starts date not null,
  ends   date not null,
  sort   int  not null default 0
);
insert into phases (id, name, starts, ends, sort) values
  ('p1','Brand, licence & bank','2026-10-26','2026-11-22',1),
  ('p2','Tailor quotes & samples','2026-11-02','2026-12-06',2),
  ('p3','Exhibition applications','2026-11-16','2026-12-20',3),
  ('p4','Photoshoot','2026-12-07','2026-12-13',4),
  ('p5','Instagram launch','2026-12-01','2027-01-04',5),
  ('p6','Production','2026-12-21','2027-01-24',6),
  ('p7','Pre-orders','2027-01-05','2027-01-25',7),
  ('p8','Exhibitions & sales','2027-01-18','2027-02-07',8),
  ('p9','Ramadan','2027-02-08','2027-02-14',9)
on conflict (id) do nothing;

create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  phase_id      text references phases(id) on delete set null,
  title         text not null,
  details       text not null default '',
  sort          int  not null default 100,
  owner         text,            -- who should do it (email); blank = either of you
  assigned_to   text,            -- set automatically by the daily feed
  scheduled_for date,            -- the day it was handed out
  snoozed_until date,            -- "not today"
  rolled_over   int  not null default 0,  -- days it was carried over unfinished
  done          boolean not null default false,
  done_by       text,
  done_at       timestamptz,
  created_by    text default (auth.jwt() ->> 'email'),
  created_at    timestamptz not null default now()
);

insert into tasks (phase_id, title, details, sort)
select * from (values
  ('p1','Pick the final brand name','Use the Brand page shortlist. Check Instagram, TikTok and MOCI trade-name availability.',1),
  ('p1','Reserve the Instagram and TikTok handles','Same handle on both, e.g. name.kw.',2),
  ('p1','Ask MOCI which licence fits clothing sales','Home business or freelance licence. Ask if a full-time private-sector job affects eligibility.',3),
  ('p1','Apply for the licence','',4),
  ('p1','Open a business bank account','',5),
  ('p1','Get bank approval for online payments','Needed before a payment-link provider can pay out.',6),
  ('p1','Set up a payment link provider','',7),
  ('p2','Shortlist 3 tailors and 1 embroidery shop','Add each to Suppliers with phone and notes.',1),
  ('p2','Send the Ramadan drop specs to each tailor','Share the Ramadan drop page.',2),
  ('p2','Get quotes at 20, 50 and 100 sets','Log each quote per set in Suppliers.',3),
  ('p2','Buy fabric swatches in cream, sand and taupe','Log the cost as a Samples expense.',4),
  ('p2','Wash-test the swatches 5 times at 40°C','Check shrinking, fading and creasing.',5),
  ('p2','Order one sample of each set in size M','',6),
  ('p2','Fit the samples on a real household worker','Note what feels tight, hot or awkward.',7),
  ('p2','Approve final changes with the tailor','',8),
  ('p2','Digitize the logo for embroidery','Keep the DST/PES file.',9),
  ('p3','List Ramadan exhibitions and their deadlines','Add each one on the Exhibitions page.',1),
  ('p3','Write the bilingual brand blurb','',2),
  ('p3','Prepare 5–8 real product photos','',3),
  ('p3','Send the exhibition applications','',4),
  ('p4','Book a photographer and models','Written consent from everyone photographed.',1),
  ('p4','Shoot front, back and side of each set','',2),
  ('p4','Shoot in-use scenes: serving, carrying, iftar table','',3),
  ('p4','Shoot close-ups: piping, embroidery, fabric','',4),
  ('p5','Set up profile picture, bio and highlight covers','Bio is on the Instagram page.',1),
  ('p5','Post the first 3 teaser posts','Use the grid planner.',2),
  ('p5','Run a colour poll in stories','',3),
  ('p5','Post the full 9-post grid','',4),
  ('p6','Book tailor capacity in writing','',1),
  ('p6','Order the first stock','Deepest in the Tie Top set, sizes M and L.',2),
  ('p6','Order labels, hang tags and packaging','',3),
  ('p6','Quality-check every piece','',4),
  ('p6','Pack sets with tags and thank-you cards','',5),
  ('p7','Open pre-orders with the early-bird offer','',1),
  ('p7','Announce the last order date','',2),
  ('p7','Confirm every deposit in Orders','',3),
  ('p8','Pack the booth kit','Tick it off on the Exhibitions page.',1),
  ('p8','Collect WhatsApp numbers at the booth','',2),
  ('p8','Follow up every booth contact within 48 hours','',3),
  ('p9','Deliver the last orders','',1),
  ('p9','Share customer photos from iftars','With permission.',2),
  ('p9','Send restock alerts for what sold out','',3)
) as v(phase_id, title, details, sort)
where not exists (select 1 from tasks);

-- The daily feed: each person gets `tasks_per_day` tasks. Unfinished ones roll over.
-- When today's batch is all done, the next batch is handed out automatically.
create or replace function pull_tasks(n int default null)
returns setof tasks
language plpgsql security invoker set search_path = public as $$
declare
  me    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  d     date := (now() at time zone 'Asia/Kuwait')::date;
  quota int;
  open_count int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  select coalesce(n, tasks_per_day, 3) into quota from settings where id = 1;
  -- roll yesterday's unfinished tasks over to today
  update tasks set scheduled_for = d, rolled_over = rolled_over + 1
   where lower(assigned_to) = me and not done and scheduled_for < d;
  select count(*) into open_count from tasks
   where lower(assigned_to) = me and not done and scheduled_for = d;
  if open_count = 0 then
    update tasks set assigned_to = me, scheduled_for = d
     where id in (
       select t.id from tasks t left join phases p on p.id = t.phase_id
        where not t.done and t.assigned_to is null
          and (t.owner is null or t.owner = '' or lower(t.owner) = me)
          and (t.snoozed_until is null or t.snoozed_until <= d)
        order by p.sort nulls last, t.sort, t.created_at
        limit quota
        for update of t skip locked);
  end if;
  return query
    select * from tasks
     where lower(assigned_to) = me and scheduled_for = d
       and (not done or (done_at at time zone 'Asia/Kuwait')::date = d)
     order by done, (select ph.sort from phases ph where ph.id = phase_id), sort;
end $$;

-- ---------- Exhibitions, booth kit, suppliers, Instagram -------------
create table if not exists expos (
  id uuid primary key default gen_random_uuid(),
  name text not null, location text not null default '',
  apply_by date, starts date, fee numeric not null default 0,
  status text not null default 'Researching' check (status in ('Researching','Applied','Accepted','Paid','Done','Rejected')),
  notes text not null default '',
  created_by text default (auth.jwt() ->> 'email'), created_at timestamptz not null default now()
);

create table if not exists checklist (
  id uuid primary key default gen_random_uuid(),
  list text not null check (list in ('booth','ig_weeks')),
  title text not null, details text not null default '', sort int not null default 0,
  done boolean not null default false, done_by text, done_at timestamptz
);
insert into checklist (list, title, details, sort)
select * from (values
  ('booth','Clothing rail and hangers','',1), ('booth','Mannequin in the Tie Top set','',2),
  ('booth','Full size run and a mirror','',3), ('booth','Swatch and embroidery board','',4),
  ('booth','Price and pack-offer sign (AR/EN)','',5), ('booth','Order forms, tape measure, size chart','',6),
  ('booth','Card machine or payment QR','',7), ('booth','Instagram and WhatsApp QR','',8),
  ('booth','Lantern and tray props','',9),
  ('ig_weeks','Week 1 · Tease','Profile, bio, highlights · 3 teaser posts · colour poll',1),
  ('ig_weeks','Week 2 · Reveal','Lookbook carousel · 2 reels of the sets in use · size guide highlight',2),
  ('ig_weeks','Week 3 · Pre-orders','Early-bird post · countdown sticker · first customer story',3),
  ('ig_weeks','Week 4 · Exhibition','Booth location post · daily booth stories · try-on reel',4),
  ('ig_weeks','Ramadan · Proof','Customer photos · thank-you posts · restock alerts',5)
) as v(list, title, details, sort)
where not exists (select 1 from checklist);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Tailor' check (type in ('Tailor','Fabric','Embroidery','Labels & packaging','Photographer','Exhibition organizer','Delivery','Other')),
  phone text not null default '', quote numeric, notes text not null default '',
  chosen boolean not null default false,
  created_by text default (auth.jwt() ->> 'email'), created_at timestamptz not null default now()
);

create table if not exists ig_posts (
  id uuid primary key default gen_random_uuid(),
  position int not null,
  type text not null default 'product' check (type in ('announce','product','detail','quote','bts','offer')),
  caption text not null default '',
  post_date date,
  status text not null default 'Idea' check (status in ('Idea','Shot','Edited','Scheduled','Posted'))
);
insert into ig_posts (position, type, caption)
select * from (values
  (1,'announce','Coming this Ramadan: uniforms your household team will love wearing.'),
  (2,'product','The Tie Top set: mandarin collar, gold piping, straight pants.'),
  (3,'detail','Gold piping on every collar and cuff.'),
  (4,'bts','At the tailor: first samples, first fittings.'),
  (5,'quote','Hospitality is the first gift you give a guest.'),
  (6,'product','The Kimono Hosting set, for iftar and ghabga nights.'),
  (7,'detail','Your family initials, embroidered.'),
  (8,'offer','Household packs of 3, embroidery included.'),
  (9,'announce','Pre-orders open. Last order date in stories.')
) as v(position, type, caption)
where not exists (select 1 from ig_posts);


-- ---------- Activity log: who did what, filled in automatically ------------
create table if not exists activity (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  actor  text,
  kind   text not null,     -- task, expense, order, checklist, expo, supplier, setting
  action text not null,     -- e.g. completed, added, deleted, changed
  title  text not null default '',
  detail text not null default ''
);

create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce(auth.jwt() ->> 'email', 'system');
begin
  if TG_TABLE_NAME = 'tasks' then
    if TG_OP = 'INSERT' then
      insert into activity(actor,kind,action,title) values (who,'task','added',new.title);
    elsif TG_OP = 'UPDATE' and new.done and not old.done then
      insert into activity(actor,kind,action,title) values (who,'task','completed',new.title);
    elsif TG_OP = 'UPDATE' and old.done and not new.done then
      insert into activity(actor,kind,action,title) values (who,'task','reopened',new.title);
    elsif TG_OP = 'UPDATE' and new.snoozed_until is distinct from old.snoozed_until and new.snoozed_until is not null then
      insert into activity(actor,kind,action,title) values (who,'task','postponed',new.title);
    elsif TG_OP = 'DELETE' then
      insert into activity(actor,kind,action,title) values (who,'task','deleted',old.title);
    end if;
  elsif TG_TABLE_NAME = 'expenses' then
    if TG_OP = 'INSERT' then
      insert into activity(actor,kind,action,title,detail) values (who,'expense','added',coalesce(nullif(new.item,''),new.category),'KD '||new.amount::text||' · '||new.category);
    elsif TG_OP = 'DELETE' then
      insert into activity(actor,kind,action,title,detail) values (who,'expense','deleted',coalesce(nullif(old.item,''),old.category),'KD '||old.amount::text);
    end if;
  elsif TG_TABLE_NAME = 'orders' then
    if TG_OP = 'INSERT' then
      insert into activity(actor,kind,action,title,detail) values (who,'order','added',new.customer,new.qty::text||' set(s)');
    elsif TG_OP = 'UPDATE' and new.status is distinct from old.status then
      insert into activity(actor,kind,action,title,detail) values (who,'order','moved',new.customer,old.status||' → '||new.status);
    elsif TG_OP = 'UPDATE' and new.deposit is distinct from old.deposit then
      insert into activity(actor,kind,action,title,detail) values (who,'order','deposit',new.customer,'KD '||new.deposit::text);
    elsif TG_OP = 'DELETE' then
      insert into activity(actor,kind,action,title) values (who,'order','deleted',old.customer);
    end if;
  elsif TG_TABLE_NAME = 'checklist' then
    if TG_OP = 'UPDATE' and new.done and not old.done then
      insert into activity(actor,kind,action,title) values (who,'checklist','ticked',new.title);
    end if;
  elsif TG_TABLE_NAME = 'expos' then
    if TG_OP = 'INSERT' then
      insert into activity(actor,kind,action,title) values (who,'expo','added',new.name);
    elsif TG_OP = 'UPDATE' and new.status is distinct from old.status then
      insert into activity(actor,kind,action,title,detail) values (who,'expo','moved',new.name,old.status||' → '||new.status);
    end if;
  elsif TG_TABLE_NAME = 'suppliers' then
    if TG_OP = 'INSERT' then
      insert into activity(actor,kind,action,title,detail) values (who,'supplier','added',new.name,new.type);
    elsif TG_OP = 'UPDATE' and new.chosen and not old.chosen then
      insert into activity(actor,kind,action,title) values (who,'supplier','chose',new.name);
    end if;
  elsif TG_TABLE_NAME = 'settings' then
    insert into activity(actor,kind,action,title) values (who,'setting','changed','Settings');
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['tasks','expenses','orders','checklist','expos','suppliers','settings'] loop
    execute format('drop trigger if exists trg_activity on %I', t);
    execute format('create trigger trg_activity after insert or update or delete on %I for each row execute function log_activity()', t);
  end loop;
end $$;

-- =====================================================================
-- AUTOMATIC CALCULATIONS (views)
-- =====================================================================

-- Cost per set for every style × per-set category:
-- average of what was paid for that style + average of "all styles" costs.
create or replace view v_style_cost_parts with (security_invoker = on) as
select
  st.id   as style_id,
  c.name  as category,
  coalesce((select sum(e.amount) / nullif(sum(e.sets_covered), 0)
            from expenses e
            where e.category = c.name and e.scope = 'style'
              and e.style_id = st.id and coalesce(e.sets_covered,0) > 0), 0)
  + coalesce((select sum(e.amount) / nullif(sum(e.sets_covered), 0)
              from expenses e
              where e.category = c.name and e.scope = 'all_styles'
                and coalesce(e.sets_covered,0) > 0), 0)
    as cost_per_set
from styles st
cross join categories c
where c.kind = 'per_set' and st.active;

create or replace view v_style_pricing with (security_invoker = on) as
with s as (select * from settings where id = 1),
oh as (
  select coalesce(sum(e.amount), 0) as total
  from expenses e join categories c on c.name = e.category
  where c.kind = 'overhead'
),
parts as (
  select style_id,
         sum(cost_per_set) as direct_cost,
         jsonb_object_agg(category, round(cost_per_set, 3)) as breakdown
  from v_style_cost_parts group by style_id
),
own as (
  select e.style_id, count(*) as n
  from expenses e join categories c on c.name = e.category
  where c.kind = 'per_set' and e.scope = 'style' and coalesce(e.sets_covered,0) > 0
  group by e.style_id
),
base as (
  select st.id as style_id, st.name, st.sort, st.target_price,
         p.breakdown,
         round(coalesce(p.direct_cost, 0), 3) as direct_cost,
         round(case when s.include_overheads and s.planned_sets > 0
                    then oh.total / s.planned_sets else 0 end, 3) as overhead_per_set,
         coalesce(own.n, 0) > 0 as has_costs,
         po.price as price_override,
         s.multiplier, s.round_to, s.pack_size, s.pack_discount, s.target_min, s.target_max
  from styles st
  cross join s cross join oh
  left join parts p on p.style_id = st.id
  left join own   on own.style_id = st.id
  left join price_overrides po on po.style_id = st.id
  where st.active
),
priced as (
  select b.*,
         b.direct_cost + b.overhead_per_set as full_cost,
         case when b.has_costs and (b.direct_cost + b.overhead_per_set) > 0
              then ceil((b.direct_cost + b.overhead_per_set) * b.multiplier / nullif(b.round_to,0)) * b.round_to
              else 0 end as suggested_price
  from base b
)
select style_id, name, sort, target_price, breakdown, direct_cost, overhead_per_set,
       round(full_cost, 3) as full_cost,
       suggested_price,
       price_override,
       coalesce(price_override, suggested_price) as final_price,
       case when coalesce(price_override, suggested_price) > 0
            then round(coalesce(price_override, suggested_price) - full_cost, 3) else 0 end as profit_per_set,
       case when coalesce(price_override, suggested_price) > 0
            then round((coalesce(price_override, suggested_price) - full_cost) / coalesce(price_override, suggested_price), 4) else 0 end as margin,
       case when coalesce(price_override, suggested_price) > 0
            then ceil(coalesce(price_override, suggested_price) * pack_size * (1 - pack_discount) / nullif(round_to,0)) * round_to
            else 0 end as pack_price,
       round(target_price / nullif(multiplier, 0), 3) as max_cost_for_target,
       case when coalesce(price_override, suggested_price) = 0 then 'no costs yet'
            when coalesce(price_override, suggested_price) < target_min then 'below range'
            when coalesce(price_override, suggested_price) > target_max then 'above range'
            else 'in range' end as range_status,
       has_costs
from priced
order by sort;

create or replace view v_orders with (security_invoker = on) as
select o.*,
       st.name as style_name,
       coalesce(nullif(o.price_charged, 0), p.final_price, 0) as price_per_set,
       round(coalesce(nullif(o.price_charged, 0), p.final_price, 0) * o.qty * (1 - o.discount_pct / 100), 3) as order_total,
       round(coalesce(nullif(o.price_charged, 0), p.final_price, 0) * o.qty * (1 - o.discount_pct / 100) - o.deposit, 3) as balance_due,
       round(coalesce(p.full_cost, 0) * o.qty, 3) as cost_of_goods,
       round(coalesce(nullif(o.price_charged, 0), p.final_price, 0) * o.qty * (1 - o.discount_pct / 100)
             - coalesce(p.full_cost, 0) * o.qty, 3) as profit
from orders o
join styles st on st.id = o.style_id
left join v_style_pricing p on p.style_id = o.style_id;

create or replace view v_spend_by_category with (security_invoker = on) as
select c.name as category, c.kind, c.sort,
       coalesce(sum(e.amount), 0) as spent,
       count(e.id) as entries
from categories c
left join expenses e on e.category = c.name
group by c.name, c.kind, c.sort
order by spent desc, c.sort;

create or replace view v_summary with (security_invoker = on) as
with s as (select * from settings where id = 1),
ex as (select coalesce(sum(amount), 0) as spent from expenses),
o as (
  select coalesce(sum(order_total), 0) as revenue,
         coalesce(sum(deposit), 0) as collected,
         coalesce(sum(balance_due), 0) as owed,
         coalesce(sum(profit), 0) as profit,
         coalesce(sum(qty), 0) as sets_sold,
         count(*) as orders
  from v_orders where status <> 'Cancelled'
)
select s.budget,
       ex.spent,
       s.budget - ex.spent as budget_left,
       case when s.budget > 0 then round(ex.spent / s.budget, 4) else 0 end as budget_used,
       o.revenue, o.collected, o.owed, o.profit, o.sets_sold, o.orders,
       o.revenue - ex.spent as net_position,
       case when o.sets_sold > 0 then round(o.profit / o.sets_sold, 3) else 0 end as avg_profit_per_set,
       case when o.sets_sold > 0 and o.profit > 0
            then greatest(0, ceil((ex.spent - o.revenue) / (o.profit / o.sets_sold))) end as sets_to_break_even
from s, ex, o;

-- =====================================================================
-- SECURITY: only people listed in `members` can read or change anything
-- =====================================================================
alter table members         enable row level security;
alter table settings        enable row level security;
alter table styles          enable row level security;
alter table categories      enable row level security;
alter table expenses        enable row level security;
alter table price_overrides enable row level security;
alter table orders          enable row level security;
alter table phases          enable row level security;
alter table tasks           enable row level security;
alter table expos           enable row level security;
alter table checklist       enable row level security;
alter table suppliers       enable row level security;
alter table ig_posts        enable row level security;
alter table activity        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','styles','categories','expenses','price_overrides','orders','phases','tasks','expos','checklist','suppliers','ig_posts','activity'] loop
    execute format('drop policy if exists members_all on %I', t);
    execute format('create policy members_all on %I for all to authenticated using (is_member()) with check (is_member())', t);
  end loop;
  execute 'drop policy if exists members_read on members';
  execute 'create policy members_read on members for select to authenticated using (is_member())';
end $$;

-- Live updates: when one of you changes something, the other's screen refreshes.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['expenses','orders','settings','price_overrides','tasks','expos','checklist','suppliers','ig_posts','activity'] loop
      begin execute format('alter publication supabase_realtime add table %I', t);
      exception when duplicate_object then null; end;
    end loop;
  end if;
end $$;

-- =====================================================================
-- LAST STEP: add both of you (change the emails, then run these lines)
-- =====================================================================
-- insert into members (email, name) values
--   ('you@example.com', 'Sara'),
--   ('partner@example.com', 'Partner')
-- on conflict (email) do nothing;
