#!/usr/bin/env bash
# First-issuance bootstrap for the specialist-review stack's Let's Encrypt cert.
#
# Solves the chicken-and-egg (nginx won't start without a cert; certbot's HTTP-01
# challenge needs nginx serving :80):
#   1) write a throwaway self-signed cert so nginx can boot,
#   2) start nginx (serves the ACME webroot on :80),
#   3) ask certbot for the real cert via the webroot challenge,
#   4) copy it where nginx reads it and reload.
# After this, the `certbot` service in the compose file auto-renews (~every 60d).
#
# Usage (on the VM, from the repo root):
#   bash scripts/init-letsencrypt.sh <hostname> <email> [--staging]
#   e.g. bash scripts/init-letsencrypt.sh carbonytics.duckdns.org you@example.com
#
# Use --staging first to dry-run against Let's Encrypt's staging CA (avoids the
# real rate limit); re-run without it once the staging issuance succeeds.
#
# Prereqs: DNS A-record for <hostname> already points at this VM's public IP,
# ports 80+443 reachable, and .env.review is filled in.
set -euo pipefail

DOMAIN="${1:?usage: init-letsencrypt.sh <hostname> <email> [--staging]}"
EMAIL="${2:?usage: init-letsencrypt.sh <hostname> <email> [--staging]}"
STAGING="${3:-}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -p carbonytics-review -f docker-compose.review.yml)

echo "==> 1/5  Bootstrap self-signed cert so nginx can start"
bash scripts/gen-self-signed-cert.sh "$DOMAIN"
mkdir -p certbot/www certbot/conf

echo "==> 2/5  Start nginx (and its dependencies)"
"${COMPOSE[@]}" up -d nginx

echo "==> 3/5  Wait for the HTTP listener on :80"
for _ in $(seq 1 30); do
  # A 301 (->https) on / is a healthy sign the :80 server is up; -f tolerates 3xx.
  if curl -fsS -o /dev/null "http://localhost/" 2>/dev/null; then break; fi
  sleep 2
done

echo "==> 4/5  Request the Let's Encrypt certificate (webroot challenge)"
STAGING_FLAG=""
[ "${STAGING}" = "--staging" ] && STAGING_FLAG="--staging"
# shellcheck disable=SC2086
"${COMPOSE[@]}" run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email \
  --non-interactive --force-renewal $STAGING_FLAG

echo "==> 5/5  Install the cert where nginx reads it, then reload"
"${COMPOSE[@]}" run --rm --entrypoint sh certbot -c \
  "cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/nginx/ssl/fullchain.pem && \
   cp /etc/letsencrypt/live/$DOMAIN/privkey.pem  /etc/nginx/ssl/privkey.pem"
"${COMPOSE[@]}" exec nginx nginx -s reload || "${COMPOSE[@]}" restart nginx

echo
echo "Done. https://$DOMAIN should now present a valid certificate"
[ -n "$STAGING_FLAG" ] && echo "(STAGING cert — browsers will still warn; re-run WITHOUT --staging for a trusted cert)."
echo "Now bring up the full stack:  ${COMPOSE[*]} up -d --build"
