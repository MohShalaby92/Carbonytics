# Carbonytics — Session Handoff Document

**Date:** 2026-06-10 · **Branch:** `remediation` @ `0d88dce` (16 commits ahead of `master`; master untouched) · **Author of prior work:** Claude Code sessions with MohShalaby92

**Purpose:** complete continuation context for a new session. Read this top-to-bottom before changing anything. Companion artifacts: `docs/ENTERPRISE_GAP_ANALYSIS.md` (requirement-by-requirement status + per-increment addenda §14–§19), the git log (detailed commit messages), and `ENTERPRISE_REQUIREMENTS_REPORT.md` on the user's Desktop (the master spec; implementation follows its priority order P0 → P1 → P2).

---

## 1. Product & non-negotiable policies

Carbonytics is a multi-tenant carbon-accounting platform (GHG Protocol Scopes 1/2/3) for the **Egyptian market**, targeting enterprise credibility (sellable, audit-ready). Three personas: enterprise sustainability teams, consultants, SMEs.

**Policies locked in by the user — do not regress:**
1. **Egyptian emission factors are the PRIMARY DEFAULT** — auto-selection tier order: Egyptian shared → org custom → global → other regions; factor dropdowns list Egyptian first (preselected). Users may override by explicitly selecting any factor or manually entering custom factors. Egyptian factors must never be removed from selection.
2. **Never fabricate factor values.** Imports come only from the user's official files with exact unit conversions; CO₂-only sources are flagged CO₂-only; CH₄/N₂O are never invented.
3. **No GWP double-application:** factors with per-gas masses go through per-gas × org GWP set (`gwpApplied: 'per-gas'`); CO₂e-denominated factors are used as-is (`'embedded'`). DEFRA's "kg CO2e of CH4" rows are GWP-weighted CO₂e — never import them as gas masses.
4. **Estimates stay distinguishable** (`isEstimate`, method string, quality low, DQ 5). Gaps are never silently filled or dropped.
5. **Locked calculations are immutable** (model-level guards), restatements only via audited unlock → re-lock (snapshot per lock).
6. Docker storage must live on the KINGSTON drive (D:), never C: (C: has ~18 GB free).

## 2. Environment (verified working)

- **Stack:** `docker compose up -d` → Mongo 7 + Redis 7.2 + backend (Node20/Express/TS, port 5000) + frontend (Vite/React 19 build behind nginx). App at **http://localhost:8080** (single origin; nginx proxies `/api`). Docker disk image: `D:\HP_Elitebook\DockerData\DockerDesktopWSL`.
- **Login:** `demo@carbonytics.com` / `Demo!2026Pass`. Auth = in-memory access token (15m) + httpOnly refresh cookie; first page load fires one 401 refresh (normal).
- **Local installs:** repo is an npm-workspaces monorepo but built per-package — always `npm install --no-workspaces` inside `backend/` / `frontend/` (workspace mode breaks with EISDIR symlink errors).
- **Dev preview:** `.claude/launch.json` defines `carbonytics-frontend` (Vite on :3000 proxying to the Docker backend :5000).
- **After reseeding/imports:** `docker compose exec -T redis redis-cli FLUSHALL` (categories/factors are cached 30–60 min).
- **Local compose env:** `RATE_LIMIT_MAX=1000` (default 100/15min trips during normal interactive use).
- Backend rebuild cycle used throughout: local `tsc --noEmit` gate → `docker compose up -d --build backend` → verify via API with PowerShell `Invoke-RestMethod` (login → bearer header).

## 3. What exists and works (all verified end-to-end)

**Phase 0 (pre-enterprise):** full security overhaul (separate JWT secrets, revocable refresh tokens in Redis, rotation, login throttling, httpOnly cookie contract), CRA→Vite migration, Verdant light/Console dark design system, working dashboard (real data, timeframes verified), calculator (category→form→factor picker→live result→save), CSV **and** XLSX import (exceljs on upload path), CSV export (UTF-8 BOM), targets feature, facilities-of-test-data cleaned. Commits `dfdb6d8`…`556d103`.

