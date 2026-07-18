# NGH_Second_Project

영어 문장·지문을 입력하면 의미 단위로 나누고, 문맥 뜻·전체 해석·문장별 해석·문법 분석까지 보여주는 학습 사이트입니다.  
관리자 페이지에서는 학생들이 많이 찾은 핵심 어휘 통계를 확인할 수 있습니다.

## 실행 방법

```bash
npm install
npm run dev
```

`npm run dev`를 실행하면 오래 남아 있던 개발 서버 포트를 먼저 정리한 뒤 Vite와 Express 서버를 함께 실행합니다.

- 학습 화면: `http://localhost:5173/`
- 관리자 화면: `http://localhost:5173/admin.html`
- 서버 직접 주소: `http://127.0.0.1:3000/`

## 프로덕션 실행

```bash
npm run build
npm start
```

## 현재 구현 기능

- 영어 문장 또는 짧은 지문 입력
- 입력 내용을 단어 1개씩이 아니라 의미 단위로 묶어서 분석
- `to be`, `decide to continue`, 구동사, 짧은 표현 묶음 같은 구조를 한 단위로 설명
- 각 의미 단위의 문맥 뜻과 간단한 설명 제공
- 지문 전체 해석 제공
- 문장별 해석 제공
- OpenAI 기반 문법 성분 분석
- 주어, 동사, 목적어/보어, 절 연결 방식, 문장 패턴, 학습 포인트 제공
- 문법 설명 시 실제 문장 속 표현을 예시로 들어 설명
- 관리자 로그인
- 관리자 전용 단어 통계 그래프와 상위 단어 목록
- 통계 백업 다운로드
- 통계 초기화
- 로그인 시도 제한 및 세션 만료 처리

## 관리자 통계 기준

관리자 페이지의 자주 나온 단어 통계는 아무 단어나 저장하지 않습니다.

- 관사, 대명사, 접속사, 전치사, 조동사, be동사류 같은 기능어는 제외
- 명사, 본동사, 형용사, 의미 있는 부사처럼 핵심 뜻이 있는 어휘 중심으로 저장
- 의미 단위 분석 결과에서 `statsWords`로 뽑힌 핵심 어휘만 통계에 반영

예를 들어 `the`, `a`, `to`, `and`, `although`, `be` 같은 단어보다 `weather`, `cold`, `decide`, `continue` 같은 어휘가 통계에 남도록 설계되어 있습니다.

## 환경 변수

예시는 [.env.example](C:/Users/PC/OneDrive/바탕 화면/pr/NGH_Second_Project/.env.example)에 있습니다.

- `PORT`: 서버 포트
- `ADMIN_USERNAME`: 관리자 아이디
- `ADMIN_PASSWORD`: 개발용 평문 비밀번호
- `ADMIN_PASSWORD_HASH`: 배포용 비밀번호 해시
- `OPENAI_API_KEY`: OpenAI API 키
- `OPENAI_MODEL`: 사용할 OpenAI 모델
- `DATA_DB_PATH`: SQLite DB 경로
- `ADMIN_SESSION_DURATION_MS`: 관리자 세션 유지 시간
- `ADMIN_LOGIN_WINDOW_MS`: 로그인 시도 집계 시간
- `ADMIN_LOGIN_BLOCK_MS`: 로그인 차단 시간
- `ADMIN_MAX_LOGIN_ATTEMPTS`: 허용 로그인 실패 횟수

## 관리자 비밀번호 해시 생성

```bash
npm run hash-password -- your-secure-password
```

생성된 값을 `.env`의 `ADMIN_PASSWORD_HASH`에 넣어 사용하면 됩니다.

## 테스트

```bash
npm test
```

현재 테스트는 아래를 확인합니다.

- 관리자 인증이 없으면 통계 접근 차단
- 단어 통계 저장/조회
- 기능어 제외 통계 처리
- 관리자 통계 초기화
- 문법 분석 응답 형식
- 의미 단위 분석 응답 형식

## Docker

관련 파일:

- [Dockerfile](C:/Users/PC/OneDrive/바탕 화면/pr/NGH_Second_Project/Dockerfile)
- [.dockerignore](C:/Users/PC/OneDrive/바탕 화면/pr/NGH_Second_Project/.dockerignore)

실행 예시:

```bash
docker build -t ngh-second-project .
docker run -p 3000:3000 ngh-second-project
```

## 주요 API

- `GET /api/health`
- `POST /api/word-lookups`
- `POST /api/word-explanations`
- `POST /api/grammar-analysis`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/stats`
- `GET /api/admin/export`
- `POST /api/admin/reset`
