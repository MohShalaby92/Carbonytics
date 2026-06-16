# Carbonytics — Session Handoff Document

**Date:** 2026-06-15 · **Branch:** `remediation` — tip is this HANDOFF rewrite, on top of `091d901` (gap-analysis §34, the full-session verification pass); **~60 commits ahead of `master`; master untouched** · **Author of prior work:** Claude Code sessions with MohShalaby92

**Purpose:** complete continuation context for a new session. Read top-to-bottom before changing anything. Companion artifacts: `docs/ENTERPRISE_GAP_ANALYSIS.md` (requirement-by-requirement status + per-increment addenda §14–§34), the git log (detailed commit messages with verification evidence), and `ENTERPRISE_REQUIREMENTS_REPORT.md` on the user's Desktop (the master spec; implementation follows its priority order P0 → P1 → P2).

**Status in one line:** **All P0 complete** (working implementation or documented deferral for every item). **P1 done so far:** P1-1 → P1-8 (intensity+IMP, supplier module, completeness+relevance, verifier/viewer roles, CDP/SBTi/ESRS mappings, EPA fuel tables + unit engine, PDF/DOCX/XLSX rendering) **plus §1.2 multi-level entity hierarchy + consolidation (§33), §1.3 biogenic CO₂ separation (§35), §1.4 per-gas breakdown (§36) and §2.2 fugitive material balance (§37)**. The prior full session shipped the reporting-year/inventory object (§31), the onboarding wizard (§32) and the entity hierarchy (§33) + a 10-suite verification pass (§34); **this session shipped §1.3, §1.4 and §2.2 fugitive material balance** (engine/model/report/renderers/UI, each verified). Factor library ~1,192. Stack healthy on `:8080`. **Demo 2026 baseline = 9,193.02 kg CO₂e, untouched throughout. Immediate next step (report order, P1): the rest of §2.x is DATA-BLOCKED (mobile vehicle-km factors, spend EEIO sector table, Egypt T&D loss rate — see §5b.1) → otherwise §3 factor version history → §4.3 evidence attachments → §10 persona modes.**

---

## 1. Product & non-negotiable policies

Carbonytics is a multi-tenant carbon-accounting platform (GHG Protocol Scopes 1/2/3) for the **Egyptian market**, targeting enterprise credibility (sellable, audit-ready). Three personas: enterprise sustainability teams, consultants, SMEs.

**Policies locked in by the user — do not regress:**
1. **Egyptian emission factors are the PRIMARY DEFAULT** — auto-selection tier order: Egyptian shared → org custom → global → other regions; factor dropdowns list Egyptian first (preselected). Users may override by explicitly selecting any factor or manually entering custom factors. Egyptian factors must never be removed from selection.
2. **Never fabricate factor values.** Imports come only from the user's official files with exact unit conversions; CO₂-only sources are flagged CO₂-only; CH₄/N₂O are never invented.
3. **No GWP double-application:** factors with per-gas masses go through per-gas × org GWP set (`gwpApplied: 'per-gas'`); CO₂e-denominated factors are used as-is (`'embedded'`). DEFRA's "kg CO2e of CH4" rows are GWP-weighted CO₂e — never import them as gas masses.
4. **Estimates stay distinguishable** (`isEstimate`, method string stored verbatim, quality low, DQ 5). Gaps are never silently filled or dropped; estimates are never chained off other estimates.
5. **Locked calculations are immutable** (model-level guards); restatements only via audited unlock → re-lock (snapshot version per lock). A **published reporting year** (inventory) cascade-locks its member calcs; you cannot save into a published year (409) — reopen first.
6. **Consolidation is a reporting-layer view** — stored per-calc emissions are always 100% gross; equity/control/M&A share is applied at report time only (never mutate stored emissions). Biogenic CO₂ (once split, §1.3) is a memo item reported outside the scope totals.
7. Docker storage must live on the KINGSTON drive (D:), never C: (C: has ~18 GB free).

## 2. Environment (verified working)

- **Stack:** `docker compose up -d` → Mongo 7 + Redis 7.2 + backend (Node20/Express/TS, port 5000) + frontend (Vite/React 19 build behind nginx). App at **http://localhost:8080** (single origin; nginx proxies `/api`). Docker disk image: `D:\HP_Elitebook\DockerData\DockerDesktopWSL`.
- **Login:** `demo@carbonytics.com` / `Demo!2026Pass`. Auth = in-memory access token (15m) + httpOnly refresh cookie; first page load fires one 401 refresh (normal — also happens mid-session after 15m; the axios interceptor retries transparently).
- **Local installs:** repo is an npm-workspaces monorepo but built per-package — always `npm install --no-workspaces` inside `backend/` / `frontend/` (workspace mode breaks with EISDIR symlink errors).
- **TypeScript gate:** `npx tsc` is NOT available; run `node node_modules\typescript\bin\tsc --noEmit` inside each package.
- **Git on D: needs** `git config --global --add safe.directory D:/HP_Elitebook/Personal_Projects/Carbonytics/Code/Carbonytics` (drive records no ownership → "dubious ownership" fatal). Re-add if the environment resets.
- **Dev preview:** `.claude/launch.json` defines `carbonytics-frontend` (Vite on :3000 proxying `/api` to the Docker backend :5000) — use it for in-browser verification before rebuilding the production image. The preview shares the browser session/cookie across runs (a prior demo login persists; log out via the API or override `window.confirm` for confirm-dialog buttons).
- **After reseeding/imports:** `docker compose exec -T redis redis-cli FLUSHALL` (categories/factors are cached 30–60 min).
- **Local compose env:** `RATE_LIMIT_MAX=1000` (default 100/15min trips during normal interactive use).
- **Increment workflow used throughout (keep it):** plan/scope tasks → implement → local `tsc` gate per package → `docker compose up -d --build backend` (and/or `frontend`) → API verification with **hand-computed expected values** → in-browser verification via the dev preview → commit (quote-free message) → gap-analysis addendum → implemented-vs-differed report. Each non-trivial feature is split into sub-increments, each committed separately.

