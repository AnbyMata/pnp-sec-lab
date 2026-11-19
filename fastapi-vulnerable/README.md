# Mooncat Atelier — intentionally vulnerable FastAPI lab

FastAPI, Jinja2, MariaDB로 만든 로컬 웹 보안 실습 사이트입니다. 외부에 공개하지 말고 로컬 Docker 환경에서만 실행하세요.

## 실행

```powershell
cd fastapi-vulnerable
docker compose up -d --build
```

브라우저: `http://localhost:8081`

기본 계정:

- `test` / `test1234`
- `admin` / `P@ssw0rd`

## 포함된 취약 동작

- 로그인, 검색, 게시글 조회·등록·삭제 및 프로필 변경 SQL Injection
- 반사형·저장형 XSS
- CSRF 토큰 없는 상태 변경
- 평문 비밀번호 저장과 약한 세션 비밀키
- 확장자·콘텐츠 검증 없는 파일 업로드
- URL 검증 없는 서버 측 요청

## 초기화

```powershell
docker compose down -v
```
