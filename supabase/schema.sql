-- המשכן – מסד הנתונים המקוון (Supabase / Postgres).
-- להרצה פעם אחת: Supabase ← SQL Editor ← New query ← להדביק את כל הקובץ ← Run.
-- אפשר להריץ שוב בבטחה (idempotent).
--
-- אבטחה: כל טבלה מוגנת ב-Row Level Security. המפתח הציבורי (anon key) שבאפליקציה
-- מאפשר רק את מה שהמדיניות כאן מתירה: כל אחד רואה את טבלת השיאים ואת השמות,
-- ורק את השמירות שלו. כתיבה – רק לשורות של המשתמש עצמו.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- פרופילים
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_name_unique on public.profiles (lower(display_name));
alter table public.profiles enable row level security;

drop policy if exists "profiles readable by all" on public.profiles;
create policy "profiles readable by all" on public.profiles for select using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- שמירות בענן
create table if not exists public.cloud_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot text not null check (char_length(slot) between 1 and 40),
  name text not null check (char_length(name) <= 60),
  player text not null check (char_length(player) <= 40),
  week int not null check (week >= 0),
  game_date text not null default '',
  career_id text not null default '',
  data text not null check (char_length(data) < 4000000), -- base64 של JSON דחוס (gzip)
  gz boolean not null default true,
  bytes int not null default 0,
  client_version text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, slot)
);
alter table public.cloud_saves enable row level security;

drop policy if exists "saves own only" on public.cloud_saves;
create policy "saves own only" on public.cloud_saves for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- עד 12 שמירות למשתמש
create or replace function public.limit_cloud_saves() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.cloud_saves where user_id = new.user_id and slot <> new.slot) >= 12 then
    raise exception 'too many cloud saves (max 12)';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists cloud_saves_limit on public.cloud_saves;
create trigger cloud_saves_limit before insert or update on public.cloud_saves
  for each row execute function public.limit_cloud_saves();

-- ---------------------------------------------------------------- טבלת השיאים
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  career_id text not null check (char_length(career_id) between 4 and 60),
  player_name text not null check (char_length(player_name) between 1 and 40),
  total int not null check (total between 0 and 1000),
  peak int not null check (peak between 0 and 100),
  impact int not null check (impact between 0 and 100),
  country int not null check (country between 0 and 100),
  standing int not null check (standing between 0 and 100),
  peak_label text not null default '' check (char_length(peak_label) <= 40),
  ending text not null default '' check (char_length(ending) <= 40),
  years numeric(5, 1) not null default 0 check (years >= 0 and years < 500),
  laws int not null default 0 check (laws between 0 and 1000),
  pm_week int check (pm_week is null or pm_week >= 0),
  scenario text not null default '' check (char_length(scenario) <= 40),
  challenge text check (challenge is null or char_length(challenge) <= 40),
  edited boolean not null default false,
  client_version text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, career_id)
);
create index if not exists scores_total on public.scores (edited, total desc);
create index if not exists scores_challenge on public.scores (challenge, total desc);
alter table public.scores enable row level security;

drop policy if exists "scores readable by all" on public.scores;
create policy "scores readable by all" on public.scores for select using (true);
drop policy if exists "scores insert own" on public.scores;
create policy "scores insert own" on public.scores for insert with check (user_id = auth.uid());
drop policy if exists "scores update own" on public.scores;
create policy "scores update own" on public.scores for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "scores delete own" on public.scores;
create policy "scores delete own" on public.scores for delete using (user_id = auth.uid());

-- טבלת השיאים עם שם התצוגה של המשתמש
create or replace view public.leaderboard with (security_invoker = true) as
  select s.id, s.user_id, coalesce(p.display_name, 'אנונימי') as display_name, s.player_name, s.total, s.peak, s.impact,
         s.country, s.standing, s.peak_label, s.ending, s.years, s.laws, s.pm_week, s.scenario, s.challenge, s.edited, s.created_at
  from public.scores s left join public.profiles p on p.id = s.user_id;

-- ---------------------------------------------------------------- מחיקת חשבון
-- חובה בחנות של גוגל: משתמש/ת יכול/ה למחוק את החשבון ואת כל הנתונים מתוך האפליקציה.
create or replace function public.delete_my_account() returns void
  language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid(); -- cascade: profiles, cloud_saves, scores
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

grant select on public.leaderboard to anon, authenticated;
grant select on public.profiles, public.scores to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.cloud_saves, public.scores to authenticated;
