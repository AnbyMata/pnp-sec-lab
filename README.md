# PNP Security Lab

PNP Security Lab은 Docker 기반의 웹 보안 교육·실습 플랫폼입니다. 학습 이론, 챌린지 보드, 플래그 채점 화면과 PHP·Python·Spring 실습 사이트를 제공합니다. 기본 실행 방식은 로그인한 사용자를 위한 시간제 개인 실습 환경(관리형 모드)입니다.

시간제 개인 실습 환경(1시간·연장·자동 삭제)의 실행 및 VPS 연결 방법: [개인 실습 환경 가이드](docs/MANAGED-LABS.md).

## Start locally

1. `.env.example`을 복사해 `.env`를 만들고 플래그 값을 설정합니다.
2. Docker Desktop을 실행합니다.
3. 프로젝트 루트에서 실행합니다.

```bash
# Build personal lab images first (Linux example)
PNP_SESSION_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa PNP_DB_ROOT_PASSWORD=build-only-placeholder docker compose --env-file .env -f hub/session.compose.yml build db python php spring shell gateway
PNP_SESSION_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa PNP_DB_ROOT_PASSWORD=build-only-placeholder docker compose --env-file .env -f hub/session.compose.yml pull mongo
docker compose up -d --build nginx manager
```

- 학습 플랫폼: `http://localhost:8000`
- 공용 PHP 실습(레거시 모드): `http://localhost:10001`
- 공용 Python 실습(레거시 모드): `http://localhost:10002`
- 공용 Spring 실습(레거시 모드): `http://localhost:10003`
- 도구 실험실(개발 전용): `http://localhost:8000/tools-lab.html`

위 시작 명령은 포털과 manager만 실행합니다. 개인 실습 주소는 로그인 후 챌린지에서 `실습 시작`을 눌렀을 때 생성됩니다. `10001~10003` 공용 주소는 기본 관리형 실행에서는 열리지 않으며, 기존 공용 방식을 따로 실행할 때만 사용합니다. 공용 방식 전환은 [가이드](docs/MANAGED-LABS.md#로컬-실행)를 참고하세요. 관리형·공용은 환경 할당 방식의 구분이며 PHP·Python·Spring 선택과는 별개입니다.

## 실습 도구

챌린지 화면의 도구 탭: 요청 워크벤치, 인스펙터, 서버 로그, 공격자 서버, 쿼리 실험실, 터미널, 도구 안내. 챌린지별 opt-in 방식과 ctx 필드는 `docs/TOOLS.md` 참고.

기존 공용 모드에서 사용하는 추가 컨테이너 2개(기본 관리형 모드에는 실행하지 않음):

- `tools-proxy` — 워크벤치 요청을 허용 목록 URL로만 중계(포털 `/api/tools/request` 경유, 외부 네트워크 차단).
- `attacker` — 공격자 서버. 공개 포트 `127.0.0.1:10010`(저장 HTML 페이지 + `/cb/` 콜백, 루프백에만 게시), 관리 API는 컨테이너 내부 `8001`로 nginx `/api/attacker/` 경유만 가능(게시되지 않음). 공개 페이지는 포털과 다른 출처에서 실행되는 것이 보안 경계다.

도구 테스트: `bash tests/run-tools.sh`

관리형 모드에서는 개인 환경에 연결된 도구만 제공하며 요청 워크벤치·공격자 서버는 비활성화합니다. 자세한 범위는 [개인 환경 도구 연결](docs/MANAGED-LABS.md#소유권과-도구-연결-범위)을 참고하세요.

## Accounts

- 플랫폼은 회원가입 화면에서 계정을 생성합니다. 서버 계정 DB를 사용하며 기본 테스트 계정은 자동 생성하지 않습니다.
- 공용 Python 실습(레거시 모드): `test` / `test1234`

## 관리형 챌린지 (현재 제공)

챌린지 목차와 문제별 레시피에 연결된 챌린지는 다음 6개입니다. 최종 플래그·채점은 Python에서 제공하며 PHP·Spring은 비교 실습용입니다.

| 챌린지 | ID |
|---|---|
| SQL Injection 로그인 우회 | `sqli-login` |
| Path Traversal | `path-traversal` |
| 인증 복구 | `auth-recovery` |
| 파일 업로드 필터 우회 | `upload-filter` |
| SSRF | `ssrf-oracle` |
| NoSQL Injection | `nosql-login` |

사이트의 페이지·메뉴·기능은 공통으로 유지합니다. 시작 지점은 문제별로 다르고, 선택한 문제의 고정 플래그만 활성화합니다.

## 기존 공용 사이트의 실습 기능

초기 공용 Python 사이트에는 SQL Injection·IDOR·Path Traversal·Reflected XSS·SSRF 실습 기능이 포함되어 있습니다. 이는 현재 관리형 챌린지 목록과 다릅니다. 특히 IDOR와 Reflected XSS는 관리형 목차·레시피에 연결되지 않아 해당 플래그가 활성화되지 않으며, 현재 제공하는 관리형 챌린지 수에 포함하지 않습니다. 공통 사이트에 기능이 보이는 것과 챌린지 플래그·채점 지원은 별개입니다.

## Important

의도적으로 취약한 코드와 실습용 계정이 포함된 교육 플랫폼입니다. 공용 실습 컨테이너를 인터넷에 직접 공개하지 마세요. 시간제 개인 환경의 VPS 연결과 계정 인증 등 공개 운영 전 필요한 사항은 `docs/MANAGED-LABS.md`를 확인하세요. 실제 플래그는 `.env`에만 보관하며 Git에 커밋하지 않습니다.
