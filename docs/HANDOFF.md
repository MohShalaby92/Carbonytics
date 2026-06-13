# Carbonytics — Session Handoff Document

**Date:** 2026-06-13 · **Branch:** `remediation` @ `5b6b725` (18 commits ahead of `master`; master untouched) · **Author of prior work:** Claude Code sessions with MohShalaby92

**Purpose:** complete continuation context for a new session. Read this top-to-bottom before changing anything. Companion artifacts: `docs/ENTERPRISE_GAP_ANALYSIS.md` (requirement-by-requirement status + per-increment addenda §14–§21), the git log (detailed commit messages with verification evidence), and `ENTERPRISE_REQUIREMENTS_REPORT.md` on the user's Desktop (the master spec; implementation follows its priority order P0 → P1 → P2).

---

## 1. Product & non-negotiable policies

Carbonytics is a multi-tenant carbon-accounting platform (GHG Protocol Scopes 1/2/3) for the **Egyptian market**, targeting enterprise credibility (sellable, audit-ready). Three personas: enterprise sustainability teams, consultants, SMEs.

**Policies locked in by the user — do not regress:**
1. **Egyptian emission factors are the PRIMARY DEFAULT** — auto-selection tier order: Egyptian shared → org custom → global → other regions; factor dropdowns list Egyptian first (preselected). Users may override by explicitly selecting any factor or manually entering custom factors. Egyptian factors must never be removed from selection.
2. **Never fabricate factor values.** Imports come only from the user's official files with exact unit conversions; CO₂-only sources are flagged CO₂-only; CH₄/N₂O are never invented.
3. **No GWP double-application:** factors with per-gas masses go through per-gas × org GWP set (`gwpApplied: 'per-gas'`); CO₂e-denominated factors are used as-is (`'embedded'`). DEFRA's "kg CO2e of CH4" rows are GWP-weighted CO₂e — never import them as gas masses.
4. **Estimates stay distinguishable** (`isEstimate`, method string stored verbatim, quality low, DQ 5). Gaps are never silently filled or dropped; estimates are never chained off other estimates.
5. **Locked calculations are immutable** (model-level guards), restatements only via audited unlock → re-lock (snapshot version per lock).
6. Docker storage must live on the KINGSTON drive (D:), never C: (C: has ~18 GB free).

## 2. Environment (verified working)

- **Stack:** `docker compose up -d` → Mongo 7 + Redis 7.2 + backend (Node20/Express/TS, port 5000) + frontend (Vite/React 19 build behind nginx). App at **http://localhost:8080** (single origin; nginx proxies `/api`). Docker disk image: `D:\HP_Elitebook\DockerData\DockerDesktopWSL`.
- **Login:** `demo@carbonytics.com` / `Demo!2026Pass`. Auth = in-memory access token (15m) + httpOnly refresh cookie; first page load fires one 401 refresh (normal — also happens mid-session after 15m, the axios interceptor retries transparently).
- **Local installs:** repo is an npm-workspaces monorepo but built per-package — always `npm install --no-workspaces` inside `backend/` / `frontend/` (workspace mode breaks with EISDIR symlink errors).
- **TypeScript gate:** `npx tsc` is NOT available; run `node node_modules\typescript\bin\tsc --noEmit` inside each package.
- **Git on D: needs** `git config --global --add safe.directory D:/HP_Elitebook/Personal_Projects/Carbonytics/Code/Carbonytics` (drive records no ownership → "dubious ownership" fatal). Added 2026-06-12; re-add if the environment resets.
- **Dev preview:** `.claude/launch.json` defines `carbonytics-frontend` (Vite on :3000 proxying `/api` to the Docker backend :5000) — use it for in-browser verification before rebuilding the production image.
- **After reseeding/imports:** `docker compose exec -T redis redis-cli FLUSHALL` (categories/factors are cached 30–60 min).
- **Local compose env:** `RATE_LIMIT_MAX=1000` (default 100/15min trips during normal interactive use).
- **Increment workflow used throughout (keep it):** plan tasks → implement → local `tsc` gate per package → `docker compose up -d --build backend` (and/or `frontend`) → API verification with hand-computed expected values → in-browser verification via the dev preview → commit (quote-free message) → gap-analysis addendum → implemented-vs-differed report.