**Enterprise increments (each with gap-analysis addendum + verification evidence in commit messages):**
| Inc | Commit | Delivered |
|---|---|---|
| P0-1 | `4e839f4` | GWP sets AR4/AR5/AR6 (org `settings.gwpSet`, default AR6, instant switch), per-gas engine path, per-entry provenance (factorId/name/source/year/gwpSet/gwpApplied/method), append-only AuditLog + `GET /api/organizations/audit-log`, calculation lock/unlock + model-level immutability, exclusions register, factor-vintage staleness warnings |
| P0-2 | `158148b` | `consolidationApproach` on Organization; Facility model + CRUD + `Calculation.facilityId` + filtering; **Scope 2 dual reporting** (scope2Location/Market/MarketMethod per electricity entry; supplier-specific rung → grid-average fallback documented for Egypt); vintage-aware tiered factor selection; fixed cross-tenant factor leaks |
| P0-3 | `8cc121a` | Egyptian-default policy (tier flip + dropdown order); 15th Scope 3 category (Cat 5 Waste); `GET /api/reports/ghg-inventory` (JSON + `?format=markdown` download) |
| P0-4 | `00ffa82` | **726 DEFRA 2024 factors** via `scripts/importFactorLibrary.ts` (CO₂e rows only); dropdown merges Egyptian-first + library |
| P0-5 | `122313f` | **EPA Hub 2025 Table 10**: 24 true per-gas factors via `scripts/importEpaHub.ts` (AR6 18.56 vs AR5 18.55 verified); CalculationSnapshot per lock + `GET /:id/snapshots[/diff]`; `GET /api/reports/assurance-package` |
| P0-6 | `9838691` | **IPCC EFDB Global: 216** canonical 2006-default per-gas factors + **GHGP cross-sector: 33** (5 national grids) via `scripts/importEfdbGhgp.ts` |
| P0-7 | `0d88dce` | Conservative gap-filling (`POST /api/calculations/estimate`: prior-year → adjacent-period, +10% uplift) + PCAF-style `dqScore` 1–5 per entry + weighted-DQ/estimate-share in reports |

