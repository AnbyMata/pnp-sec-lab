window.theoryCatalog = [
  { id: 'sql-injection', name: 'SQL Injection', category: 'server', sub: 'SQL 쿼리와 사용자 입력' },
  { id: 'path-traversal', name: 'Path traversal', category: 'server', sub: '파일 경로와 접근 경계' },
  { id: 'authentication', name: 'Authentication vulnerabilities', category: 'server', sub: '인증 과정의 취약점' },
  { id: 'file-upload', name: 'File upload vulnerabilities', category: 'server', sub: '파일 업로드와 검증' },
  { id: 'ssrf', name: 'SSRF', category: 'server', sub: '서버 측 요청과 접근' },
  { id: 'nosql-injection', name: 'NoSQL Injection', category: 'server', sub: 'NoSQL 쿼리와 사용자 입력' },
  { id: 'csrf', name: 'CSRF', category: 'client', sub: '사용자의 의도와 다른 요청' },
  { id: 'cors', name: 'CORS', category: 'client', sub: '교차 출처 요청과 접근 정책' },
  { id: 'api-testing', name: 'API testing', category: 'api', sub: 'API의 동작과 보안 점검' },
  { id: 'graphql', name: 'GraphQL API vulnerabilities', category: 'api', sub: 'GraphQL API의 취약점' },
  { id: 'race-conditions', name: 'Race conditions', category: 'api', sub: '동시 요청과 처리 순서' }
].map((lesson) => ({ ...lesson, types: (lesson.id === 'sql-injection' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2]).map((episode) => [lesson.id === 'sql-injection' ? ['EP.1 - SQL Injection 개념과 탐지', 'EP.2 - SQL 조건 조작과 인증 우회', 'EP.3 - UNION SQL Injection 기초', 'EP.4 - UNION을 이용한 데이터 추출', 'EP.5 - DB 구조와 정보 수집', 'EP.6 - Blind SQL Injection', 'EP.7 - Error-based / Time-based SQLi', 'EP.8 - OAST와 특수 SQLi', 'EP.9 - SQL Injection 방어'][episode - 1] : `EP.${episode} - ${lesson.name} (${episode})`, lesson.id === 'sql-injection' && episode <= 4 ? '' : '내용 준비 중입니다.']) }));

