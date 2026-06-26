#!/usr/bin/env bash
# Generate a self-signed TLS certificate for LOCAL / STAGING use into nginx/ssl/.
#
# Usage:   ./scripts/gen-self-signed-cert.sh [common-name]   (default: localhost)
#
# Files are named fullchain.pem + privkey.pem to match Let's Encrypt, so a real
# CA cert is a drop-in replacement for production (point certbot at nginx/ssl or
# copy its live/<domain>/{fullchain,privkey}.pem here, then reload nginx).
#
# Uses an openssl config file rather than -subj/-addext: it produces a proper
# SAN cert AND avoids MSYS (Git Bash on Windows) mangling a leading-slash
# `-subj "/CN=..."` into a filesystem path.
set -euo pipefail

CN="${1:-localhost}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nginx/ssl"
mkdir -p "$DIR"

if [ -f "$DIR/fullchain.pem" ] && [ -f "$DIR/privkey.pem" ]; then
  echo "Certs already present in $DIR -- delete them to regenerate. Skipping."
  exit 0
fi

CFG="$(mktemp)"
cat > "$CFG" <<EOF
[req]
distinguished_name = dn
x509_extensions    = v3
prompt             = no
[dn]
CN = ${CN}
[v3]
subjectAltName   = DNS:${CN},DNS:localhost,IP:127.0.0.1
basicConstraints = critical, CA:FALSE
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DIR/privkey.pem" \
  -out    "$DIR/fullchain.pem" \
  -config "$CFG"

rm -f "$CFG"
chmod 600 "$DIR/privkey.pem" 2>/dev/null || true
echo "Self-signed cert written to $DIR (CN=${CN}, 365 days)."
echo "NOTE: self-signed -> browsers/curl will warn; use a real CA cert in production."
