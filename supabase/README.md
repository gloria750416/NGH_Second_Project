# Supabase SQL

이 폴더는 현재 프로젝트에서 필요한 최소 DB 구조를 담고 있습니다.

- `schema.sql`: 처음 프로젝트를 세팅할 때 한 번에 넣는 전체 스키마
- `migrations/20260718170000_initial_admin_and_word_stats.sql`: Supabase CLI 마이그레이션용 파일
- `seeds/admin_user.example.sql`: 관리자 계정을 넣을 때 참고하는 예시 SQL

포함된 테이블:

- `public.admin_users`: 관리자 아이디, 비밀번호 해시, 활성화 여부, 마지막 로그인 시각
- `public.word_lookup_meta`: 전체 검색 수
- `public.word_stats`: 학생들이 자주 입력한 핵심 영어 단어와 검색 횟수

주의:

- `password_hash`에는 평문 비밀번호를 넣지 말고 현재 프로젝트의 해시 방식으로 만든 값을 넣어야 합니다.
- 관리자 관련 데이터는 브라우저에서 직접 다루지 말고 서버에서 `service_role` 또는 `secret` 키로만 접근하는 것이 안전합니다.
