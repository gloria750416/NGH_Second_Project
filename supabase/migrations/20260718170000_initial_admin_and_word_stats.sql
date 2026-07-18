create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_login_at timestamptz,
  constraint admin_users_username_key unique (username),
  constraint admin_users_password_hash_length_check check (char_length(password_hash) >= 20)
);

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row
execute function public.set_updated_at();

create table if not exists public.word_lookup_meta (
  id boolean primary key default true,
  total_searches integer not null default 0,
  updated_at timestamptz
);

insert into public.word_lookup_meta (id, total_searches, updated_at)
values (true, 0, null)
on conflict (id) do nothing;

create table if not exists public.word_stats (
  word text primary key,
  count integer not null default 0,
  last_searched_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint word_stats_word_length_check check (char_length(trim(word)) > 0),
  constraint word_stats_word_lowercase_check check (word = lower(word))
);

create index if not exists word_stats_count_desc_idx
  on public.word_stats (count desc, last_searched_at desc, word asc);

drop trigger if exists word_stats_set_updated_at on public.word_stats;
create trigger word_stats_set_updated_at
before update on public.word_stats
for each row
execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.word_lookup_meta enable row level security;
alter table public.word_stats enable row level security;

drop policy if exists "service role can manage admin_users" on public.admin_users;
create policy "service role can manage admin_users"
on public.admin_users
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage word_lookup_meta" on public.word_lookup_meta;
create policy "service role can manage word_lookup_meta"
on public.word_lookup_meta
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage word_stats" on public.word_stats;
create policy "service role can manage word_stats"
on public.word_stats
for all
to service_role
using (true)
with check (true);

comment on table public.admin_users is '관리자 계정 정보 저장';
comment on table public.word_lookup_meta is '전체 검색 횟수와 마지막 갱신 시각 저장';
comment on table public.word_stats is '학생들이 자주 입력한 핵심 영어 단어 통계 저장';
