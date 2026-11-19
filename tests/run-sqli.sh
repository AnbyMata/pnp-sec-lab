#!/usr/bin/env bash
# Fail-fast runner for the SQLi learning-path tests.
# Requires the docker compose stack (portal on :8000, python lab on :10002).
set -euo pipefail
cd "$(dirname "$0")/.."

run() {
  echo
  echo "=== $1 ==="
  shift
  "$@"
}

run "SQL tokenizer unit tests" node tests/sql-tokenizer.cjs
run "sqli-login challenge E2E" node tests/sqli-challenge.cjs
run "sqli querylog filters" node tests/sqli-querylog.cjs

echo
echo "PASS all SQLi tests"