**Factor library: ~1,027 factors** (4 Egyptian + 19 baselines + 726 DEFRA + 24 EPA + 216 EFDB + 33 GHGP + QA/customs). Import commands (all idempotent, non-destructive):
```
docker compose cp "<file>.xlsx" backend:/tmp/x.xlsx
docker compose exec -T backend node dist/scripts/importFactorLibrary.js /tmp/x.xlsx     # DEFRA FlatFormat
docker compose exec -T backend node dist/scripts/importEpaHub.js /tmp/x.xlsx            # EPA Hub (Table 10)
docker compose exec -T backend node dist/scripts/importEfdbGhgp.js efdb /tmp/x.xlsx Global
docker compose exec -T backend node dist/scripts/importEfdbGhgp.js ghgp /tmp/x.xlsx
```
Source files live at `C:\Users\Shalaby\Desktop\ALX\Carbonytics_ ALX_Graduation_Project\Data\`.

## 4. Failed attempts & gotchas (do not re-trip)

1. **exceljs cannot open the user's factor workbooks** ("end of central directory") even though they're valid zips → use SheetJS (`xlsx`) in scripts (trusted local files only; uploads keep exceljs).
2. **Mongoose `timestamps` injects `$set.updatedAt` AND `$setOnInsert.createdAt` into every query update** — query-hook predicates (lock guards) must tolerate both; this silently blocked unlock until debugged by printing `getUpdate()` inside the hook.
3. **IPCC 2006 category notation is dotted** (`1.A.1`) vs 1996 `1A1` — normalize dots before matching.
4. **EFDB "default" detection:** Description text varies per gas (CO₂ rows don't say "Default") — filter on **Technical Reference containing "2006 IPCC Guidelines"** (216 rows per gas, perfectly balanced).
5. **EFDB USA export yields 0 defaults by design** (country studies, not guideline defaults) — needs an explicit curation policy before importing; do not guess.
6. **EPA Hub is one stacked sheet** (591 rows, 12 embedded tables, merged headers) — locate tables by title row, then their header row. Remaining tables use imperial energy units (mmBtu/scf/short ton) → blocked on the §2.1 energy-basis unit work; eGRID subregions deferred (US-specific).
7. **GHGP electricity table titles vary per country** — country order comes from the sheet name (CN, TW, BR, TH, UK), not title parsing. A stale `GHGP_GRID__CHINESE` duplicate from a bad first parse was deleted.
8. **`.lean()` responses expose `_id`, not `id`** — controllers add `id` via `withId` mappers; tests must read the right field (one false-negative wasted a cycle).
9. **PowerShell: embedded double quotes inside `git commit -m @'…'@` here-strings break argument parsing** → keep commit messages quote-free. Also `&` in URLs needs backtick-escaping; node scripts via stdin (`$js | docker compose exec -T backend node -`) avoid quoting hell; node module resolution is script-location-relative (run temp scripts from `backend/`).
10. **Redis cache must be flushed after any seed/import**, and the rate limiter resets on backend recreate.
11. `seedBasicData` is **destructive** (deleteMany) — never run against the live DB; use targeted insert scripts (pattern exists in git history for Cat 5).
12. recharts width(-1) warnings → fixed via `initialDimension` + `ChartContainer`; recharts pinned ^3.8.
13. `.gitignore` traps fixed earlier: bare `public`, `.dockerignore`, lockfiles — per-package lockfiles are committed; Dockerfiles still use `npm install` (switch to `npm ci` is an open nicety).

## 5. Current goal state (report order) — what's left

**Phase 1 (P0): essentially complete.** Every P0 section has a working implementation or documented deferral. Honest partials: per-inventory-year GWP locking (needs an inventory/reporting-year object), factor version history (edits overwrite), HHV/LHV+imperial unit engine, relevance-screening workflow (exclusions register covers justification), completeness gates.

**The Compliance UI pass is DONE (P0-8, 2026-06-12 — see gap analysis §20):** calculator estimate suggestion + DQ/provenance/dual-Scope-2 display, dashboard weighted-DQ + estimate-share + lock/unlock + facility filter, new `/compliance` page (reports & exports with inventory preview, exclusions editor, facilities manager, snapshots + restatement diffs, audit-trail viewer), Settings → Organization → Methodology (GWP set + consolidation approach), full frontend types + `complianceService` (`frontend/src/services/complianceService.ts`). All verified in-browser against the live backend; production image rebuilt.

**P1-1 is DONE (2026-06-13 — see gap analysis §21):** denominator series + intensity metrics in the GHG report (`PUT /api/organizations/denominators`, Compliance → Intensity & Denominators tab), the estimation intensity-proxy rung (rung 3, denominator-scaled, +10% uplift), and IMP auto-generation (`GET /api/reports/imp`, download card on Compliance → Reports; documents the rounding policy). All verified with hand-computed values + in-browser.

**IMMEDIATE NEXT STEP — report order continues (P1):** supplier data module → completeness dashboard/gates → SSO/verifier roles → CDP/SBTi mapping exports → remaining factor tables (EPA imperial + eGRID; EFDB-USA policy) → instrument registry (RECs/PPAs — only when expanding beyond Egypt) → PDF report rendering (currently markdown/JSON) → evidence attachments per data line.

## 6. Known cosmetic/test debris (safe to clean)

- Demo DB contains QA artifacts: test calculations ("QA …" titles), QA custom factors ("QA per-gas fuel", "Supplier-specific grid mix", "QA steam 2020/2023"), one facility ("Cairo HQ"), one exclusion, one target, audit/snapshot history. Useful as demo data; wipe selectively if presenting.
- `docs/ENTERPRISE_GAP_ANALYSIS.md` has mixed encoding artifacts in early sections (mojibake emoji) from Windows-1252/UTF-8 round-trips — content is accurate; re-encode if it bothers anyone.
- Mongoose duplicate-index warnings (`email`, `factorCode`) are harmless and pre-existing.

## 7. Outside-the-code action items (user-owned)

1. 🔴 **Rotate the GitHub PAT embedded in the git remote URL** (`.git/config`) — treat as compromised; do not push until rotated, then rewrite the remote (credential manager or SSH).
2. `docker-compose.prod.yml` was never aligned with the new env contract (JWT pair, COOKIE_SECURE, Vite build) — required before any real deploy, along with HTTPS and real secrets.
3. Consider `npm ci` in Dockerfiles now that lockfiles are committed.

## 8. Verification pattern for the new session (smoke test)

```powershell
$base='http://localhost:8080'
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{email='demo@carbonytics.com';password='Demo!2026Pass'}|ConvertTo-Json)
$H=@{Authorization="Bearer $($login.data.accessToken)"}
(Invoke-RestMethod "$base/api/emission-factors?limit=1" -Headers $H).pagination.total       # ≈1027
(Invoke-RestMethod "$base/api/reports/ghg-inventory?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.dataQuality
# Egyptian default check: calculate electricity without factorId → factor.region must be 'egypt'
```
Standard increment workflow used throughout (keep it): plan tasks → implement → local `tsc` gate → rebuild backend image → API verification with hand-computed expected values → commit (quote-free message) → gap-analysis addendum → report implemented-vs-differed.