## 3. What exists and works (all verified end-to-end)

**Phase 0 (pre-enterprise):** full security overhaul (separate JWT secrets, revocable refresh tokens in Redis, rotation, login throttling, httpOnly cookie contract), CRA→Vite migration, Verdant light/Console dark design system, working dashboard (real data, timeframes verified), calculator (category→form→factor picker→live result→save), CSV **and** XLSX import (exceljs on upload path), CSV export (UTF-8 BOM), targets feature. Commits `dfdb6d8`…`556d103`.

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
| P0-8 | `ec7b951` | **Compliance UI pass** — everything enterprise exposed in the product: calculator Suggest-estimate button (fills value+unit, shows method/basis/uplift, flag cleared on manual edit, session summary mirrors server-forced low/DQ5) + PCAF DQ/GWP-provenance/dual-Scope-2 in the live result; dashboard weighted-DQ + estimate-share cards, status badges + audited lock/unlock buttons, facility filter; new **`/compliance` page** (tabs: Reports & Exports with inventory preview, Exclusions editor, Facilities manager, Snapshots & Restatements diff viewer, Audit Trail viewer admin-only); Settings → Organization → Methodology card (GWP set + consolidation pickers); full frontend types + `complianceService.ts` + `apiService.patch()` |
| P1-1 | `5b6b725` | **Intensity + IMP**: `Organization.denominators` (one per year+metric: production/revenue/employees/floor_area/custom; audited `PUT /api/organizations/denominators`, duplicates rejected); intensity section in GHG report (total ÷ each reporting-year denominator, 6 significant digits); **estimation rung 3 intensity-proxy** (3-yr lookback, scaled by denominator ratio, metric priority production>revenue>employees>floor_area>custom, +10% uplift, caution note past 2× ratio); `GET /api/reports/imp` (11-section Inventory Management Plan from live config — boundary, roles from real users, methodology incl. **rounding policy** (closes §2.1 partial), estimation policy, QA/QC, DQ rubric, factor counts, recalculation statement); Compliance "Intensity & Denominators" editor tab + IMP download card + intensity in preview |

