# Carbonytics — Specialist-Review Deployment Runbook

Goal: put Carbonytics on the public internet behind a clean HTTPS link so a small
panel of (non-technical) emission specialists can test the calculator's logic,
accuracy and scenario handling. They get a URL + a username/password — nothing to
install.

**Target setup (chosen for low cost + a final-product feel):**

| Piece | Choice |
|---|---|
| VM | Hetzner CX22 (2 vCPU / 4 GB, x86) — ~€4/mo |
| DNS | DuckDNS free subdomain → the VM's static IP |
| TLS | Let's Encrypt via certbot (free, auto-renewing) |
| Stack | `docker-compose.review.yml` (prod stack minus monitoring) |
| Accounts | pre-created, one isolated org per specialist; self-service signup CLOSED |
| Data | the verified dev factor library + categories, shipped as a PII-free seed |

Everything below is run **on the VM** unless it says "(dev machine)". The whole
review stack runs under the isolated compose project `carbonytics-review`.

---

## 0. One-time, on your dev machine — build the reference-data seed

The factor library + categories are not in git (they live in your dev database).
Export them to PII-free archives and ship them to the VM.

```bash
# (dev machine, dev stack up)
bash scripts/export-reference-data.sh          # writes seed/*.archive.gz (categories, factors, versions)
```

You'll `scp seed/` to the VM in step 5.

---

## 1. Provision the VM (Hetzner)

1. Create a Hetzner Cloud account → new project → **Add Server**:
   - Image: **Ubuntu 24.04**
   - Type: **CX22** (shared x86, 2 vCPU / 4 GB)
   - Add your **SSH key**; create.
2. Note the server's **public IPv4**.
3. SSH in: `ssh root@<ip>`.
4. Install Docker Engine + compose plugin:
   ```bash
   curl -fsSL https://get.docker.com | sh
   docker compose version    # confirm the plugin is present
   ```
5. (Optional but recommended) basic firewall:
   ```bash
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```

## 2. Point DuckDNS at the VM

1. Sign in at https://www.duckdns.org (GitHub/Google).
2. Create a subdomain, e.g. **`carbonytics`** → domain `carbonytics.duckdns.org`.
3. Set its **current ip** to the VM's public IPv4 (the box has a static IP, so
   this is a one-time set; no dynamic updater needed).
4. Confirm DNS resolves: `dig +short carbonytics.duckdns.org` → the VM IP.

## 3. Get the code + secrets onto the VM

```bash
git clone https://github.com/MohShalaby92/Carbonytics.git
cd Carbonytics
git checkout review-deploy            # (or master once this is merged)

cp .env.review.example .env.review
```

Edit `.env.review` and fill every `CHANGE_ME`:

- `JWT_SECRET`, `JWT_REFRESH_SECRET` → two DISTINCT `openssl rand -base64 48`
- `MONGO_*_PASSWORD`, `REDIS_PASSWORD` → URL-safe `openssl rand -hex 32`
  (keep the embedded copies in `MONGODB_URI` / `REDIS_URL` in sync)
- `CLIENT_URL=https://carbonytics.duckdns.org`

## 4. Issue the TLS certificate, then bring up the stack

```bash
# First do a STAGING dry-run (avoids the LE rate limit if something's off):
bash scripts/init-letsencrypt.sh carbonytics.duckdns.org you@example.com --staging
# If that succeeds, get the real (trusted) cert:
bash scripts/init-letsencrypt.sh carbonytics.duckdns.org you@example.com

# Build + start the full stack:
docker compose -p carbonytics-review -f docker-compose.review.yml up -d --build --wait
```

`init-letsencrypt.sh` bootstraps a throwaway self-signed cert so nginx can boot,
serves the ACME HTTP-01 challenge from the nginx webroot, gets the real cert and
installs it. The `certbot` service then auto-renews (~every 60 days) and the nginx
reload loop picks up renewed certs — no babysitting.

Smoke-check:
```bash
curl -s  -o /dev/null -w '%{http_code}\n' http://carbonytics.duckdns.org/health   # 301
curl -s  -o /dev/null -w '%{http_code}\n' https://carbonytics.duckdns.org/health   # 200 (trusted cert, no -k)
```

## 5. Seed the reference data (factor library + categories)

```bash
# copy the archives from your dev machine first, e.g. from the dev machine:
#   scp -r seed/ root@<vm>:/root/Carbonytics/seed/
bash scripts/import-reference-data.sh
```

Verify the library is live (≈1,343 factors visible, 23 categories):
```bash
# any seeded login works; or check the count after step 6
```

## 6. Create the specialist accounts

Self-service registration is **closed** on this instance, so create one account per
reviewer — each gets its own isolated organization (a private sandbox):

```bash
docker compose -p carbonytics-review -f docker-compose.review.yml exec backend \
  node dist/scripts/seedReviewAccounts.js \
    "Dr Jane Smith=jane@firm.com" \
    "Omar Hassan=omar@firm.com" \
    "Mona Said=mona@firm.com"
```

The script prints each generated password **once** — capture them (they're stored
only as a bcrypt hash). Hand each specialist:

- URL: `https://carbonytics.duckdns.org`
- their email + password

Use **`.com`** addresses (the email validator rejects the `.test` TLD).

## 7. Verify it end-to-end

```bash
TOK=$(curl -s -X POST https://carbonytics.duckdns.org/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@firm.com","password":"<printed>"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
# registration is closed:
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://carbonytics.duckdns.org/api/auth/register \
  -H 'Content-Type: application/json' -d '{}'                                  # 403
```

Then open the URL in a browser, log in, and confirm the calculator returns a value
(e.g. Purchased Electricity, 100 kWh → **45.80 kg CO₂e**, Egyptian default).

---

## Operating notes

- **Logs:** `docker compose -p carbonytics-review -f docker-compose.review.yml logs -f backend`
- **Backups:** the `backup` sidecar dumps the DB to `./backups` daily (30-day
  retention); restore with `scripts/restore-data.sh` if needed.
- **Re-seed reference data** (e.g. after importing new factors on dev): re-run
  step 0 + step 5; `import-reference-data.sh` replaces the collections and clears
  the API cache.
- **Add a reviewer later:** re-run step 6 with the new name=email (idempotent —
  existing accounts are skipped, not reset).
- **Tear down** (when the review ends):
  `docker compose -p carbonytics-review -f docker-compose.review.yml down -v`
- **Cost control:** a stopped Hetzner server still bills; **delete** it to stop
  charges. Snapshot first if you want to redeploy later.

## Security posture (already enforced)

- HTTPS only (HTTP 80 → 301), HSTS, TLS 1.2/1.3.
- Refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie; short-lived
  access tokens; weak JWT secrets refused at boot.
- Mongo least-privilege app user + Redis password; destructive Redis commands
  disabled.
- Public self-service registration disabled (`DISABLE_REGISTRATION=true`).
- Rate limiting, helmet, single-origin CORS, generic 5xx messages in prod.

Keep the URL semi-private (share only with the reviewers) and the `.env.review`
secrets off git.