## 3. What exists and works (all verified end-to-end)

**Phase 0 (pre-enterprise):** full security overhaul (separate JWT secrets, revocable refresh tokens in Redis, rotation, login throttling, httpOnly cookie contract), CRA→Vite migration, Verdant light/Console dark design system, dashboard (real data, timeframes), calculator (category→form→factor picker→live result→save), CSV **and** XLSX import (exceljs upload path), CSV export (UTF-8 BOM), targets. Commits `dfdb6d8`…`556d103`.

**Enterprise increments (each with a gap-analysis addendum + verification evidence in commit messages):**
| Inc | Commit | Delivered |
|---|---|---|
| P0-1 | `4e839f4` | GWP sets AR4/AR5/AR6 (`settings.gwpSet`, default AR6), per-gas engine path, per-entry provenance, append-only AuditLog + `GET /api/organizations/audit-log`, lock/unlock + model immutability, exclusions register, vintage staleness warnings |
| P0-2 | `158148b` | `consolidationApproach` on Organization; Facility model + CRUD + `Calculation.facilityId`; **Scope 2 dual reporting**; vintage-aware tiered factor selection; fixed cross-tenant factor leaks |
| P0-3 | `8cc121a` | Egyptian-default policy; 15th Scope 3 category (Cat 5 Waste); `GET /api/reports/ghg-inventory` (JSON + markdown) |
| P0-4 | `00ffa82` | **726 DEFRA 2024 factors** via `scripts/importFactorLibrary.ts` (CO₂e rows only) |
| P0-5 | `122313f` | **EPA Hub 2025 Table 10** (24 per-gas factors); CalculationSnapshot per lock + `GET /:id/snapshots[/diff]`; `GET /api/reports/assurance-package` |
| P0-6 | `9838691` | **IPCC EFDB Global 216** + **GHGP cross-sector 33** via `scripts/importEfdbGhgp.ts` |
| P0-7 | `0d88dce` | Conservative gap-filling (`POST /api/calculations/estimate`, +10% uplift) + PCAF `dqScore` 1–5 + weighted-DQ/estimate-share in reports |
| P0-8 | `ec7b951` | **Compliance UI pass** — estimate button, PCAF/GWP/dual-Scope-2 in the result, dashboard cards + lock/unlock + facility filter, `/compliance` page (tabs), Settings methodology card |
| P1-1 | `5b6b725` | **Intensity + IMP**: `Organization.denominators`; intensity report section; estimation rung-3 intensity-proxy; `GET /api/reports/imp`; Denominators tab |
| P1-2 | `e763162` | **Supplier module** (§2.4): `Supplier` model + dataRequests lifecycle; supplier-linked factor → supplier-specific method + DQ 1; report block; Suppliers tab |
| P1-3 | `9d339c5` | **Completeness + relevance screening** (§5): `relevantCategories` + `exclusions[].categoryId`; `completenessService`; `GET /api/reports/completeness`; soft per-calc publish warning; dashboard + Completeness tab |
| P1-4 | `128175f` | **Verifier + viewer roles** (§7/§9): role enum + write-gating; `Calculation.verification` + `PATCH /:id/verify`; report `verifiedCalculations`; dashboard verify button. SSO/SCIM deferred |
| P1-5 | `fb13f3d` | **CDP + SBTi mappings** (§8): `GET /api/reports/cdp` + `/sbti` (JSON + markdown). Preparation aids |
| P1-6 | `2adcd50` | **ESRS E1 (CSRD) mapping** (§8): `GET /api/reports/esrs`; Scope 2 location preserves non-electricity (surfaced + fixed a CDP under-count, §27 `5f22a5b`) |
| P1-7 | `24f5172` | **EPA Hub 2025 fuel tables + imperial/energy unit engine** (§28, deep-validated §29): `convertUnits` factor-denominator path; `scripts/importEpaFuels.ts` (**161 factors**); library 1,031→1,192. Fixed Scope 2 dual defect `3aeabff` |
| P1-8 | `1728473` | **PDF/DOCX/XLSX report rendering** (§30): `services/reportRenderers.ts`; `?format=pdf\|docx\|xlsx`; Reports card buttons. (Consolidation block added to the binary renderers later — `421732a`, §34) |
| Inventory (P0) | `3242e6b`→`e81a8c4` | **Reporting-year / inventory object** (§31): `Inventory` + `InventorySnapshot` models, `Calculation.inventoryId`, migration; `/api/inventories` lifecycle (Draft→Review→Published); publish freezes totals + GWP set, cascade-locks members, snapshots; frozen **base year** + `recalculation-check` (5% drift engine); **per-year GWP pinning**; **hard completeness publish gate** (422); Compliance **Reporting Years** tab |
| Onboarding (P0) | `6592ddc`,`71811bc` | **Guided onboarding wizard** (§32): `Organization.onboarding` + `GET/PATCH /api/organizations/onboarding` (derived checklist; `.lean()` fallback → pre-wizard orgs skip it, no migration); 6-step `OnboardingWizard` auto-shown to new admins via `OnboardingGate` |
| Entity hierarchy (P1) | `b9b62b5`→`fe4718e` | **§1.2 multi-level entity hierarchy + consolidation** (§33): `Facility` → nested tree (parentFacilityId, entityType, financialControl, M&A dates; cycle-guarded); `consolidationService` (equity cumulative / control 100-0 / M&A pro-rating); `consolidation` block + `GET /api/reports/consolidation?approach=`; **Entities & Facilities** tab |
| Verify fix | `421732a` | §34 verification found the binary report exports omitted the consolidation/inventory blocks → added them to PDF/DOCX/XLSX (Consolidation section/sheet + reporting-year + pinned-GWP lines) |
| Biogenic CO₂ (P1) | `1e44df1`→`9d7cc07` | **§1.3 biogenic CO₂ tracked separately** (§35): `computePerGasEmissions` splits `factor.metadata.biogenic` CO₂ into `biogenicCO2` (kg), EXCLUDED from the scope total (biomass CH₄/N₂O stay in Scope 1); `ICalculationEntry.biogenicCO2` persisted; memo in report JSON/markdown/PDF/DOCX/XLSX + ESRS E1-6; calculator + Reports-preview memo. Closes failure-mode #7 |
| Per-gas table (P1) | `c5e21af`,`69043c1` | **§1.4 per-gas breakdown** (§36): `ICalculationEntry.gasBreakdown {co2,ch4,n2o}` persisted; `report.emissions.perGas` (mass + CO₂e-by-gas under report GWP set + per-gas subtotal + `co2eNotSeparated` remainder for embedded factors); per-gas table in markdown/PDF/DOCX + XLSX **Per-Gas Breakdown** sheet; Reports-preview table + calculator per-gas line |
| Fugitive material balance (P0) | `64de189`,`b785d65` | **§2.2 fugitive material balance** (§37): `computeMaterialBalance` derives released refrigerant kg = purchases + Δinventory − charged − recovered (clamp ≥ 0) × the DEFRA blend factor (library already existed); method `material-balance`; `ICalculationEntry.materialBalance` persisted; calculator material-balance mode. **Mobile distance/fleet, spend EEIO, T&D remain data-blocked (§5b.1)** |

