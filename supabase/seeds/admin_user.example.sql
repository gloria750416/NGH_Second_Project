-- 1. 아래 명령으로 비밀번호 해시를 먼저 만듭니다.
--    npm run hash-password -- na070529!
--
-- 2. 생성된 해시를 아래 REPLACE_WITH_PASSWORD_HASH 자리에 넣습니다.

insert into public.admin_users (
  username,
  password_hash,
  display_name,
  is_active
)
values (
  '나건후',
  'REPLACE_WITH_PASSWORD_HASH',
  '나건후',
  true
)
on conflict (username) do update
set
  password_hash = excluded.password_hash,
  display_name = excluded.display_name,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());
