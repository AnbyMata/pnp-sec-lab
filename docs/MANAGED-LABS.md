# 개인별 시간제 실습 환경

챌린지 화면에서 `실습 시작`을 누르면 각 버전의 사이트 전체 기능을 공통으로 제공하고, 선택한 문제의 고정 플래그만 활성화한다. PHP·Python·Spring 중 선택한 웹 서버 하나만 실행하며, 버전 전환 시 이전 환경을 삭제한 뒤 선택한 버전을 생성한다. DB 볼륨, 업로드 파일, 컨테이너 네트워크는 환경마다 분리된다. VM이 아닌 Docker 기반이다.

현재 관리형 목차·레시피·플래그 채점에 연결된 문제는 `sqli-login`, `path-traversal`, `auth-recovery`, `upload-filter`, `ssrf-oracle`, `nosql-login`의 6개다. IDOR·Reflected XSS는 기존 공용 사이트의 실습 기능으로, 관리형 챌린지로 등록되어 있지 않으며 관리형 환경에서 해당 플래그는 비활성화된다. 기능 페이지는 공통 사이트에 남아 있어도 별도의 해결 기록은 제공하지 않는다. 관리형/공용은 환경 생성 방식의 구분이고 PHP·Python·Spring은 각 방식에서 선택하는 웹 구현 버전이다.

- 해당 문제 환경의 준비를 시작한 시각부터 1시간 유지한다. 이전 환경 삭제를 기다리는 동안에는 새 환경의 시간이 차감되지 않는다.
- `1시간 연장`은 현재 만료 시각에 최대 3,600초를 추가한다. 총 실습 시간은 환경 준비 시작부터 최대 2시간이며 한도에 도달하면 더 연장할 수 없다.
- `실습 종료` 또는 만료 시 즉시 신규 접속을 차단하고, 컨테이너·DB 볼륨·개인 네트워크를 삭제한다. 정리 작업은 10초 주기로 실행되며 Docker 오류 시 재시도한다. 처리 중이던 HTTP 요청은 최대 30초 내 끝날 수 있다.
- 새로고침, 챌린지 이동, 창 닫기는 시간을 초기화하지 않는다. 같은 챌린지·같은 버전은 기존 환경을 재사용한다. 버전이 바뀌면 데이터를 유지하지 않고 새 1시간 환경으로 전환한다. 다른 챌린지에서 시작을 누르면 이전 환경을 삭제한 뒤 새 문제용 환경을 생성한다. 사용자당 실행 환경은 하나다.
- 생성과 삭제는 별도의 제한된 백그라운드 작업으로 실행한다. 기본 동시 생성 2개(`PNP_CREATE_WORKERS`), 동시 삭제 2개(`PNP_CLEANUP_WORKERS`)이며 느린 생성이 다른 환경 정리를 막지 않는다. 같은 환경의 생성과 삭제는 겹치지 않으며 생성 중 종료한 환경은 생성 작업이 반환된 뒤 삭제한다. 생성 명령은 최대 240초로 제한된다. 같은 사용자의 새 환경은 이전 환경 삭제 완료 후 시작한다. 삭제 실패는 다음 정리 주기에 재시도한다.
- 쿠키를 삭제하거나 다른 브라우저를 사용하면 다른 소유자로 취급한다. 기존 환경은 원래 만료 시각에 정리된다.
- 문제 ID, 생성 구성, 상태와 만료 시각은 manager의 `lab_sessions` 볼륨에 SQLite로 보관한다. manager 재시작 시 준비 중이던 환경과 구버전의 문제 ID 없는 환경과 페이지 제한 방식의 환경은 정리하고, 실행 중 환경의 기한은 유지한다. **실습 실행 중 이 볼륨을 삭제하지 않는다.**

## 로컬 실행

프로젝트 루트에서 `.env.example`을 `.env`로 복사하고 모든 플래그 값을 설정한다. Docker Compose의 관리형 실습 기본값은 `true`이다.

실습 이미지를 먼저 빌드한다. 다음은 PowerShell 예시다(빌드용 ID는 비밀값이 아니다).

