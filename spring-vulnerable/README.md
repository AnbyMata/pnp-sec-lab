# Mooncat Atelier — intentionally vulnerable Spring lab

Java 21, Spring Boot 4, Thymeleaf, MariaDB로 만든 로컬 웹 보안 실습 사이트입니다. 외부에 공개하지 말고 로컬 Docker 환경에서만 실행하세요.

## 실행

```powershell
cd spring-vulnerable
docker compose up -d --build
```

브라우저: `http://localhost:8082`

계정: `test` / `test1234`, `admin` / `P@ssw0rd`

포함된 취약 동작: SQL Injection, UNION/Blind SQLi, 반사형·저장형 XSS, CSRF 토큰 없는 상태 변경, 평문 비밀번호, 검증 없는 파일 업로드, SSRF, 상세 오류 노출.

초기화: `docker compose down -v`
