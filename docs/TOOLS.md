# 실습 도구 가이드 (W1~W10)

챌린지 화면 오른쪽의 도구 탭은 `new_hub/challenge-data.js`의 챌린지 항목에서 `tools` 배열로 opt-in 한다. 선언한 도구만 탭으로 보이고, 나머지 ctx 필드는 해당 도구를 켰을 때의 초기값이다.

## 도구 목록과 opt-in

```js
tools: ['request-workbench', 'inspector', 'server-log', 'exploit-server', 'query-lab', 'terminal', 'tool-guide']
```

| key | 탭 이름 | 용도 |
| --- | --- | --- |
| `request-workbench` | 요청 워크벤치 | 실습 대상으로 향하는 HTTP 요청 편집기(메서드/헤더/본문 모드, 쿠키 jar, 이력·diff, 동시 전송). `tools-proxy` 컨테이너를 거쳐 허용 목록 URL로만 나간다 |
| `inspector` | 인스펙터 | URL·Base64·엔티티 변환, JWT 디코딩/alg:none/HS256 서명, URL 분해, 경로 해석. 네트워크 없이 동작 |
| `server-log` | 서버 로그 | `/lab/querylog`의 쿼리·파일·서버발 요청 이벤트 카드 |
| `exploit-server` | 공격자 서버 | `attacker` 컨테이너에 HTML 페이지를 올리고 `/cb/` 콜백을 받는다. `127.0.0.1:10010`(cross-site)/`localhost:10010`(same-site) 두 URL 제공 |
| `query-lab` | 쿼리 실험실 | 자리표시자가 쿼리 안에서 어떻게 보이는지 확인 |
| `terminal` | 터미널 | 격리된 실습 셸(읽기 전용, 재시작 시 초기화) |
| `tool-guide` | 도구 안내 | `ctx.toolGuide`의 단계별 안내 |

`toolGuide.steps[].tool`에는 위 key 외에 `browser`(실습 사이트 탭), `query-log`(구 서버 쿼리 로그)도 쓸 수 있다. 도구 안내 카드의 이름표는 `tool-guide.js`의 `TOOL_NAMES`에서 한글 탭 이름으로 매핑된다.

## 챌린지 ctx 필드

`challenge.js`는 챌린지 객체를 그대로 ctx로 넘긴다. 실제 reader와 필드명은 다음과 같다.

```js
{
  tools: ['terminal', 'tool-guide'],
  toolGuide: { summary: '…', steps: [{ tool: 'browser', label: '필수|권장|선택', when: '…', how: '…' }] },
  workbenchPresets: [{ name: 'Echo GET', method: 'GET', url: 'http://localhost:10002/lab/echo',
                        headers: [['Content-Type', 'text/plain']], body: '…',
                        bodyMode: 'raw|json|form|multipart', pairs: [['name','value']] }],
  inspectorDefaults: { base: '/var/www/files', input: 'report.txt' },          // 경로 해석 탭 초기값
  attackerTemplates: [{ name: 'demo-page', html: '<p>Demo</p>' }],              // 공격자 서버 템플릿(선택)
  logPaths: ['/lab/file', '/oracle'],   // server-log paths 필터; 없으면 전체
  logKinds: ['query'],                  // server-log kind 필터; 없으면 전체(query,file,http-out)
  queryTemplate: "SELECT * FROM member_modern WHERE user_id='{user_id}' AND password='{password}'",
  terminalChips: ['curl -s http://localhost:10002/health', '…']  // 터미널 위 명령 칩(문자열 배열)
}
```

- `queryTemplate`의 `{자리표시자}`는 쿼리 실험실에서 입력값이 끼어드는 위치다.
- `terminalChips`는 명령 문자열 배열이다(선언이 없으면 기본 예시 칩).
- `workbenchPresets`/`attackerTemplates`/`inspectorDefaults`/`logPaths`/`logKinds`는 모두 선택이며, 없으면 도구가 빈 입력·기본 필터로 동작한다.

## 도구 실험실

`http://localhost:8000/tools-lab.html` — 모든 도구를 샘플 ctx로 띄우는 개발 전용 페이지(포털 내비게이션에는 링크되지 않는다). 요청 워크벤치 프리셋의 기본 대상은 `http://localhost:10002/lab/echo` — method/body/헤더를 그대로 되돌려 주는 dev 전용 엔드포인트다.

## prod 동작

`PNP_MODE=prod`에서 꺼지는 것: 터미널(shell), 공격자 서버(공개 포트 404 + `/api/attacker/` 404 + config 플래그 false), `/lab/echo`(404), 쿼리/이벤트 로그 엔드포인트(404). 계속 켜져 있는 것: 요청 워크벤치(허용 목록 URL로만), 인스펙터(네트워크 없음), 쿼리 실험실, 도구 안내.

## 주제별 추천 조합

커리큘럼(Server-side / Client-side / API·서비스 로직) 11개 주제 기준이다. 모두 **추천**일 뿐이며, 챌린지가 확정되면 `tools`와 `toolGuide`로 실제 구성을 정한다.

| 분류 | 주제 | 추천 도구 |
| --- | --- | --- |
| Server-side | SQL Injection | 쿼리 실험실, 서버 로그, 터미널(반복·자동화), 요청 워크벤치(동시 전송으로 시간 측정) |
| Server-side | Path traversal | 인스펙터(경로 해석: 디코딩 횟수별 결과), 요청 워크벤치, 서버 로그(file 카드) |
| Server-side | Authentication vulnerabilities | 인스펙터(JWT), 요청 워크벤치(쿠키 jar, 반복·동시 전송), 터미널 |
| Server-side | File upload vulnerabilities | 요청 워크벤치(multipart: 파일명·Content-Type·매직바이트 위조), 서버 로그(file 카드) |
| Server-side | SSRF | 인스펙터(URL 분해), 요청 워크벤치, 서버 로그(http-out 카드), 공격자 서버(콜백 수신) |
| Server-side | NoSQL Injection | 요청 워크벤치(JSON 본문), 인스펙터(인코딩), 서버 로그 |
| Client-side | CSRF | 공격자 서버(cross-site 페이지), 요청 워크벤치(쿠키 jar) |
| Client-side | CORS | 공격자 서버(다른 출처 페이지·콜백), 요청 워크벤치(`Origin` 헤더 조작) |
| API·서비스 로직 | API testing | 요청 워크벤치(히스토리·diff), 인스펙터, 터미널 |
| API·서비스 로직 | GraphQL API vulnerabilities | 요청 워크벤치(JSON 본문 + 프리셋). 전용 탐색 UI는 챌린지 확정 후 |
| API·서비스 로직 | Race conditions | 요청 워크벤치(동시 전송), 서버 로그 |