**Factor library: ~1,192 factors visible to the demo org** (4 Egyptian + 19 baselines + 726 DEFRA + 24 EPA Table 10 + 161 EPA fuel/electricity + 216 EFDB + 33 GHGP + ~9 QA/supplier customs). Org-scoped (drifts with QA supplier factors). Import commands (idempotent, non-destructive; **flush Redis after**):
```
docker compose cp "<file>.xlsx" backend:/tmp/x.xlsx
docker compose exec -T backend node dist/scripts/importFactorLibrary.js /tmp/x.xlsx     # DEFRA FlatFormat
docker compose exec -T backend node dist/scripts/importEpaHub.js /tmp/x.xlsx            # EPA Hub Table 10 (per-mile)
docker compose exec -T backend node dist/scripts/importEpaFuels.js /tmp/x.xlsx          # EPA Tables 1/2/6/7 (fuels, eGRID, steam)
docker compose exec -T backend node dist/scripts/importEfdbGhgp.js efdb /tmp/x.xlsx Global
docker compose exec -T backend node dist/scripts/importEfdbGhgp.js ghgp /tmp/x.xlsx
docker compose exec -T backend node dist/scripts/migrateInventories.js                  # one-time inventory back-fill (idempotent)
docker compose exec -T redis redis-cli FLUSHALL
```
Source files: `C:\Users\Shalaby\Desktop\ALX\Carbonytics_ ALX_Graduation_Project\Data\`.

**Frontend map:** `frontend/src/pages/compliance/` — `CompliancePage.tsx` (tab shell, **9 tabs**) + `ReportsTab` (GHG report PDF/Word/Excel/Markdown + assurance/IMP/CDP/SBTi/ESRS + preview) + **`InventoriesTab`** ("Reporting Years": lifecycle, base year, threshold, recalc — §31) + `CompletenessTab` + `ExclusionsTab` + **`FacilitiesTab`** ("Entities & Facilities": hierarchy CRUD + consolidation roll-up panel — §33) + `SuppliersTab` + `DenominatorsTab` + `SnapshotsTab` + `AuditLogTab`. Onboarding: `frontend/src/components/onboarding/` (`OnboardingWizard.tsx` + `OnboardingGate.tsx`, gate mounted in `App.tsx` beside the Navbar). Dashboard cards in `pages/dashboard/`. Services in `services/` (`complianceService.ts` incl. inventory + consolidation methods, `organizationService.ts` incl. onboarding methods, `calculationService.ts`, `api.ts`). Types in `types/index.ts` (Inventory, RecalculationCheck, OnboardingState, ConsolidationResult, Facility incl. parent/type/control/M&A, + the prior enterprise types).

**Backend map (`backend/src/`):**
- `models/` — `User`, `Organization` (settings.gwpSet, consolidationApproach, exclusions, denominators, targets, relevantCategories, **onboarding**), `Facility` (**nested tree: parentFacilityId, entityType, ownership/operational/financial control, acquired/disposed dates**), `Supplier`, `EmissionCategory`, `EmissionFactor` (+supplierId/supplierName, `metadata.biogenic`), `Calculation` (+**inventoryId**, full provenance, status draft/completed/verified/locked, verification sub-doc, immutability guards), `CalculationSnapshot`, **`Inventory`**, **`InventorySnapshot`**, `AuditLog`, `IndustryBenchmark`.
- `controllers/` — `authController` (register seeds onboarding default), `organizationController` (org/targets/exclusions/denominators/relevantCategories/**onboarding**/audit-log/**facilities-as-entity-tree**/users/settings), `calculationController` (calculate/save[**links inventory**]/estimate/lock/unlock/verify/snapshots), **`inventoryController`** (list/get/create/status/publish/reopen/base-year/recalculation-check/snapshots), `reportController` (**`buildGHGInventoryReport` is the spine**; `getCompletenessReport`, **`getConsolidationReport`**, `getAssurancePackage`, `getInventoryManagementPlan`, `getCdpMapping`/`getSbtiSummary`/`getEsrsE1Mapping`, the `?format=` switch, dashboard/emissions/comparison/trends/benchmarks), `emissionCategoryController`, `emissionFactorController`, `supplierController`, `csvController`.
- `services/` — `calculationEngine` (factor tiers, per-gas×GWP, Scope-2 dual, factor-denominator unit conversions, `assessCalculationQuality`), `estimationService` (3-rung), `completenessService`, **`inventoryService`** (midpointYear/defaultPeriodForYear/ensureInventory/computeInventoryFigures), **`consolidationService`** (equity/control/M&A roll-up), `reportRenderers` (PDF/DOCX/XLSX + pdfSafe), import/parse services, `benchmarkService`, `tokenStore`. Scripts: `importFactorLibrary`, `importEpaHub`, `importEpaFuels`, `importEfdbGhgp`, **`migrateInventories`**, `seedBasicData` (destructive — gotcha 11).
- `routes/` — `auth`, `organizations`, `calculations`, **`inventories`**, `reports`, `emissionCategories`, `emissionFactors`, `suppliers`, `csv`. `middleware/auth.ts` = `authenticate` + `authorize(...roles)`; `utils/audit.ts` = `recordAudit`; `utils/apiResponse.ts` = `success`/`error`/`paginated`.

## 3a. Deep-verification milestones (what's been battle-tested)

- **P1-2…P1-5 (§3a-equivalent, 2026-06-14):** 155 API correctness checks + full in-browser pass. One bug found+fixed (`28bfa53`, UserManagement paginated-shape crash, gotcha 25).
- **P1-7 (§29, 2026-06-14):** every imported factor re-derived from source (483 fields, 0 mismatches); all unit conversions + GWP sensitivity exact; one Scope 2 dual defect fixed (`3aeabff`, gotcha 27). P1-8 renderers validated by re-parsing every file (caught the WinAnsi PDF crash, gotcha 29).
- **Full-session verification (§34, 2026-06-15):** 10 suites over the inventory object, onboarding wizard and entity hierarchy — **~132 API/format/regression assertions + a full in-browser pass, all green after one fix.** Suites: V1 lifecycle (23), V2 base year + recalc with arithmetic self-consistency (14), V3 GWP locking (5), V4 hard gate (6), V5 onboarding incl. `.lean()` fallback (11), V6 consolidation math — equity chain / control toggles / M&A pro-rating, all hand-computed (17), V7 role gating + multi-tenant isolation (19), V8 report formats incl. binary deep-reparse (found+fixed the missing-consolidation gap, `421732a`), V9 in-browser on all 3 surfaces (0 console errors), V10 full §8 regression (26). 2026 baseline 9,193.02 unchanged.

## 4. Failed attempts & gotchas (do not re-trip)

1. **exceljs cannot open the user's factor workbooks** ("end of central directory") → use SheetJS (`xlsx`) in scripts (trusted local files; uploads keep exceljs).
2. **Mongoose `timestamps` injects `$set.updatedAt` + `$setOnInsert.createdAt` into every update** — lock-guard predicates must tolerate both.
3. **IPCC 2006 notation is dotted** (`1.A.1`) — normalize before matching.
4. **EFDB "default" detection:** filter on Technical Reference containing "2006 IPCC Guidelines" (216 rows per gas).
5. **EFDB USA export yields 0 defaults by design** (country studies) — needs a curation policy before importing.
6. **EPA Hub is one stacked sheet** (591 rows, 12 tables, merged headers) — locate by title row then header row.
7. **GHGP electricity table titles vary per country** — country order from sheet name (CN, TW, BR, TH, UK).
8. **`.lean()` responses expose `_id`, not `id`** — controllers map `id`; frontend uses `calc.id || calc._id`.
9. **PowerShell: embedded double quotes inside `git commit -m @'…'@` here-strings break parsing** → keep commit messages quote-free. (When committing via the Bash tool, plain `-m "..."` works; still avoid quotes in the body.)
10. **Flush Redis after any seed/import**; rate limiter resets on backend recreate.
11. **`seedBasicData` is destructive** (deleteMany) — never run against the live DB; use targeted insert scripts.
12. recharts width(-1) warnings → fixed via `initialDimension` + `ChartContainer`; recharts pinned ^3.8.
13. `.gitignore` traps fixed; per-package lockfiles committed; Dockerfiles still `npm install` (`npm ci` is an open nicety).
14. **API route/shape names:** categories at `/api/emission-categories`, nested `data.categories`, display field `category`. Calculate preview returns `data.calculation.emissions`, `data.quality.dqScore`, `data.provenance.gwpApplied`, `data.scope2Dual.*`.
15. **Headless UI automation races React state** — wait for a re-render between a mutating click and submit; query `.z-50 input` for modal fields (`.fixed` pop() grabs the backdrop).
16. **Calculations locked before P0-5 have no snapshots** — they show zero versions until re-locked; UI copy explains this.
17. **Intensity rounding uses significant digits** (`toPrecision(6)`), not fixed decimals.
18. **Estimation rung order is tested:** rung 1 same-period-prior-year (±45d), rung 2 adjacent (±120d), rung 3 intensity-proxy (denominator in BOTH years). Sep 2026 Mobile → 440 (rung 1); Dec 2026 → 550 (rung 3 = 400 × 50M/40M × 1.1); no-history → 404.
19. **No `DELETE /api/calculations/:id` or `/api/inventories/:id` route** — calcs/inventories can be locked/published/reopened but not deleted via API (that's why throwaway years/calcs persist). Add a route+controller if needed (mind the immutability guard).
20. **Supplier-specific factors keep DQ 1 even in spend_based categories** — the PCAF spend penalty is gated on `!factor.supplierId`. Don't remove that guard.
21. **Verification is a separate `Calculation.verification` sub-doc, NOT `status:'verified'`** — the model guard allows status-only OR verification-only updates on a locked doc; keep both narrow.
22. **Completeness is annual** — the dashboard card is fixed to a trailing-12-month window, not the emissions toggle.
23. **Inserting a report markdown section → renumber following `## N.` headings**; an Edit spanning a function boundary must keep the next function's header.
24. **Prod-mode user invites don't return the temp password** — set a test password directly via the User model in the container. `.test` TLD fails `isEmail()` — use `.com`.
25. **Frontend services consuming a `paginated()` endpoint read the array from `response.data`, paging from `response.pagination`** (NOT `data.users`). Pattern: `response.data || []`.
26. **`convertUnits` targets the factor's OWN denominator first** (P1-7) — parses the denominator from `factor.unit` and converts the input into it when a known conversion exists, BEFORE the legacy base-unit path; guarded so existing factors + fail-loud are unchanged. EPA fuel `unit` strings MUST use exact tokens (`mmBtu`, `short ton`, `gallon`, `scf`). Per-gas EPA factors store gas masses per denominator; engine applies GWP at runtime.
27. **Scope 2 location-based = the selected grid factor's result, not a separate Egyptian-grid lookup** (`3aeabff`) — the Egyptian-grid fallback for location applies ONLY when a supplier-specific (org-custom) factor is used.
28. **PowerShell mangles `m³` (U+00B3) in JSON bodies** — encode the body as UTF-8 bytes when testing m³/Nm³ from PowerShell; the real browser is fine.
29. **pdf-lib standard fonts are WinAnsi (CP1252) and THROW on out-of-range chars** — `services/reportRenderers.ts` has `pdfSafe()` (maps arrows/dashes/`≥≤`/subscripts/smart-quotes to ASCII, drops the rest), applied to ALL drawn text. `·` (U+00B7) IS in Latin-1, so it's safe. New PDF text must go through `pdfSafe`. To validate PDF *content*: inflate FlateDecode streams (`zlib.inflateSync`) + decode hex `<...> Tj` operators (pdf-lib writes hex strings, not `(...)` literals).
30. **The inventory migration back-fills `Calculation.inventoryId` via the NATIVE driver** (`Calculation.collection.updateOne`) — bypasses the immutability guard so locked calcs can be linked; this is a structural back-fill, NOT a restatement. Idempotent. Reporting year = **period-midpoint year** (matches intensity-year rule). New calcs link on save; you cannot save into a published year (409) — reopen first.
31. **Git Bash (MSYS) mangles `/tmp/...` paths to `docker compose exec`** — `/tmp/x` becomes `C:/Users/.../Temp/x` and node resolves it under `/app/...`. Run `docker compose exec ... node /path` via the **PowerShell tool** (no MSYS), or prefix `MSYS_NO_PATHCONV=1`. Also: a script run from `/tmp` can't `require` app deps (node resolves from the script dir upward) — `cp` it to `backend:/app/...` so it finds `/app/node_modules`.
32. **Consolidation is a reporting-layer view — never mutate stored emissions** (§33/§34) — `consolidationService` applies the share to GROSS per-calc emissions at report time; `calc.emissions` stay 100%. Equity = cumulative `ownershipPercent` product down the chain; operational/financial control = the node's own boolean (100/0, not fractional/cumulative); M&A = overlap fraction of `[acquiredDate, disposedDate]` with the reporting period; no `facilityId` ⇒ 100%. The `consolidation` block appears in JSON + markdown **and** the binary renderers (added in `421732a`). `GET /api/reports/consolidation?approach=` overrides the org's approach for side-by-side comparison.
33. **Entity hierarchy = extended `Facility`, not a new model** (§33) — `parentFacilityId` nests org→subsidiary→site; `createsCycle` guards re-parenting (parent must be same org, no self/descendant); `entityType` (subsidiary/division/site/asset) is informational. `ownershipPercent` = "share held by the immediate parent" (top-level = org's direct share). Control flags are per-node; equity multiplies down the chain.
34. **Onboarding uses a `.lean()` + completed=true fallback for pre-wizard orgs** (§32) — `getOnboarding` reads the org with `.lean()` so an org with NO `onboarding` subdoc (pre-wizard) is treated as `completed=true` (no wizard); new orgs get the schema default `completed=false` → wizard shows. `shouldShowWizard = !completed && !skipped`. **Do not add a migration that materializes the subdoc on old orgs** — it would re-trigger the wizard for them. The wizard's confirm-dialog buttons (Reopen) block headless eval — override `window.confirm` in tests.

## 5. Current goal state (report order) — what's left

**Phase 0 (P0): complete.** Every P0 has a working implementation or a documented deferral. Fully done: GWP sets + per-gas engine, audit trail, lock/immutability, exclusions, Scope-2 dual, Egyptian-default, the ~1,192-factor library, estimation + PCAF DQ, snapshots, the GHG inventory report (JSON/markdown/PDF/DOCX/XLSX), the assurance package, completeness + relevance, the reporting-year/inventory object (§31), and the onboarding wizard (§32). **Remaining P0 sub-items are partial-with-documented-deferral** (not blocking): factor *version* pinning for deterministic recompute (§2.1), spend-EEIO sector mapping + Cat-3 T&D factor (§2.4), mobile distance/fleet + fugitive material-balance (§2.2), primary-vs-secondary share *per category* (§5 — overall share + PCAF DQ already exist), calculation-lineage drill-down UI (§7), inline §4.2-depth per-input sourcing help (§10 — the wizard advanced this), encryption/backups (deploy, §7).

**Phase 1: P1-1 → P1-8 done + §1.2 entity hierarchy done.** See the §3 table, §3a and gap-analysis §14–§34.

### 5a. DONE THIS SESSION — §1.3 biogenic CO₂ (§35), §1.4 per-gas breakdown (§36), §2.2 fugitive material balance (§37)

Both shipped and verified (see gap-analysis §35/§36 for full detail + hand-computed evidence). Summary:
- **§1.3 biogenic CO₂ tracked separately (commits `1e44df1`, `46d3f43`, `ea516ee`, docs `9d7cc07`):** `computePerGasEmissions` splits the CO₂ of a `factor.metadata.biogenic` factor out of the scope CO₂e into `biogenicCO2` (biomass CH₄/N₂O stay in Scope 1, standard GWP). Persisted on `ICalculationEntry.biogenicCO2`; reported as a memo OUTSIDE the scope totals in JSON/markdown/PDF/DOCX/XLSX + ESRS E1-6; surfaced in the calculator result + Reports preview. Closes failure-mode #7. **Decision noted:** biomass CH₄ uses the standard fossil `gwp.ch4` (conservative), not the `ch4Biogenic` value — `ch4Biogenic` for biomass entries is a documented future refinement.
- **§1.4 per-gas breakdown (commits `c5e21af`, `69043c1`):** per-gas masses snapshotted on `ICalculationEntry.gasBreakdown {co2,ch4,n2o}` at save; `report.emissions.perGas` gives mass + CO₂e-by-gas (under the report GWP set) + a per-gas subtotal + a `co2eNotSeparated` remainder for CO₂e-denominated factors (which can't be split). Per-gas table in markdown/PDF/DOCX + a new XLSX **Per-Gas Breakdown** sheet; report preview table + a calculator per-gas line. **Limitation:** entries saved before §1.4 have no `gasBreakdown`, so historical periods (incl. demo 2026) show `perGas.available=false` and report the whole total as `co2eNotSeparated` (honest; populates for new calcs).
- **§2.2 fugitive material balance (commits `64de189`, `b785d65`):** `computeMaterialBalance` derives released refrigerant mass = purchases + (inventoryStart − inventoryEnd) − chargedIntoEquipment − recovered (clamped ≥ 0) from `metadata.materialBalance` on a Fugitive entry, × the selected DEFRA blend factor (the 360-factor blend library already existed, §16). Server recomputes from metadata (client `value` can't spoof). Method `material-balance`; components + released kg persisted on `ICalculationEntry.materialBalance`; calculator gains a material-balance mode. **Blend library was already present — this is the calculator only.**

### 5b. IMMEDIATE NEXT STEP — in report order (P1 → P2), remaining open items
1. **§2.x calc-engine partials** — fugitive material-balance **DONE (§37)**. Remaining are **DATA-DEPENDENT** (flagged to the user, awaiting datasheets — never fabricate, policy #2): (a) **mobile distance-based + fleet registry** needs vehicle-km factors (kg CO₂e/vehicle-km by type/fuel) under Mobile Combustion — DEFRA's car/van/HGV-km rows are the natural source (same workbook already imported); (b) **spend-based EEIO** needs an EEIO sector factor table (US EPA EEIO v2 / EXIOBASE / national IO) + a currency/inflation deflator; (c) **Cat-3 T&D** needs an Egypt grid T&D loss rate (a UK T&D factor already exists under FERA).
2. **§3 factor version history** [P1] — an immutable factor-version table (edits overwrite today) → unblocks deterministic recompute of locked inventories (§2.1).
3. **§4.3 evidence attachments per data line** [P1] — file storage keyed to `Calculation.data[i]` (the assurance package flags this open). Storage decision: Mongo GridFS vs object store vs filesystem volume. Plus outlier/duplicate detection on import + spend double-counting guard (failure-mode 10).
4. **§5 DQ** — primary-vs-secondary share *per category* [P0-marked, minor]; YoY DQ improvement tracking; qualitative uncertainty (P2 Monte Carlo).
5. **§7 platform** — calculation-lineage drill-down UI; SSO/SCIM (needs an IdP); encryption/backups (deploy).
6. **§8 reporting** — dashboards with entity/site drill-down + Pareto.
7. **§10 UX** — persona modes (enterprise/consultant/SME views) [P1]; inline §4.2-depth per-input sourcing help; glossary/method page (P2).
8. **Factor-table tail** (P1-7 remainder, §28) — EPA Tables 3/4/5 mobile CH4/N2O (need vehicle-type + model-year input dimension); EFDB-USA curation (gotcha 5); eGRID non-baseload + grid-loss T&D.
9. **Instrument registry (RECs/PPAs)** — only when expanding the Scope-2 market method **beyond Egypt** (Egypt has no contractual-instrument market; the dual method already falls back to grid-average). Conditional/deferred.

### 5c. Completed in the most recent full session (context only; all in gap-analysis §31–§34)

- **Reporting-year / inventory object** (§31, `3242e6b`→`e81a8c4`) — model + migration, lifecycle, base year + 5% recalc engine, per-year GWP pinning, hard publish gate, Reporting Years tab.
- **Guided onboarding wizard** (§32, `6592ddc`,`71811bc`) — onboarding state + endpoints, 6-step wizard + auto-show gate.
- **Multi-level entity hierarchy + consolidation** (§33, `b9b62b5`→`fe4718e`) — nested Facility tree, consolidation roll-up service + report block + endpoint, Entities & Facilities tab.
- **Full verification pass** (§34, fix `421732a`) — 10 suites, ~132 assertions + in-browser; fixed the binary exports' missing consolidation block.

## 6. Known demo-data / test debris (safe to keep; wipe selectively if presenting)

**Demo org (`demo@carbonytics.com`) 2026 baseline (known-good; re-confirm with §8):** total **9,193.02 kg CO₂e**, scopes **4,482.64 / 3,840.38 / 870**, Scope 2 dual **966.38 loc / 1,050.38 mkt**, weighted DQ **3.72**, **4 locked / 3 verified**, completeness **100%**, supplier-specific share **≈9.5%**, intensity revenue **1.8386e-4 kg/EGP**, consolidated == gross (wholly owned).

- **Reporting-year inventories (demo, 10):** **2025 = Published + base year (frozen AR6, threshold 5%)**; **2026 = draft, the 9,193.02 baseline (untouched)**; 2018/2019/2022/2023/2024/2027 = draft throwaway years carrying verification calcs (lifecycle/gate/recalc/consolidation tests); **2029 = draft, one biomass calc (§35 verify: Landfill Gas → scope 267.35 kg, biogenic 52,070 kg)**; **2030 = draft, one per-gas calc (§36 verify: anthracite + landfill + grid electricity, total 3,346.49 kg)**; **2031 = draft, one fugitive material-balance calc (§37 verify: 65 kg refrigerant released → 135,720 kg)**. 2019 has a v1 InventorySnapshot. The §8 baseline only depends on 2026.
- **Entity hierarchy (demo, 3 nodes):** **Cairo HQ** (site, org, 100%); **QA Nile Subsidiary** (subsidiary, org, 60%); **QA Alexandria Plant** (site, child of Nile Subsidiary, 50% → equity 30%). One 2022 calc (458 kg) is tagged to Alexandria for the equity/M&A demo.
- **Onboarding:** demo `onboarding.completed=true` (no wizard). Fresh tenant **`ob.wizard@carbonytics.com`** / `ObWizard!2026` ("OB Wizard Test Org") exists to test the wizard (its onboarding is intentionally incomplete).
- **Config:** 4 relevant categories screened (Electricity, Purchased Goods, Mobile, Fugitive); 2 exclusions (one pinned to Fugitive via categoryId → 100% completeness); 1 target ("30% reduction by 2030" → SBTi demo); 4 denominators (revenue 40M/50M EGP + employees 100/120 FTE for 2025/2026).
- **Suppliers (5; 3 active):** showcase **"QA Misr Cement"** (fulfilled 2026 request → "Misr Cement cradle-to-gate" 0.85 kg supplier factor; declined 2025 request). Others are harmless verification extras.
- **Users (demo org, 2):** `demo@carbonytics.com` (admin) + **`qa.viewer@carbonytics.com`** / `QaViewer!2026` (role **verifier** — use for read-only/verify/role-gating demos).
- **Separate test tenants (multi-tenant isolation):** **QA Org Two** (`qa.org2@carbonytics.com`/`Org2Pass123`), **QA Completeness Org** (`qa.comp@carbonytics.com`/`CompPass123`), **QA SBTi Org** (`qa.sbti@carbonytics.com`/`SbtiPass123`, scope-3-dominant). Fully isolated; ignore or drop.
- Audit rows exist for all the above. `docs/ENTERPRISE_GAP_ANALYSIS.md` has mojibake artifacts in early sections (Windows-1252/UTF-8 round-trips) — content accurate. Mongoose duplicate-index warnings (`email`, `factorCode`) are harmless.
- **Reset to clean demo (optional):** re-run targeted insert scripts (NOT `seedBasicData` — gotcha 11); soft-deactivate QA suppliers via UI; drop the 3 test tenants + throwaway inventory years from Mongo. Not required for development.

## 7. Outside-the-code action items (user-owned)

1. 🔴 **Rotate the GitHub PAT embedded in the git remote URL** (`.git/config`) — treat as compromised; do not push until rotated, then rewrite the remote (credential manager or SSH).
2. `docker-compose.prod.yml` was never aligned with the new env contract (JWT pair, COOKIE_SECURE, Vite build) — required before any real deploy, with HTTPS, real secrets, Mongo auth, backups.
3. Consider `npm ci` in Dockerfiles now that lockfiles are committed.

## 8. Verification pattern for the new session (smoke test)

Run after `docker compose up -d`. All values are the current known-good baseline (§34 / V10).

```powershell
$base='http://localhost:8080'; $ct='application/json'
$H=@{Authorization="Bearer $((Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType $ct -Body (@{email='demo@carbonytics.com';password='Demo!2026Pass'}|ConvertTo-Json)).data.accessToken)"}
(Invoke-RestMethod "$base/api/emission-factors?limit=1" -Headers $H).pagination.total           # 1192 (org-scoped; drifts)
$rep=(Invoke-RestMethod "$base/api/reports/ghg-inventory?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data
$rep.emissions.byScope        # scope1 4482.64 / scope2 3840.38 / scope3 870 / total 9193.02
$rep.emissions.scope2Dual     # locationBased 966.38 / marketBased 1050.38
$rep.dataQuality.weightedDqScore                                # 3.72
$rep.intensity.metrics[0].intensityKgCo2ePerUnit               # 0.00018386 (revenue)
$rep.inventoryControls         # lockedCalculations 4 / verifiedCalculations 3
$rep.consolidation             # grossTotal 9193.02 == consolidatedTotal 9193.02 (wholly owned), approach operational_control
$rep.inventory                 # reportingYear 2026, status 'draft', gwpSetPinned false
# Egyptian default
$cats=(Invoke-RestMethod "$base/api/emission-categories" -Headers $H).data.categories
$elec=($cats|?{$_.category -eq 'Purchased Electricity'}).id; $stat=($cats|?{$_.category -eq 'Stationary Combustion'}).id; $mob=($cats|?{$_.category -eq 'Mobile Combustion'}).id
$ec=(Invoke-RestMethod "$base/api/calculations/calculate" -Method Post -ContentType $ct -Headers $H -Body (@{categoryId=$elec;value=100;unit='kWh'}|ConvertTo-Json)).data
"$($ec.factor.region) gwp=$($ec.provenance.gwpApplied)"        # egypt gwp=embedded
# EPA unit engine (find by factorCode in /api/emission-factors?limit=2000): per-gas, hand-checked
#   EPA25F_STAT_ANTHRACITE_SHORT_TON 1 short ton -> 2621.14 ; EPA25F_STAT_NATURAL_GAS_MMBTU 1000 mmBtu -> 53117.1 ; EPA25F_EGRID_AKGD 1000 kWh -> 410.43
# Estimation rungs (gotcha 18): Mobile Sep-2026 -> 440 (rung1); Dec-2026 -> 550 (rung3)
(Invoke-RestMethod "$base/api/reports/completeness?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.completenessPercent   # 100
(Invoke-RestMethod "$base/api/suppliers" -Headers $H).data.engagement.dataIntegrated                                              # 3
(Invoke-RestMethod "$base/api/reports/cdp?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.C6_emissions_data.'C6.1 Scope 1 (t CO2e)'   # 4.483
(Invoke-RestMethod "$base/api/reports/sbti?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.inventory.scope3SharePercent               # 9.5
(Invoke-RestMethod "$base/api/reports/esrs?startDate=2026-01-01&endDate=2026-12-31" -Headers $H).data.'E1-6 gross GHG emissions'.'Total GHG emissions, market-based (t CO2e)'  # 9.193
# --- inventory object (§31) ---
$inv=(Invoke-RestMethod "$base/api/inventories" -Headers $H).data
$inv.inventories | ? { $_.reportingYear -in 2025,2026 } | % { "$($_.reportingYear) $($_.status) base=$($_.isBaseYear) total=$($_.current.total)" }   # 2025 published base=True ; 2026 draft total=9193.02
# recalc on the published base year 2025 -> 0% within 5%
($inv.inventories | ? { $_.reportingYear -eq 2025 }).id | % { (Invoke-RestMethod "$base/api/inventories/$_/recalculation-check" -Headers $H).data.exceedsThreshold }   # False
# --- consolidation (§33) ---
(Invoke-RestMethod "$base/api/reports/consolidation?startDate=2022-01-01&endDate=2022-12-31&approach=equity_share" -Headers $H).data.consolidatedTotal   # 167.4 (Alexandria 30% of 458 + 30 unassigned)
# --- onboarding (§32) ---
(Invoke-RestMethod "$base/api/organizations/onboarding" -Headers $H).data.shouldShowWizard       # False (demo completed)
```
**UI spot-check (`:8080` → Compliance):** **9 tabs** (Reports, **Reporting Years**, Completeness, Exclusions, Facilities[**Entities & Facilities**], Suppliers, Intensity & Denominators, Snapshots, Audit Trail[admin]). Reporting Years: create / Draft↔Review / Publish (hard-gate banner on gappy years) / Reopen / Set base year + threshold / Recalculation check. Entities & Facilities: hierarchy table + Consolidation roll-up panel (year + approach selectors). Reports: GHG report in PDF/Word/Excel/Markdown (each now carries the Consolidation block). Onboarding wizard auto-shows for a fresh admin (`ob.wizard@…`); demo never sees it. **Role gate:** `qa.viewer` (verifier) gets 403 on inventory/facility/onboarding mutations, reads allowed; a different tenant (`qa.org2`) gets 404 on demo objects.
