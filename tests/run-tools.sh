#!/usr/bin/env bash
# Runs every tool (W1~W10) test from the repo root; fails fast.
# Git Bash: bash tests/run-tools.sh
set -euo pipefail
cd "$(dirname "$0")/.."

run() {
  echo
  echo "=== $1 ==="
  shift
  "$@"
}

run "http-body unit tests" node tests/http-body.cjs
run "inspect-lib unit tests" node tests/inspect-lib.cjs
run "tools-proxy E2E" node tests/tools-proxy.cjs
run "attacker W8" node tests/attacker.cjs
run "server-events W6" node tests/server-events.cjs
run "tools-lab workbench E2E" node tests/tools-lab.cjs

echo
echo "PASS all tool tests"
