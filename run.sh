#!/usr/bin/env bash
# Start VITALIS: backend on 8001, frontend on 8000. Ctrl+C stops both.
set -e
cd "$(dirname "$0")"

if [ ! -x backend/.venv/bin/uvicorn ]; then
  echo "Setting up the backend virtualenv..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi
[ -f backend/.env ] || cp backend/.env.example backend/.env

# Free the ports if something was left running.
lsof -ti tcp:8001 | xargs kill -9 2>/dev/null || true
lsof -ti tcp:8000 | xargs kill -9 2>/dev/null || true

( cd backend && exec ../backend/.venv/bin/uvicorn app.main:app --reload --port 8001 ) &
BACKEND=$!
python3 -m http.server 8000 --bind 127.0.0.1 >/dev/null 2>&1 &
FRONTEND=$!
trap 'kill $BACKEND $FRONTEND 2>/dev/null' EXIT INT TERM

sleep 3
echo ""
echo "  VITALIS is running"
echo "  app      http://localhost:8000"
echo "  api docs http://localhost:8001/docs"
echo "  Ctrl+C to stop"
echo ""
wait
