## Docker를 기반으로한 로컬 실습 환경

## 테스트 계정
- 아이디 : test
- 비밀번호 : test1234

## 점검 결과 (2026-11-12)

- [x] SQL Injection — 취약점 확인: 로그인, 게시판 검색, 게시글 조회에서 총 10개 비파괴성 입력이 모두 성공했습니다. 상세: `reports/sqli-before.json`
- [x] XSS — 취약점 확인: 게시판 검색어가 HTML 인코딩 없이 반사됩니다.
- [x] CSRF — 취약점 확인: 로그인한 세션에서 닉네임 변경 엔드포인트가 CSRF 토큰 없이 GET 요청을 수락합니다.
- [x] SSRF — 현재 미확인: PHP 소스에서 외부 URL 요청 기능을 찾지 못했습니다.

상세 결과와 재현 근거는 `reports/attack-assessment.html`에 기록했습니다.
수업용 자료는 `reports/security-training-guide.html`에 있습니다.

## 추가 항목
- [x] UNION SQLi — 취약점 확인: 게시글 조회의 합집합 탐침(V3)이 합성 제목을 반환했습니다.
- [x] Blind SQLi — 취약점 확인: 게시글 조회의 참·거짓 조건 탐침(V1)이 서로 다른 결과를 반환했습니다.
- [x] OWASP Top 10 — 최신 정식판(2025) 기준 점검 완료. 상세: `reports/owasp-top10-assessment.html`
