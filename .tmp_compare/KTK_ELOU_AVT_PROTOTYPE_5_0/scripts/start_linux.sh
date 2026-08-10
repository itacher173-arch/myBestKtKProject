#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"
mkdir -p runtime
.venv/bin/python -m services.simulator.app >runtime/simulator.log 2>&1 & echo $! >runtime/simulator.pid
.venv/bin/python -m services.scenarios.app >runtime/scenarios.log 2>&1 & echo $! >runtime/scenarios.pid
.venv/bin/python -m services.training.app >runtime/training.log 2>&1 & echo $! >runtime/training.pid
.venv/bin/python -m services.knowledge.app >runtime/knowledge.log 2>&1 & echo $! >runtime/knowledge.pid
.venv/bin/python -m services.auth.app >runtime/auth.log 2>&1 & echo $! >runtime/auth.pid
.venv/bin/python -m services.ai.app >runtime/ai.log 2>&1 & echo $! >runtime/ai.pid
.venv/bin/python -m services.gateway.app >runtime/gateway.log 2>&1 & echo $! >runtime/gateway.pid
echo "Open http://127.0.0.1:8000"
