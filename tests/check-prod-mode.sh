#!/usr/bin/env bash
# Checks that PNP_MODE=prod disables shell/SQL/service control and the query log
# on the server side, then restores dev mode (always, even on failure).
# Run from the repo root with Git Bash: bash tests/check-prod-mode.sh
set -u
cd "$(dirname "$0")/.."
fail=0
restore() { PNP_MODE=dev docker compose up -d manager python attacker >/dev/null 2>&1; }
trap restore EXIT

post() { curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://localhost:8000' \
  -H 'Content-Type: application/json' -d "$2" "http://localhost:8000$1"; }
expect() { # name got want
  if [ "$2" = "$3" ]; then echo "ok   $1 ($2)"; else echo "FAIL $1: got $2, want $3"; fail=1; fi
}
wait_for() { for _ in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$1")" != "000" ] && return; sleep 1; done; }

PNP_MODE=prod docker compose up -d manager python attacker >/dev/null 2>&1
wait_for http://localhost:8000/api/config; sleep 3
expect "prod /api/shell"   "$(post /api/shell   '{"command":"echo hi"}')" 403
expect "prod /api/sql"     "$(post /api/sql     '{"database":"WebTest","sql":"select 1"}')" 403
expect "prod /api/service" "$(post /api/service '{"service":"php","action":"start"}')" 403
expect "prod querylog"     "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/api/lab/querylog)" 404
expect "prod /lab/echo"    "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:10002/lab/echo)" 404
expect "prod attacker pub" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:10010/cb/abcdefghijklmnop/x)" 404
expect "prod attacker adm" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Origin: http://localhost:8000' 'http://localhost:8000/api/attacker/pages?sid=abcdefghijklmnop')" 404
expect "prod cfg attacker" "$(curl -s http://localhost:8000/api/config | grep -c '"attacker": false')" 1

PNP_MODE=dev docker compose up -d manager python attacker >/dev/null 2>&1
wait_for http://localhost:8000/api/config; sleep 3
# attacker (and python) can take a few more seconds to answer through nginx on a loaded machine
for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' 'http://localhost:8000/api/attacker/pages?sid=abcdefghijklmnop')" = 200 ] && break; sleep 1; done
expect "dev /api/shell"    "$(post /api/shell   '{"command":"echo hi"}')" 200
expect "dev querylog"      "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/api/lab/querylog)" 200
expect "dev /lab/echo"     "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:10002/lab/echo)" 200
expect "dev attacker adm"  "$(curl -s -o /dev/null -w '%{http_code}' 'http://localhost:8000/api/attacker/pages?sid=abcdefghijklmnop')" 200
expect "dev attacker cb"   "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS http://127.0.0.1:10010/cb/abcdefghijklmnop/x)" 204

[ "$fail" = 0 ] && echo "PASS prod-mode checks" || { echo "FAIL prod-mode checks"; exit 1; }