```powershell
$env:PNP_SESSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$env:PNP_DB_ROOT_PASSWORD = 'build-only-placeholder'
docker compose --env-file .env -f hub/session.compose.yml build db python php spring shell gateway
docker compose --env-file .env -f hub/session.compose.yml pull mongo
docker compose up -d --build nginx manager
```

Linux에서는 빌드·pull 명령에 `PNP_SESSION_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa PNP_DB_ROOT_PASSWORD=build-only-placeholder` 환경변수를 붙인다. 이 값들은 이미지 준비용이며 실행 시에는 manager가 실제 파생 비밀값을 전달한다. MariaDB/MongoDB/nginx 기반 이미지도 실행 호스트에서 사용할 수 있어야 한다. 실습 시작 시 `up --no-build --wait`로 생성하므로 사용자 요청 중 이미지를 빌드하지 않는다.

`http://localhost:8000`에 접속한 뒤 챌린지의 `실습 시작`을 누른다. 실습은 `http://python-<임의ID>.labs.localhost:8000` 등의 별도 출처에서 열린다. 브라우저가 `*.localhost`를 루프백으로 해석해야 한다.

기존 공용 로컬 실습과 기존 E2E 테스트를 사용하려면 `.env`에 `PNP_MANAGED_LABS=false`를 지정하고 `docker compose up -d --build`로 실행한다. 이때는 기존 `localhost:10001~10003` 주소를 사용하며 시간제 기능은 표시되지 않는다.

