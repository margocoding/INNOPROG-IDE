#!/usr/bin/env bash
set -Eeuo pipefail

readonly REQUESTED_TARGET="${1:-/etc/nginx/sites-enabled/innoprog.conf}"
readonly TARGET="$(readlink -f -- "$REQUESTED_TARGET")"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly BACKUP="$(mktemp /tmp/innoprog-ide-nginx.XXXXXX)"

restore() {
  sudo install -o root -g root -m 0644 "$BACKUP" "$TARGET"
  sudo nginx -t
  sudo systemctl reload nginx
}

sudo cp -- "$TARGET" "$BACKUP"
sudo chown "$(id -u):$(id -g)" "$BACKUP"
if ! sudo python3 "$SCRIPT_DIR/patch_nginx_proxy_timeout.py" \
  --path "$TARGET" --server-name ide.innoprog.ru --location /bot-api/ --timeout 130s; then
  rm -f -- "$BACKUP"
  exit 1
fi
if ! sudo nginx -t || ! sudo systemctl reload nginx; then
  echo "nginx validation/reload failed; restoring previous config" >&2
  restore
  rm -f -- "$BACKUP"
  exit 1
fi
rm -f -- "$BACKUP"
echo "IDE host nginx code-runner timeout installed"
