# Carbonytics — Session Handoff Document

**Date:** 2026-06-14 · **Branch:** `remediation` @ `2adcd50` (P1-6 ESRS E1; ~31 commits ahead of `master`; master untouched) · **Author of prior work:** Claude Code sessions with MohShalaby92

**Purpose:** complete continuation context for a new session. Read this top-to-bottom before changing anything. Companion artifacts: `docs/ENTERPRISE_GAP_ANALYSIS.md` (requirement-by-requirement status + per-increment addenda §14–§25), the git log (detailed commit messages with verification evidence), and `ENTERPRISE_REQUIREMENTS_REPORT.md` on the user's Desktop (the master spec; implementation follows its priority order P0 → P1 → P2).

**Status in one line:** Phase 0 (P0) complete; **P1-1 → P1-6 complete and verified** (P1-1…P1-5 deeply verified per §3a; **P1-6 ESRS E1 mapping added and verified this session**, §26 in the gap analysis). The §8 "CDP/SBTi/ESRS mapping exports" trio is now fully ✅. The stack is healthy and running on `:8080`. **Immediate next step: the structural reporting-year/inventory object** (§5c), or the quick adjacent cleanup flagged in §5a (CDP Scope 2 non-electricity under-count).

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
| P1-2 | `e763162` | **Supplier data module** (§2.4): `Supplier` model (org registry name/contact/categories + embedded `dataRequests` with sent→received→fulfilled/declined lifecycle); audited CRUD + request endpoints (`/api/suppliers`, admin/manager); fulfilling with a custom-factor creates a supplier-linked factor (`EmissionFactor.supplierId/supplierName`) → entry records **supplier-specific method + DQ 1** (the spend-based DQ penalty no longer clobbers supplier primary data); report supplier-engagement block; Compliance **Suppliers** tab |
| P1-3 | `9d339c5` | **Completeness + relevance screening** (§5): `Organization.relevantCategories` + `exclusions[].categoryId`; `completenessService` (relevant vs covered/excluded/gap per scope); `GET /api/reports/completeness`; report completeness block; **soft publish gate** (lock warns on undocumented gaps, still succeeds); dashboard Completeness card + Compliance **Completeness** tab with per-scope relevance editor |
| P1-4 | `128175f` | **Verifier + viewer roles** (§7/§9): role enum gains `viewer` (read-only) + `verifier` (read-only + sign-off); calc write/compute endpoints gated to contributor roles; `Calculation.verification` + `PATCH /:id/verify` (verifier/admin, locked-only, cleared on unlock, immutability guard widened); report `verifiedCalculations`; dashboard verify button + verified badge; role menu lists all roles. SSO/SCIM still deferred |
| P1-5 | `fb13f3d` | **CDP + SBTi mappings** (§8): `GET /api/reports/cdp` (Climate Change C0/C5/C6/C7/C10 in tonnes) + `GET /api/reports/sbti` (target readiness vs near-term 1.5°C: Scope 3 ≥40% rule, implied annual linear vs ~4.2%/yr); both JSON + markdown, reuse `buildGHGInventoryReport`; Compliance Reports "Disclosure framework mappings" cards. Preparation aids, not official submissions |
| P1-6 | `2adcd50` | **ESRS E1 (CSRD) mapping** (§8, completes the trio): `GET /api/reports/esrs` — E1-6 gross Scope 1 / dual Scope 2 (location + market) / Scope 3 by category / total GHG (location + market) in tonnes + **GHG intensity per net revenue** + E1-1/E1-4 narrative pointers from targets; E1-5/E1-7/E1-8/E1-9 honestly flagged not-auto-mappable. JSON + markdown, reuses `buildGHGInventoryReport`; third Compliance Reports disclosure card. **Scope 2 location derived by swapping the electricity market delta** so non-electricity Scope 2 is preserved (surfaced a latent CDP Scope 2 under-count — see §26). Preparation aid, not an official submission |

