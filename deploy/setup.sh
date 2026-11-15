#!/usr/bin/env bash
# One-time setup of VITALIS on the kareemmuftee.com server (Ubuntu + nginx). Run as a sudo user:
#   bash setup.sh
# The repo is private: the first run makes a read-only deploy key and stops so it can be added on
# GitHub (repo Settings > Deploy keys). Run it again after that.
set -euo pipefail
REPO=git@github.com:k-mufti/VITALIS.git
KEY=/etc/vitalis/deploy_key
export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

sudo apt-get update -y
sudo apt-get install -y git python3 python3-venv curl

if ! sudo test -f "$KEY"; then
  sudo mkdir -p /etc/vitalis
  sudo ssh-keygen -q -t ed25519 -N "" -C "vitalis-server" -f "$KEY"
  echo
  echo "Add this key on GitHub: k-mufti/VITALIS > Settings > Deploy keys > Add (read-only):"
  sudo cat "$KEY.pub"
  echo "Then run: bash setup.sh"
  exit 0
fi

if [ ! -d /opt/vitalis ]; then sudo -E git -c safe.directory=/opt/vitalis clone "$REPO" /opt/vitalis; fi
sudo -E git -c safe.directory=/opt/vitalis -C /opt/vitalis checkout -- backend/data/cache 2>/dev/null || true
sudo -E git -c safe.directory=/opt/vitalis -C /opt/vitalis pull --ff-only

cd /opt/vitalis/backend
sudo python3 -m venv .venv
sudo .venv/bin/pip install -q -r requirements.txt
if [ ! -f .env ]; then sudo cp .env.example .env; fi
sudo chown -R www-data:www-data /opt/vitalis

sudo cp /opt/vitalis/deploy/vitalis.service /etc/systemd/system/vitalis.service
sudo cp /opt/vitalis/deploy/vitalis-http.conf /etc/nginx/conf.d/vitalis-http.conf
sudo systemctl daemon-reload
sudo systemctl enable --now vitalis
sudo systemctl restart vitalis
sleep 4
curl -fsS http://127.0.0.1:8001/api/health && echo "  <- backend is up"

echo
echo "Next: paste /opt/vitalis/deploy/nginx-vitalis.conf into the kareemmuftee.com server block"
echo "(the file in /etc/nginx/sites-enabled/ with 'listen 443'), then: sudo nginx -t && sudo systemctl reload nginx"