## 설정

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PNP_MANAGED_LABS` | `true` (Compose) | 개인 환경 활성화 |
| `PNP_MAX_SESSIONS` | `5` | 준비·실행·삭제 대기를 포함한 최대 사용자 수 |
| `PNP_LAB_DOMAIN` | `labs.localhost` | 실습 호스트의 접미 도메인 |
| `PNP_LAB_SCHEME` | `http` | 실습 링크의 스킴 |
| `PNP_LAB_PORT` | `8000` | 실습 공개 포트. HTTPS 443이면 **빈 값** 지정 |
| `PNP_COOKIE_SECURE` | `false` | HTTPS 배포 시 `true` |
| `PNP_ORIGINS` | 로컬 포털 2개 | 변경 요청을 허용할 포털 Origin, 쉼표 구분 |
| `PNP_INGRESS_NETWORK` | `pnp-lab-ingress` | manager와 실습 게이트웨이 연결 네트워크 |

문제별 실행 구성과 메모리 상한 합계는 다음과 같다(실사용량과 다름).

| 챌린지 | 실행 서비스 | 개수 | 메모리 상한 합계 |
|---|---|---|---|
| SQL Injection (Python) | Python, MariaDB, MongoDB, 셸, 게이트웨이 | 5 | 1344MiB |
| 그 외 챌린지 (Python) | Python, MariaDB, MongoDB, 게이트웨이 | 4 | 1216MiB |
| PHP 비교 실습 | PHP, MariaDB, 게이트웨이 | 3 | 768MiB |
| Spring 비교 실습 | Spring, MariaDB, 게이트웨이 | 3 | 1088MiB |

`PNP_MODE=prod`의 SQL Injection은 셸을 제외하므로 4개, 1216MiB다. 문제별 레시피는 `hub/manager/recipes.py`에서 관리한다. Python에는 해당 문제의 고정 플래그만 주입한다. 페이지·메뉴·기능은 챌린지와 관계없이 동일하게 유지하며, 비활성 플래그는 HTML·주석·파일·API 응답에 표시하지 않는다. 다른 문제의 플래그 채점만 차단한다. 전체 기능을 제공하므로 모든 Python 환경에 MariaDB와 MongoDB가 필요하다. 기존처럼 챌린지 전용 문제와 최종 플래그 채점은 Python에서 제공하며 PHP·Spring은 기존 사이트를 비교 실습하는 용도다. PHP·Spring 실행 중에는 Python 채점·쿼리 로그·터미널 요청을 차단한다.

 동시 환경 수는 서버 메모리와 CPU에 맞춰 조정한다. 최대 환경 수를 초과하면 시작 요청은 429로 응답한다. 서비스별 CPU·메모리·프로세스 제한은 `hub/session.compose.yml`에 있다.

## VPS 배포 연결

예시 설정:

```dotenv
PNP_MANAGED_LABS=true
PNP_ORIGINS=https://portal.example.com
PNP_LAB_DOMAIN=labs.example.net
PNP_LAB_SCHEME=https
PNP_LAB_PORT=
PNP_COOKIE_SECURE=true
PNP_MAX_SESSIONS=2
```

1. 포털 DNS와 `*.labs.example.net` 와일드카드 DNS를 VPS로 연결한다. 실습에는 포털과 **등록 도메인이 다른 도메인**을 사용해 취약한 실습 코드가 포털 쿠키에 영향을 주지 않도록 한다.
2. 외부 리버스 프록시에서 포털과 실습 와일드카드 모두에 HTTPS를 적용하고, `127.0.0.1:8000`으로 전달한다. **원래 Host 헤더를 보존**한다 (`proxy_set_header Host $http_host;`). lab 주소는 스킴 설정으로 HTTPS를 유지한다.
3. 위의 실습 이미지 빌드 후 `docker compose up -d --build nginx manager`만 실행한다. 공용 php/python/spring/db 및 공용 도구 서비스는 관리형 운영에 필요하지 않다. Docker 소켓과 manager 포트는 외부에 공개하지 않는다.
4. 실습 시작·연장·종료, 재시작 후 기한 유지, 만료 시 접속 410 및 환경 삭제를 실제 도메인에서 확인한다.

별도 출처 iframe에서도 로그인할 수 있도록 HTTPS 실습 응답의 세션 쿠키에 `Secure; SameSite=None; Partitioned`를 적용한다(로컬 `*.localhost`도 적용). 브라우저가 임베디드 쿠키를 차단하면 `새 탭으로 열기`를 사용한다. Partitioned 쿠키는 임베디드 화면과 새 탭에서 별도 로그인 상태를 가질 수 있다.

현재 구현은 **단일 Docker 호스트**를 관리한다. 포털과 실습을 서로 다른 VPS에서 운영하려면 Docker 실행과 게이트웨이를 전용 실습 호스트로 분리하는 추가 구성이 필요하다. 컨테이너는 VM과 커널을 분리하지 않으므로, 실습 호스트에 실제 서비스 데이터나 다른 중요 서비스를 함께 두지 않는다.

## 소유권과 도구 연결 범위

MariaDB root 비밀번호는 서버 비밀키와 `db-root:<세션 ID>`의 HMAC-SHA256으로 파생한다. URL의 세션 ID 및 웹 앱의 세션 서명키와 다른 값이며, DB 컨테이너에만 전달한다. 기존 URL 기반 비밀번호 환경은 revision 3 전환 시 정리하고 새 실습으로 생성한다. 웹 앱은 기존 제한 계정인 mooncat으로 접속하므로 연결 정보는 바뀌지 않는다.

인증 실패 제한은 최근 15분간 같은 IP·아이디·동작 조합 10회, 같은 IP·동작 전체 100회다. 로그인과 가입은 별도 집계하며 성공은 실패 횟수에 포함하지 않는다. 성공하면 해당 조합의 이전 실패를 지운다. 아이디 전체 잠금은 없으므로 다른 IP에서 동일 아이디로 로그인할 수 있다. 같은 NAT 공인 IP를 공유하는 사용자는 IP 전체 한도를 공유한다. 기존 attempts 테이블의 공용 제한 기록은 더 이상 사용하지 않는다.

Compose의 `PNP_AUTH_PROXY_HOST=nginx`는 Docker DNS로 조회한 nginx 주소에서 온 요청에만 `X-Pnp-Client-IP`를 허용한다. nginx는 이 값을 `$remote_addr`로 덮어쓴다. manager를 직접 노출하지 않으며 클라이언트가 보낸 X-Forwarded-For는 인증 IP로 사용하지 않는다. nginx 앞에 외부 프록시가 있다면 nginx의 `set_real_ip_from`에 실제 프록시 주소만 지정하고 `real_ip_header`를 설정하여 `$remote_addr`를 복원해야 한다. 임의의 인터넷 주소나 모든 사설망을 신뢰 대상으로 지정하지 않는다. 설정하지 않으면 외부 프록시 IP로 집계되므로 VPS 배포 때 필수 확인한다.

포털 신규 가입은 로그인 아이디·닉네임·비밀번호와 현장에서 배부한 1회용 가입 코드가 있어야 가능하다. 관리자는 관리자 화면의 현장 가입 코드에서 발급·폐기한다. 기본 유효기간은 7일이며 발급 시 1~30일로 지정할 수 있다. 코드가 없거나 만료·사용·폐기된 경우 서버에서 가입을 거절한다. 계정 생성과 코드 사용 처리는 하나의 DB 트랜잭션으로 실행한다. 원문은 발급 응답에서 한 번만 제공하며 DB에는 해시만 보관한다. 이메일 주소·SMTP·이메일 인증은 제거했다. 비밀번호 재설정은 아직 제공하지 않는다.

비밀번호는 사용자별 salt와 PBKDF2-SHA256으로 저장하며 로그인 쿠키는 `HttpOnly; SameSite=Strict`이고 7일 후 만료된다. 로그아웃하면 서버 세션을 삭제한다. 계정 DB는 manager의 기존 영속 볼륨 내 `/state/accounts.sqlite`에 저장된다. 이 볼륨을 삭제하면 계정도 삭제되므로 백업 대상에 포함한다.

### 로그인 아이디 전환

아이디는 영문·숫자·밑줄·점·하이픈 3~32자이며 대소문자를 구분하지 않는다. 기존 이메일 계정은 @ 앞부분을 로그인 아이디로 변환하며 중복 시 숫자 접미사를 붙인다. 내부 계정 ID·비밀번호·권한·학습 기록은 유지한다. users의 email 컬럼과 이메일 인증 테이블·키 및 이전 제한 기록은 제거한다. 새 가입은 현장 코드가 필수다.

실습 소유권은 서버가 확인한 계정 ID로 결정한다. 같은 계정으로 다른 브라우저에서 로그인해도 기존 실습을 조회하며, 로그아웃 후에도 실습은 원래 만료 시각까지 유지된다. 기존 익명 실습은 새 계정에 자동 이전하지 않고 만료 시 정리된다. 실습 URL 자체는 추측하기 어려운 접속 토큰이므로 공유하면 만료 전 접속할 수 있다.

학습·챌린지 완료 기록은 계정 DB의 progress 테이블에 저장한다. `/api/progress`는 본인의 공개 에피소드 시작·완료·취소만 허용하며 챌린지 해결 기록은 서버의 정답 응답을 확인한 프록시에서 기록한다. 기존 브라우저 기록은 순위로 가져오지 않는다. 대시보드는 로그인 사용자에게 닉네임·완료 수·공동 순위를 제공하며 아이디은 공개하지 않는다. 현재 공개 학습은 SQL Injection EP.1~4로 총 4개다. 콘텐츠를 공개할 때 `hub/manager/progress.py`의 LESSONS도 갱신한다. 학습 진도는 본인 완료 표시 기준이며 시험 성적이 아니다.

관리형 모드에서는 채점·쿼리 로그·터미널 요청이 소유자의 환경으로 연결된다. 기존 공용 Docker 제어·SQL 콘솔·공격자 서버·요청 워크벤치 API는 차단한다. 후자의 두 도구는 아직 개인 환경용 서비스와 연결하지 않았으므로 탭도 비활성화한다. 쿼리 미리보기와 도구 안내는 브라우저에서 동작한다. 기존 정책대로 `PNP_MODE=prod`에서는 셸과 서버 쿼리 로그를 사용할 수 없다.

실습 가상 호스트는 포털 API 처리보다 먼저 분기한다. 따라서 실습 호스트의 `/api/auth/*`, `/api/progress`, `/api/dashboard` 등도 원래 경로 그대로 실습 앱에 전달하며 포털 계정·진도 API는 포털 호스트에서 처리한다. 만료된 실습 호스트는 410으로 끝나고 포털로 넘어가지 않는다. 기존 공용 모드의 `/api/service`, `/api/shell`, `/api/sql`도 Origin 허용 목록으로 `PNP_ORIGINS`를 사용한다. 소유권은 계정 ID만 사용하며 이전 `pnp_lab_owner` 쿠키는 읽거나 발급하지 않는다.

## 관리자 계정과 회원 관리

기존 회원을 서버 콘솔에서 명시적으로 관리자로 지정한다. 첫 가입자를 자동 승격하지 않으며 가입 요청의 role 값도 신뢰하지 않는다.

```bash
docker compose exec -T manager python3 /admin.py your-username
```

다시 로그인하면 상단에 관리자 메뉴가 나타나며 `admin.html`에서 모든 회원의 학습·챌린지 완료 수·진도율·완료 항목을 확인한다. 공개된 SQL Injection EP.1~4와 관리형 챌린지 6개를 기준으로 집계한다. 닉네임·아이디 검색, 활성/정지/관리자 필터, 권한 변경, 계정 정지·해제·삭제를 지원한다. 정지 계정은 일반 순위에서 제외한다.

계정 관리 작업은 서버에서 관리자 권한과 Origin을 확인하고 변경 기록을 admin_events에 저장한다. 권한 변경 시 기존 로그인 세션을 취소하며 정지·삭제 시 실행 중 실습도 종료한다. 본인 계정의 정지·삭제·관리자 해제를 금지하여 마지막 관리자를 잃지 않도록 한다. 정지는 학습 기록을 보존하고 해제 후 재로그인할 수 있다. 삭제는 계정·로그인 세션·학습 기록을 영구 삭제하며 복구 기능은 없다. 비밀번호·비밀번호 해시는 관리자 API로 공개하지 않는다. 비밀번호 초기화와 아이디 수정은 현재 관리 기능에 포함하지 않는다.

## 테스트 명령

```bash
python -m unittest discover -s tests -p test_lab_sessions.py -v
node tests/lab-session-ui.cjs
```

플래그 단위 테스트: `python -m unittest discover -s tests -p test_challenge_flags.py -v`. 모든 플래그 환경변수가 존재해도 선택한 문제의 값만 활성화되는지 확인한다.

상태 테스트: 중복 시작·동시 요청, 소유권 분리, 정원 제한, 1시간 연장, 만료 즉시 차단, 삭제 실패 재시도, 재시작 복구, 생성 중 종료.

브라우저 테스트: 시작, 연장, 새로고침 시 유지, 대상 전환, 오류 복귀, 종료, 만료 화면. API는 모의 응답을 사용한다.

`tests/managed-lab-smoke.py`는 **별도 검증용 manager 안에서만** 실행한다. 실제 Docker 환경을 생성하고 여섯 문제별 실제 컨테이너 수, 환경 전환·재사용, 공통 페이지·기능 유지와 고정 플래그의 노출·채점 분리, 연장·만료·삭제를 확인한다. 테스트 DB의 기한을 직접 앞당기므로 운영 manager에서 실행하면 안 된다.

`node tests/managed-lab-browser.cjs`는 같은 검증용 스택(`localhost:18766`)에서 실제 Chrome iframe 로그인과 세션 쿠키 유지를 확인하며, 사용한 실습은 마지막에 종료한다.

`tests/managed-lab-versions.py`는 별도 검증 manager에서 PHP·Spring 전환, 실제 3개 컨테이너 구성, CSS, DB 연결, 재사용·시간 연장을 확인한다.

`node tests/managed-lab-versions-ui.cjs`는 같은 별도 스택에서 실제 Chrome의 PHP iframe 표시, Spring 전환, CSS와 새로고침 후 선택 버전 복원을 확인한다. Spring은 URL에 세션 ID를 붙여 CSS 경로가 바뀌지 않도록 쿠키 방식으로만 세션을 추적한다.