**Factor library: ~1,031 factors visible to the demo org** (4 Egyptian + 19 baselines + 726 DEFRA + 24 EPA + 216 EFDB + 33 GHGP + ~9 QA/supplier customs). The count is org-scoped (`visibleToOrg`: shared library + that org's own customs), so it drifts as QA supplier factors are created. Import commands (all idempotent, non-destructive):
```
docker compose cp "<file>.xlsx" backend:/tmp/x.xlsx
docker compose exec -T backend node dist/scripts/importFactorLibrary.js /tmp/x.xlsx     # DEFRA FlatFormat
docker compose exec -T backend node dist/scripts/importEpaHub.js /tmp/x.xlsx            # EPA Hub (Table 10)
docker compose exec -T backend node dist/scripts/importEfdbGhgp.js efdb /tmp/x.xlsx Global
docker compose exec -T backend node dist/scripts/importEfdbGhgp.js ghgp /tmp/x.xlsx
```
Source files live at `C:\Users\Shalaby\Desktop\ALX\Carbonytics_ ALX_Graduation_Project\Data\`.

**Frontend map (for the compliance surface):** `frontend/src/pages/compliance/` — `CompliancePage.tsx` (tab shell, 8 tabs) + `ReportsTab` (period pickers, GHG/assurance/IMP + **CDP/SBTi** downloads, inventory preview) + `CompletenessTab` (P1-3: relevance screening + completeness stats) + `ExclusionsTab` + `FacilitiesTab` + `SuppliersTab` (P1-2: registry, requests, fulfillment) + `DenominatorsTab` + `SnapshotsTab` + `AuditLogTab`; dashboard cards in `frontend/src/pages/dashboard/` (`CompletenessCard`, `QualityIndicators`, `RecentCalculations` with lock/**verify** buttons); user management in `frontend/src/pages/settings/UserManagement.tsx` (role menu lists all 5 roles from `USER_ROLES`); services in `frontend/src/services/` (`complianceService.ts`, `organizationService.ts`, `calculationService.ts`, `api.ts`); enterprise types in `frontend/src/types/index.ts` (CalculationEntry provenance + supplierId/supplierName, Facility, Supplier, AuditLogEntry, SnapshotMeta/Diff, EstimateSuggestion, Denominator, CompletenessResult, Calculation.verification; User role union includes viewer/verifier).

**Backend map (Node/Express/TS under `backend/src/`):**
- `models/` — `User` (roles admin/manager/user/viewer/verifier), `Organization` (settings.gwpSet, consolidationApproach, exclusions[+categoryId], denominators, targets, **relevantCategories**), `Facility`, **`Supplier`** (registry + embedded `dataRequests` + `deriveEngagementStatus`), `EmissionCategory`, `EmissionFactor` (+supplierId/supplierName), `Calculation` (data entries with full provenance, status draft/completed/verified/locked, **verification** sub-doc, immutability guards in `pre('findOneAndUpdate'/'save'/...)`), `CalculationSnapshot`, `AuditLog`, `IndustryBenchmark`.
- `controllers/` — `authController`, `organizationController` (org/targets/exclusions/denominators/**relevantCategories**/audit-log/facilities/users/settings), `calculationController` (calculate/save/estimate/lock/unlock/**verify**/snapshots), `reportController` (`buildGHGInventoryReport` is the spine; `getCompletenessReport`, `getAssurancePackage`, `getInventoryManagementPlan`, **`getCdpMapping`/`getSbtiSummary`**, dashboard/emissions/comparison/trends/benchmarks), `emissionCategoryController`, `emissionFactorController`, **`supplierController`**, `csvController`.
- `services/` — **`calculationEngine`** (factor selection tiers, per-gas×GWP, Scope-2 dual, unit conversions, `assessCalculationQuality` with the supplier-DQ-1 / spend-penalty gating), `estimationService` (3-rung gap-filling), **`completenessService`** (`computeCompleteness`), `dataImportService`/`excelParserService`/`csvService`, `benchmarkService`, `tokenStore`.
- `routes/` — `auth`, `organizations`, `calculations` (write/compute gated to `CONTRIBUTOR_ROLES`), `reports`, `emissionCategories`, `emissionFactors`, **`suppliers`**, `csv`. `middleware/auth.ts` exposes `authenticate` + `authorize(...roles)`. `utils/audit.ts` = `recordAudit`, `utils/apiResponse.ts` = `success`/`error`/**`paginated`** (puts the array in `data`, paging in `pagination` — see gotcha 25).

## 3a. Deep verification baseline (2026-06-14) — what's been battle-tested

The whole P1-2…P1-5 surface was independently re-verified this session: **155 API correctness checks** (valid + invalid inputs, exact hand-computed values, multi-tenant isolation via 2nd/3rd registered orgs, all guard rails) and a **full in-browser UI pass** (every button/form/modal/link on the Suppliers, Completeness, dashboard, Reports, calculator, and User Management surfaces). All passed. Findings:
- **One real bug found and fixed** (`28bfa53`): the **User Management page crashed blank** — `organizationService.getUsers` returned the paginated array but the component read `data.users` off it (→ `undefined.map`). Pre-existing (P1-4 only touched the role menu) but it blocked the role menu from rendering. Fixed; verified the page now lists users and shows all 5 role options. See gotcha 25.
- Confirmed correct (exact values): supplier engine math (DQ 1 survives spend-based categories), completeness arithmetic (33.3/66.7/100% with per-scope rollups, categoryId + name-fallback exclusion matching), role gating (viewer/verifier 403 on every write/compute endpoint; verify is locked-only, never mutates emissions, cleared on unlock, cross-tenant→404), CDP kg→tonne conversions across all modules, SBTi 40%-rule + linear-reduction + 1.5 °C threshold (both branches), markdown Content-Type/Content-Disposition/disclaimers.
- **No other instance** of the paginated-shape bug — every other service consumes `success()`-wrapped objects correctly; `complianceService.getAuditLog` already treats `data` as the array.

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
19. **No `DELETE /api/calculations/:id` route exists** — calcs can be locked/unlocked but not deleted via API (that's why the "QA completeness gate 2027" debris persists). If you need delete, add the route+controller (mind the locked-immutability guard).
20. **Supplier-specific factors must keep DQ 1 even in spend_based categories** — the PCAF spend penalty (`Math.max(dqScore,4)`) is gated on `!factor.supplierId` in `calculationEngine.assessCalculationQuality`. A supplier-linked factor is primary data using the supplier-specific method, not spend-based. Don't remove that guard.
21. **Verification is a separate `Calculation.verification` sub-doc, NOT `status:'verified'`** — overloading status would drop the calc out of `'locked'` and disable the immutability guard. The model guard (`isStatusOnlyUpdate`) allows status-only OR verification-only updates on a locked doc; keep both narrow.
22. **Completeness is an annual concept** — the dashboard Completeness card is fixed to a trailing-12-month window, deliberately NOT the month/quarter/year emissions toggle (a 1-month window showed a misleading 80%/1-gap against a 100% annual inventory). The Completeness tab has its own period picker.
23. **When inserting a section into a report markdown renderer, renumber the following `## N.` headings** (GHG inventory markdown went to 13 sections across P1-2/P1-3). And when an Edit spans a function boundary, don't drop the next function's `function foo() {` header — `tsc` catches it as "Declaration or statement expected" at the file's next close-brace.
24. **Prod-mode user invites don't return the temp password** (`config.IS_PROD` suppresses it — correct security). To get a working test login for a non-admin role, set the password directly via the User model in the backend container (`u.password='…'; u.save()` re-hashes), as done for qa.viewer. The `.test` TLD also fails `isEmail()` — use `.com` for test accounts.
25. **Frontend services that consume a `paginated()` backend endpoint must read the array from `response.data` and paging from `response.pagination`** — `ApiResponseUtil.paginated` puts the array in `data` (NOT `data.users`/`data.items`). `organizationService.getUsers` had this wrong (typed the generic as `{users,pagination}`, returned the bare array), so `UserManagement` read `data.users` = undefined and crashed blank on `.map`. Fixed `28bfa53` (reshape to `{users: response.data, pagination: response.pagination}`). The other paginated consumer, `complianceService.getAuditLog`, already does `response.data || []` — copy that pattern for any new paginated list.

## 5. Current goal state (report order) — what's left

**Phase 0 (P0): complete** (working implementation or documented deferral for every item). **Phase 1: P1-1 → P1-6 done** (intensity+IMP, supplier module, completeness+relevance screening, verifier/viewer roles, CDP/SBTi mappings, **ESRS E1 mapping** — see §3 table, §3a, and gap-analysis §21–§26). P1-1…P1-5 deeply verified per §3a; P1-6 verified this session (API hand-checks + in-browser).

### 5a. ESRS E1 disclosure mapping (§8 P1) — DONE this session (P1-6, `2adcd50`, gap-analysis §26)

The "CDP/SBTi/**ESRS** mapping exports" trio is now complete (§8 row flipped to ✅). `GET /api/reports/esrs` (JSON + `?format=markdown`) reshapes `buildGHGInventoryReport` onto ESRS E1 datapoints in tonnes CO₂e: E1-6 gross Scope 1 / dual Scope 2 (location + market) / Scope 3 by category / total GHG (location + market), GHG intensity per net revenue, and E1-1/E1-4 narrative pointers from configured targets; E1-5/E1-7/E1-8/E1-9 honestly flagged not-auto-mappable. Frontend: `complianceService.downloadEsrsMapping` + the third Compliance Reports disclosure card. Implementation/verification detail and exact hand-checked values are in gap-analysis §26.

**Quick adjacent cleanup flagged (≤1 increment):** ESRS-E1 verification surfaced a **latent under-count in the shipped CDP mapping** — `getCdpMapping`'s C6.3/C7.1 Scope 2 use the dual *electricity* figures only (`scope2Dual.locationBased/marketBased`), so they omit any **non-electricity Scope 2** (steam/heat/cooling; the demo org carries 2,790 kg of it). ESRS E1 avoids this by deriving Scope 2 location/market from the headline `byScope.scope2` (the market-based total) minus the electricity market delta plus the electricity location figure. Apply the same correction to `buildCdpMapping` (and re-check SBTi, which uses scope totals so is unaffected).

### 5b. Then, in report order (P1 → P2)

1. **Remaining factor tables** — EPA imperial-unit fuel tables + eGRID subregions (blocked on the HHV/LHV + imperial energy-basis unit engine — build that first in `calculationEngine.convertUnits`); EFDB-USA curation policy (country studies, not guideline defaults — needs an explicit dedup/curation decision, see gotcha 5). Same idempotent `scripts/import*.ts` pattern.
2. **Instrument registry (RECs/PPAs)** — only when expanding the Scope-2 market-based method beyond Egypt (Egypt has no contractual-instrument market today; the dual method already falls back to grid-average correctly).
3. **PDF/DOCX report rendering** — currently markdown/JSON only. Add a renderer (e.g. a headless converter) over the existing `buildGHGInventoryReport` output.
4. **Evidence attachments per data line** — file storage keyed to a `Calculation.data[i]` entry (the assurance package notes this as the open §4.3 item).
5. **Guided onboarding wizard** (§10 P0, untouched) and **persona modes** (§10 P1).

### 5c. The one big structural leftover — the reporting-year / inventory object

An `Inventory` entity grouping calculations by reporting year. It unblocks, in one stroke, several deferred items: a **frozen base year**, the **5% recalculation-threshold engine**, **per-inventory-year GWP-set locking**, and a **HARD publish gate** (today's completeness gate on lock is intentionally *soft*). This is the last structural P0 leftover; it is larger than a single increment and should be scoped deliberately (model + lifecycle + migration of existing calculations into a default inventory). Other honest open partials that mostly fold into this or are independent: **factor version history** (edits overwrite — add an immutable version table), **period-overlap detection** (needs a meter/month model), **spend double-counting guard** (failure-mode 10 still a risk — dedup Scope 1/2 activity vs Cat 1 spend), **per-gas reporting table** (engine already computes `gasBreakdown`; surface it). **SSO/SCIM** is deferred until there is an IdP to integrate against (the verifier/viewer *roles* are done).

## 6. Known demo-data/test debris (safe to keep; wipe selectively if presenting)

**Current verified state of the demo org (`demo@carbonytics.com`) for the 2026 period:** total ≈ **9,193 kg CO₂e**, completeness **100%** (4 screened relevant categories + the Fugitive exclusion → 0 gaps), **3 locked / 3 verified** calculations, supplier-specific share **9.5%**. Use these as the known-good baseline.

- **Config:** **4 relevant categories** screened (Electricity, Purchased Goods, Mobile, Fugitive — drive the 100% completeness); **2 exclusions** (one pinned to Fugitive Emissions via `categoryId` — keep it; it documents the gap so completeness reads 100%); **1 target** ("30% reduction by 2030" — powers the SBTi readiness demo, implies 6%/yr → meets 1.5 °C); **4 denominators** (revenue 40M/50M EGP + employees 100/120 FTE for 2025/2026 — power the intensity figures and the rung-3 estimation math; keep them).
- **Suppliers (5 total; 3 active, 2 soft-deactivated):** the showcase is **"QA Misr Cement"** (active; 1 fulfilled 2026 request → supplier factor "Misr Cement cradle-to-gate" 0.85 kg; 1 declined 2025 request). Verification-session extras (harmless, follow the same convention): "QA ActivityData Supplier" (active; activity-data fulfillment, contact edited to "Edited Contact"), "QA Save Supplier" (active; → "QA Save EF"), "QA Verify Supplier" (deactivated; → "QA Verify EF"), "UI Test Supplier" (deactivated; created entirely through the UI in verification, → "UI Supplier EF" under Stationary Combustion). Several `(supplier: …)`-tagged custom factors exist accordingly.
- **Calculations:** QA titles incl. "Calculation Report — 6/12/2026" (440 L estimated petrol, 953.92 kg, isEstimate/DQ5 — the estimate-flow demo), "QA Supplier cement 2026" (850 kg, supplier-specific DQ1), "QA Save Provenance" (supplier-specific entry), "QA Verify Target" (locked + verified in verification). One isolated **"QA completeness gate 2027"** calc remains (no `DELETE /calculations/:id` route to remove it — gotcha 19; isolated from 2026 reporting). Snapshot history: v1/v2 on "QA Supplier electricity" (diff identical), v1 on "QA DQ egypt" + new lock/verify snapshots.
- **Users (2 in demo org):** `demo@carbonytics.com` (admin) and **`qa.viewer@carbonytics.com`** (password `QaViewer!2026`, currently role **verifier** — its role was flipped through user/viewer/verifier during gating tests; it signed off "QA Supplier electricity"). Use it to demo the read-only/verify flows.
- **Three separate test tenants** were registered during verification to prove multi-tenant isolation — **"QA Org Two"** (`qa.org2@carbonytics.com` / `Org2Pass123`), **"QA Completeness Org"** (`qa.comp@carbonytics.com` / `CompPass123`), **"QA SBTi Org"** (`qa.sbti@carbonytics.com` / `SbtiPass123`, has a scope-3-dominant inventory for the SBTi 40%-rule branch). They are fully isolated from the demo org and can be ignored or deleted.
- Audit rows exist for all of the above (supplier / verification / relevant-categories / lock-unlock / settings events). `docs/ENTERPRISE_GAP_ANALYSIS.md` has mojibake artifacts in early sections (Windows-1252/UTF-8 round-trips) — content accurate; re-encode if it bothers anyone. Mongoose duplicate-index warnings (`email`, `factorCode`) are harmless.
- **To reset to a clean demo** (optional, before a presentation): re-run the targeted insert/seed scripts rather than `seedBasicData` (destructive — gotcha 11); soft-deactivate the QA suppliers via the UI; the 3 test tenants can be dropped from Mongo directly. None of this is required for development.

## 7. Outside-the-code action items (user-owned)

1. 🔴 **Rotate the GitHub PAT embedded in the git remote URL** (`.git/config`) — treat as compromised; do not push until rotated, then rewrite the remote (credential manager or SSH).
2. `docker-compose.prod.yml` was never aligned with the new env contract (JWT pair, COOKIE_SECURE, Vite build) — required before any real deploy, along with HTTPS, real secrets, Mongo auth, and backup automation.
3. Consider `npm ci` in Dockerfiles now that lockfiles are committed.

## 8. Verification pattern for the new session (smoke test)

```powershell
$base='http://localhost:8080'
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{email='demo@carbonytics.com';password='Demo!2026Pass'}|ConvertTo-Json)
$H=@{Authorization="Bearer $($login.data.accessToken)"}
(Invoke-RestMethod "$base/api/emission-factors?limit=1" -Headers $H).pagination.total            # ≈1031 (org-scoped; drifts with QA supplier factors)
$rep=(Invoke-RestMethod "$base/api/reports/ghg-inventory?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data
$rep.dataQuality        # weightedDqScore present, estimates present
$rep.intensity.metrics  # revenue 0.000165544 kg/EGP, employees 68.9768 kg/FTE (2026)
# Egyptian default: calculate electricity without factorId → factor.region must be 'egypt'
$cats=(Invoke-RestMethod "$base/api/emission-categories" -Headers $H).data.categories
$elec=$cats | Where-Object { $_.category -eq 'Purchased Electricity' }
$calc=(Invoke-RestMethod "$base/api/calculations/calculate" -Method Post -ContentType 'application/json' -Headers $H -Body (@{categoryId=$elec.id;value=100;unit='kWh'}|ConvertTo-Json)).data
"$($calc.factor.region) dq=$($calc.quality.dqScore) gwp=$($calc.provenance.gwpApplied)"          # egypt dq=2 gwp=embedded
# Estimation rungs (see gotcha 18): Mobile Combustion Sep-2026 → 440 (rung 1); Dec-2026 → 550 (rung 3)
# --- P1-2..P1-5 surfaces (current expected values) ---
(Invoke-RestMethod "$base/api/suppliers" -Headers $H).data.engagement                            # 3 active suppliers, dataIntegrated=3
(Invoke-RestMethod "$base/api/reports/completeness?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data  # 100% screened, gaps=0
$rep.supplierEngagement.supplierSpecificData   # entries≥2 / share ≈9.5%
$rep.inventoryControls.verifiedCalculations    # 3 (locked=4)
(Invoke-RestMethod "$base/api/reports/cdp?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.C6_emissions_data.'C6.1 Scope 1 (t CO2e)'   # tonnes = report scope1/1000
(Invoke-RestMethod "$base/api/reports/sbti?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.inventory.scope3SharePercent              # ≈9.5 (<40 → no Scope 3 target required)
$esrs=(Invoke-RestMethod "$base/api/reports/esrs?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.'E1-6 gross GHG emissions'
"$($esrs.'Total GHG emissions, location-based (t CO2e)') loc / $($esrs.'Total GHG emissions, market-based (t CO2e)') mkt"   # ≈9.109 / 9.193 t (market == report total/1000; location preserves non-electricity Scope 2)
(Invoke-RestMethod "$base/api/organizations/users?limit=5" -Headers $H).data.Count                # 2 — array lives in .data (UserManagement fix, gotcha 25)
# Roles: a 'viewer'/'verifier' account gets 403 on POST /calculations; verifier can PATCH /calculations/:id/verify on a LOCKED calc
```
UI spot-check: log in at :8080 → Compliance page shows **8 tabs** (Reports, Completeness, Exclusions, Facilities, Suppliers, Intensity & Denominators, Snapshots, Audit Trail[admin]); Reports & Exports previews the inventory and downloads GHG/assurance/IMP/**CDP/SBTi/ESRS**; Suppliers tab shows the engagement chips + request lifecycle (Add/Edit/Deactivate/New request/Mark received/Fulfill all work); Completeness tab shows the relevance editor + stats; dashboard shows weighted DQ + estimate share + **Completeness card**, lock/**verify** buttons, facility filter; **Settings → Users renders the user list + a role menu with all 5 roles** (regression-check for the §3a crash fix).
