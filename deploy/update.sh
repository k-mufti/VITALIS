#!/usr/bin/env bash
# Pull the latest main and restart the backend: bash /opt/vitalis/deploy/update.sh
set -euo pipefail
export GIT_SSH_COMMAND="ssh -i /etc/vitalis/deploy_key -o IdentitiesOnly=yes"
cd /opt/vitalis
sudo -E git checkout -- backend/data/cache   # the backend refreshes these itself
sudo -E git pull --ff-only
sudo backend/.venv/bin/pip install -q -r backend/requirements.txt
sudo chown -R www-data:www-data /opt/vitalis
sudo systemctl restart vitalis
sleep 4 && curl -fsS http://127.0.0.1:8001/api/health && echo "  <- updated and running"