**Factor library: ~1,027 factors** (4 Egyptian + 19 baselines + 726 DEFRA + 24 EPA + 216 EFDB + 33 GHGP + QA/customs). Import commands (all idempotent, non-destructive):
```
docker compose cp "<file>.xlsx" backend:/tmp/x.xlsx
docker compose exec -T backend node dist/scripts/importFactorLibrary.js /tmp/x.xlsx     # DEFRA FlatFormat
docker compose exec -T backend node dist/scripts/importEpaHub.js /tmp/x.xlsx            # EPA Hub (Table 10)
docker compose exec -T backend node dist/scripts/importEfdbGhgp.js efdb /tmp/x.xlsx Global
docker compose exec -T backend node dist/scripts/importEfdbGhgp.js ghgp /tmp/x.xlsx
```
Source files live at `C:\Users\Shalaby\Desktop\ALX\Carbonytics_ ALX_Graduation_Project\Data\`.

**Frontend map (for the compliance surface):** `frontend/src/pages/compliance/` — `CompliancePage.tsx` (tab shell) + `ReportsTab` (period pickers, GHG/assurance/IMP downloads, inventory preview) + `ExclusionsTab` + `FacilitiesTab` + `DenominatorsTab` + `SnapshotsTab` + `AuditLogTab`; services in `frontend/src/services/complianceService.ts`; enterprise types in `frontend/src/types/index.ts` (CalculationEntry provenance fields, Facility, AuditLogEntry, SnapshotMeta/Diff, EstimateSuggestion, Denominator).

## 4. Failed attempts & gotchas (do not re-trip)

1. **exceljs cannot open the user's factor workbooks** ("end of central directory") even though they're valid zips → use SheetJS (`xlsx`) in scripts (trusted local files only; uploads keep exceljs).
2. **Mongoose `timestamps` injects `$set.updatedAt` AND `$setOnInsert.createdAt` into every query update** — query-hook predicates (lock guards) must tolerate both; this silently blocked unlock until debugged by printing `getUpdate()` inside the hook.
3. **IPCC 2006 category notation is dotted** (`1.A.1`) vs 1996 `1A1` — normalize dots before matching.
4. **EFDB "default" detection:** Description text varies per gas (CO₂ rows don't say "Default") — filter on **Technical Reference containing "2006 IPCC Guidelines"** (216 rows per gas, perfectly balanced).
5. **EFDB USA export yields 0 defaults by design** (country studies, not guideline defaults) — needs an explicit curation policy before importing; do not guess.
6. **EPA Hub is one stacked sheet** (591 rows, 12 embedded tables, merged headers) — locate tables by title row, then their header row. Remaining tables use imperial energy units (mmBtu/scf/short ton) → blocked on the §2.1 energy-basis unit work; eGRID subregions deferred (US-specific).
7. **GHGP electricity table titles vary per country** — country order comes from the sheet name (CN, TW, BR, TH, UK), not title parsing.
8. **`.lean()` responses expose `_id`, not `id`** — controllers add `id` via mappers; tests must read the right field. Frontend defensively uses `calc.id || calc._id`.
9. **PowerShell: embedded double quotes inside `git commit -m @'…'@` here-strings break argument parsing** → keep commit messages quote-free. `&` in URLs needs backtick-escaping; node scripts via stdin avoid quoting hell; node module resolution is script-location-relative.
10. **Redis cache must be flushed after any seed/import**; the rate limiter resets on backend recreate.
11. **`seedBasicData` is destructive** (deleteMany) — never run against the live DB; use targeted insert scripts.
12. recharts width(-1) warnings → fixed via `initialDimension` + `ChartContainer`; recharts pinned ^3.8.
13. `.gitignore` traps fixed earlier: bare `public`, `.dockerignore`, lockfiles — per-package lockfiles are committed; Dockerfiles still use `npm install` (switch to `npm ci` is an open nicety).
14. **API route names** (the §8 smoke snippet in older handoffs was wrong): categories live at `/api/emission-categories`, response nests as `data.categories`, and the display-name field is `category` (not `name`). The calculate preview returns `data.calculation.emissions`, `data.quality.dqScore`, `data.provenance.gwpApplied`, `data.scope2Dual.*`.
15. **Headless UI automation races React state:** clicking Save in the same synchronous tick as a state-mutating click submits the PRE-update state (a remove+save in one eval re-sent the old exclusions array). Always wait for a re-render between mutation and submit. Also: `[...document.querySelectorAll('.fixed')].pop()` grabs the modal BACKDROP — query `.z-50 input` for modal fields.
16. **Calculations locked before P0-5 have no snapshots** (snapshotting began at P0-5) — they show zero versions until re-locked; UI copy explains this. Don't "fix" it.
17. **Intensity rounding must use significant digits** (`toPrecision(6)`), not fixed decimals — per-EGP intensities (~1e-4) collapse to noise at 4dp while per-FTE (~1e2) are fine. Caught by hand-verification.
18. **Estimation rung order matters and is tested:** rung 1 same-period-prior-year (±45d), rung 2 adjacent-period (±120d), rung 3 intensity-proxy (only when a denominator exists for the SAME metric in BOTH the historical and target year; estimates excluded from history). Sep 2026 Mobile Combustion must return rung-1 440 L; Dec 2026 must return rung-3 550 L (400 × 50M/40M × 1.1); no-history categories must 404.

## 5. Current goal state (report order) — what's left

**Phase 1 (P0): complete** (working implementation or documented deferral for every item). **P1 underway: P1-1 done** (intensity + IMP, see §3 table).

Honest open partials carried forward: reporting-year/inventory object (→ per-year GWP locking, frozen base year, 5% recalculation threshold engine — the one structural P0 leftover), factor version history (edits overwrite), HHV/LHV + imperial unit engine (blocks remaining EPA tables + eGRID), relevance-screening workflow (exclusions register covers the justification half), completeness gates, guided onboarding wizard (§10 P0, untouched), period-overlap detection (needs meter/month model), spend double-counting guard (failure mode 10 still a risk), PDF/DOCX rendering, per-gas reporting table, evidence attachments.

**IMMEDIATE NEXT STEP — supplier data module (§2.4 P1).** Suggested scope from the report: supplier registry (name, contact, categories supplied), data-request workflow (issue request → supplier-specific factor or activity data lands as org custom factor / calculation entry with provenance), supplier-specific method recorded per entry (raises method hierarchy + DQ to 1), engagement-status tracking surfaced on the dashboard/compliance page. Reuse the existing audited-CRUD patterns (facilities/exclusions/denominators are the template: model array or collection → audited PUT/CRUD → role-gated Compliance tab).

**After that, report order continues (P1):** completeness dashboard/gates (categories-with-data vs relevant, publish gate on lock) → SSO/verifier roles → CDP/SBTi mapping exports → remaining factor tables (EPA imperial + eGRID; EFDB-USA curation policy) → instrument registry (RECs/PPAs — only when expanding beyond Egypt) → PDF report rendering → evidence attachments per data line. Then the reporting-year object when tackling base-year/recalculation properly.

## 6. Known demo-data/test debris (safe to keep; wipe selectively if presenting)

- QA calculations ("QA …" titles), incl. "Calculation Report — 6/12/2026" (the 440 L estimated petrol entry, 953.92 kg, isEstimate/DQ5 — useful demo of the estimate flow).
- QA custom factors ("QA per-gas fuel", "Supplier-specific grid mix", "QA steam 2020/2023"); facility "Cairo HQ" (+ soft-deactivated "QA UI Facility (Alexandria)").
- One exclusion, one target, **4 denominators** (revenue 40M/50M EGP + employees 100/120 FTE for 2025/2026 — these power the verified intensity figures and rung-3 math; keep them).
- Snapshot history: v1/v2 on "QA Supplier electricity" (diff identical), v1 on "QA DQ egypt" (P0-8 lock test). Audit rows for all of the above.
- `docs/ENTERPRISE_GAP_ANALYSIS.md` has mojibake artifacts in early sections (Windows-1252/UTF-8 round-trips) — content accurate; re-encode if it bothers anyone. Mongoose duplicate-index warnings (`email`, `factorCode`) are harmless.

## 7. Outside-the-code action items (user-owned)

1. 🔴 **Rotate the GitHub PAT embedded in the git remote URL** (`.git/config`) — treat as compromised; do not push until rotated, then rewrite the remote (credential manager or SSH).
2. `docker-compose.prod.yml` was never aligned with the new env contract (JWT pair, COOKIE_SECURE, Vite build) — required before any real deploy, along with HTTPS, real secrets, Mongo auth, and backup automation.
3. Consider `npm ci` in Dockerfiles now that lockfiles are committed.

## 8. Verification pattern for the new session (smoke test)

```powershell
$base='http://localhost:8080'
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{email='demo@carbonytics.com';password='Demo!2026Pass'}|ConvertTo-Json)
$H=@{Authorization="Bearer $($login.data.accessToken)"}
(Invoke-RestMethod "$base/api/emission-factors?limit=1" -Headers $H).pagination.total            # ≈1027
$rep=(Invoke-RestMethod "$base/api/reports/ghg-inventory?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data
$rep.dataQuality        # weightedDqScore ≈4.99, estimates present
$rep.intensity.metrics  # revenue 0.000165544 kg/EGP, employees 68.9768 kg/FTE (2026)
# Egyptian default: calculate electricity without factorId → factor.region must be 'egypt'
$cats=(Invoke-RestMethod "$base/api/emission-categories" -Headers $H).data.categories
$elec=$cats | Where-Object { $_.category -eq 'Purchased Electricity' }
$calc=(Invoke-RestMethod "$base/api/calculations/calculate" -Method Post -ContentType 'application/json' -Headers $H -Body (@{categoryId=$elec.id;value=100;unit='kWh'}|ConvertTo-Json)).data
"$($calc.factor.region) dq=$($calc.quality.dqScore) gwp=$($calc.provenance.gwpApplied)"          # egypt dq=2 gwp=embedded
# Estimation rungs (see gotcha 18): Mobile Combustion Sep-2026 → 440 (rung 1); Dec-2026 → 550 (rung 3)
# IMP: (Invoke-RestMethod "$base/api/reports/imp?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.title
```
UI spot-check: log in at :8080 → Compliance page shows 6 tabs; Reports & Exports previews the inventory (intensity block present) and downloads GHG/assurance/IMP; dashboard shows weighted DQ + estimate share, lock buttons, facility filter.
