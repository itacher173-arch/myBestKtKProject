#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"
command -v python3 >/dev/null || { echo "Install Python 3.12 first"; exit 1; }
command -v npm >/dev/null || { echo "Install Node.js LTS first"; exit 1; }
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
cd apps/frontend
mkdir -p "$PROJECT_ROOT/.cache/npm"
npm ci --no-audit --no-fund --cache "$PROJECT_ROOT/.cache/npm"
npm run build
cd "$PROJECT_ROOT"
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
echo "Ready. Run scripts/start_linux.sh"
