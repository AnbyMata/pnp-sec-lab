# PNP Security Lab

PNP Security Lab은 Docker 기반의 로컬 웹 보안 교육·실습 플랫폼입니다. 학습 이론, 챌린지 보드, 플래그 채점 화면과 PHP·Python·Spring 실습 사이트를 제공합니다.

## Start locally

1. `.env.example`을 복사해 `.env`를 만들고 플래그 값을 설정합니다.
2. Docker Desktop을 실행합니다.
3. 프로젝트 루트에서 실행합니다.

```bash
docker compose up -d --build
```

- 학습 플랫폼: `http://localhost:8000`
- PHP 실습: `http://localhost:10001`
- Python 실습: `http://localhost:10002`
- Spring 실습: `http://localhost:10003`
- 도구 실험실(개발 전용): `http://localhost:8000/tools-lab.html`

## 실습 도구

챌린지 화면의 도구 탭: 요청 워크벤치, 인스펙터, 서버 로그, 공격자 서버, 쿼리 실험실, 터미널, 도구 안내. 챌린지별 opt-in 방식과 ctx 필드는 `docs/TOOLS.md` 참고.

추가 컨테이너 2개:

- `tools-proxy` — 워크벤치 요청을 허용 목록 URL로만 중계(포털 `/api/tools/request` 경유, 외부 네트워크 차단).
- `attacker` — 공격자 서버. 공개 포트 `127.0.0.1:10010`(저장 HTML 페이지 + `/cb/` 콜백, 루프백에만 게시), 관리 API는 컨테이너 내부 `8001`로 nginx `/api/attacker/` 경유만 가능(게시되지 않음). 공개 페이지는 포털과 다른 출처에서 실행되는 것이 보안 경계다.

도구 테스트: `bash tests/run-tools.sh`

## Test accounts

- 플랫폼: `test@pnp.local` / `pnp1234`
- Python 실습: `test` / `test1234`

## Included local challenges

- SQL Injection
- IDOR
- Path Traversal
- Reflected XSS
- SSRF

## Important

이 저장소는 **로컬 Docker 교육 환경 전용**입니다. 의도적으로 취약한 코드와 실습용 계정이 포함되어 있으므로, 인터넷에 공개 배포하거나 실제 서비스·네트워크를 대상으로 사용하면 안 됩니다. 실제 플래그는 `.env`에만 보관하며 Git에 커밋하지 않습니다.
