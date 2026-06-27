#!/usr/bin/env sh
# Certbot deploy-hook — runs ONLY after a successful (re)issuance/renewal.
#
# Certbot sets $RENEWED_LINEAGE to the live directory of the renewed certificate
# (/etc/letsencrypt/live/<domain>). We copy the renewed cert to where the edge
# nginx reads it (/etc/nginx/ssl, a shared mount); nginx's periodic reload loop
# then serves the new cert. Copying (rather than referencing the live path in
# nginx.conf) keeps nginx.conf domain-agnostic, so the same config works for any
# DuckDNS / custom hostname without edits.
set -eu

cp "$RENEWED_LINEAGE/fullchain.pem" /etc/nginx/ssl/fullchain.pem
cp "$RENEWED_LINEAGE/privkey.pem"   /etc/nginx/ssl/privkey.pem
echo "deploy-hook: installed renewed cert from $RENEWED_LINEAGE into /etc/nginx/ssl"
