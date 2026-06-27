# Carbonytics — Pre-Merge Code Review Plan (`remediation` → `master`)

**Created:** 2026-06-27 · **Reviewer:** Claude Code (Opus 4.8) with MohShalaby92 · **Status:** IN PROGRESS

> This is the **source of truth and live tracker** for the comprehensive review of the
> `remediation` branch before it merges to `master`. Update the checkboxes and the
> Findings Log as the review proceeds. The review is **not done** until every box in
> the Coverage Matrix is ticked, every Finding is Resolved or Accepted, and the
> Sign-off table is all-green.

---

## 0. Branch facts (the thing under review)

| Fact | Value |
|---|---|
| Merge-base (fork point) | `f214b51` |
| Commits on `remediation` since `master` | **136** |
| Files changed | **207** |
| Lines | **+38,549 / −3,117** |
| Nature | The branch lands the **entire enterprise build (§1–§53)** on top of an MVP `master` — engine, methodology services, reports/exports, multi-tenant RBAC, inventory/lifecycle, import/export, full frontend, and production deploy/infra. |
| Baseline invariant | Demo org 2026 = **9,193.02 kg CO₂e**; jest **128/128**; both TS gates clean. |
| Merge constraint | **Do NOT push/merge** until this plan is all-green AND the user's `/code-review ultra` (ultrareview) is run and its findings addressed (§7 action item / handoff). |

**Diff command of record** (every line under review is the output of this):
```
git diff master...remediation        # three-dot: everything remediation introduces since the fork point
```

---

## 1. Goals (definition of done)

A merge is approved only when ALL of the following are demonstrably true:

1. **Correctness** — every changed line of logic does what it claims; numbers are reproduced by hand or by an independent computation, not just "looks right". No silent wrong answers.
2. **Functionality** — every new endpoint/screen/flow works end-to-end (API + in-browser), including empty/error/edge inputs.
3. **Coherence** — front-end and back-end contracts agree (types, shapes, status codes); naming/idioms are consistent; no dead or orphaned code; docs match reality.
4. **Test proof** — new logic has tests; tests are meaningful (assert values + HTTP status, not just truthiness); the suite passes **repeatedly** and the §8 regression holds across **multiple scenarios** (periods, personas, tenants, GWP sets).
5. **Security** — authn/authz and **multi-tenant isolation** are enforced on every route; inputs are validated; no injection (NoSQL / spreadsheet-formula / path); file uploads are bounded; **no secrets or cross-tenant data leak** in code, logs, exports, or error bodies; rate limiting and cookie/JWT hardening are intact.
6. **Traceability** — every changed file is assigned to exactly one review increment (Coverage Matrix); every finding is logged, classified, and tracked to closure.
7. **Completeness** — **not a single changed line is left unreviewed.** The union of the file-owning increments equals the full 207-file diff (verified by the partition check in §10).

**Non-negotiable policies that the review must confirm are NOT regressed** (handoff §1): Egyptian-default factor tiering; never fabricate factor values; no GWP double-application; estimates stay distinguishable; locked calcs immutable; consolidation is report-time only; biogenic CO₂ is a memo item.

---

## 2. Method & tooling (use all of these)

- **Read every diff hunk** per file with `git diff master...remediation -- <file>` (not just the final file — the *delta* is what's being merged). For files that are 100% new, read the whole file.
- **Static gates:** `tsc --noEmit` (both packages), `jest`, production `docker build`, `npm audit`, dependency/lockfile diff, secret-pattern scan over the diff.
- **Dynamic API checks:** PowerShell/`curl.exe` against the live dev stack on `:8080` with **hand-computed expected values** and **asserted HTTP status** (gotcha 45).
- **In-browser checks:** the `.claude/launch.json` `carbonytics-frontend` dev preview (gotcha 39: re-login after a stack restart).
- **Adversarial checks:** craft hostile inputs (cross-tenant ids, malformed bodies, oversize/200-type files, formula payloads, NoSQL operators, path traversal, weak secrets) and assert they fail closed.
- **Prod-stack checks:** boot the isolated `-p carbonytics-prod` stack (gotchas 57/58) for the deploy/infra increment.
- **Independent multi-agent pass:** the user runs **`/code-review ultra`** (ultrareview) — its findings feed the Findings Log here. The local **`/security-review`** skill is run for INC-7.
- **Re-test discipline:** each correctness/security scenario is run **at least twice** and, where state matters, under **different scenarios** (e.g. a different period/tenant/persona) to catch order- and cache-dependence (Redis cache, rolling dashboard window — gotcha 47).

**Per-increment workflow loop** (repeat until the increment's exit criteria are met):
```
pick increment → read every assigned diff hunk → note questions/risks
   → design checks (incl. ≥1 adversarial + ≥1 repeat-under-different-scenario)
   → run checks (static + dynamic + in-browser as applicable)
   → log findings (Sev 1–4) → fix Sev-1/2 (or file as blocker) → re-verify
   → tick the Coverage Matrix boxes → mark the increment task done
```

**Finding severity:** **S1 blocker** (correctness/security/data-leak — must fix before merge) · **S2 major** (wrong behavior on a real path — fix before merge) · **S3 minor** (edge/cosmetic — fix or explicitly accept) · **S4 nit** (style/docs — optional).

---

## 3. Increments (goals, scope, exit criteria)

Increments **INC-1…INC-6, INC-8(tests), INC-9(docs)** are *file-owning* and together partition all 207 files (the completeness guarantee). **INC-0, INC-7, INC-10** are *cross-cutting* passes that own no files but gate the merge.

### INC-0 — Baseline & automated gates
- **Goal:** establish a green, reproducible baseline and run every cheap automated signal before manual review.
- **Checks:** both `tsc --noEmit`; `jest` ×2 (stability); `git diff --numstat` partition sanity; `npm audit` (backend + frontend); lockfile/dependency-change review; secret-pattern scan over the diff (`git diff master...remediation` grepped for keys/tokens/passwords); production `docker compose build` (dev) + note prod build deferred to INC-6; capture the §8 baseline (9,193.02 / scopes / jest 128).
- **Exit:** all gates green or every red item logged as a Finding; baseline numbers recorded.

### INC-1 — Data layer (models, types, scripts, config, seed/data)  — **27 files**
- **Goal:** schemas are sound (indexes, required/enums, immutability guards, tenant scoping fields); migrations/importers are idempotent + non-destructive (gotcha 11) and never fabricate factor values (policy #2); back-end types match the models.
- **Scope:** `backend/src/models/*` (15), `backend/src/types/*` (1), `backend/src/scripts/*` (9), `backend/src/config/*` (1), `backend/src/data/*` (1).
- **Key risks:** immutability guards (Calculation/EmissionFactorVersion update/delete throws); `timestamps` $set/$setOnInsert in guards (gotcha 2); importer GWP handling (policy #3) + unit normalization (gotcha 35); `seedBasicData` destructive (gotcha 11); index duplication warnings.
- **Exit:** every model + script hunk read; importers re-run idempotency reasoned/spot-checked; no fabricated-value path.

### INC-2 — Core domain & methodology services  — **14 files**
- **Goal:** the calculation engine + all pure methodology services are mathematically correct, fail loud on bad inputs, and never double-apply GWP / never silently fill gaps.
- **Scope:** `calculationEngine`, `calculationPersistence`, `completenessService`, `consolidationService`, `dataQuality`, `estimationService`, `evidenceStorage`, `factorVersioning`, `importMapping`, `importQuality`, `inventoryService`, `lineage`, `pedigree`, `tokenStore`.
- **Key risks:** per-gas×GWP vs embedded path (policy #3); factor-tier selection (policy #1); km/L fail-loud (gotcha 35); material-balance recompute-from-metadata (gotcha 36); consolidation is report-time, never mutates stored emissions (gotcha 32); estimation rung order (gotcha 18); pedigree additive + conservative unknown=5 (gotcha 49); tokenStore (refresh-token revocation, rotation).
- **Exit:** each service's core function re-derived against ≥2 hand-computed scenarios incl. one adversarial (spoofed value, wrong unit, cross-tenant factor).

### INC-3 — Reports, renderers & import/export I/O  — **9 files**
- **Goal:** every report reconciles to the canonical totals across all formats; exports are round-trippable and injection-safe; the report controller's `exports` map (gotcha 55) is consistent.
- **Scope:** `reportController`, services `reportKit`, `reportRenderers`, `frameworkRenderers`, `assuranceRenderers`, `importExportKit`, `csvService`, assets `brandIcon.ts`/`brandIconWhite.ts`.
- **Key risks:** byCategory/dataSources/pedigree reconciliation; PDF `pdfSafe` WinAnsi (gotcha 29); CSV formula injection (§51); export⇄import round-trip lossiness (§51); XLSX cell-setter 0/1-based trap (gotcha 56); format/Content-Type/Content-Disposition correctness + HTTP status.
- **Exit:** all 6 reports × pdf/docx/xlsx re-parsed (magic bytes + a known value); export.csv reconciles; a hostile `notes`/`title` field exports neutralized; round-trip reproduces the number.

### INC-4 — API surface (controllers, routes, middleware, utils, server)  — **29 files**
- **Goal:** every route enforces authn + correct role authz + **tenant scoping**; inputs validated; errors mapped to correct status (no 500-for-400, gotchas 43/45); audit trail written on mutations; rate limiting + security middleware intact.
- **Scope:** `controllers/*` (10, excl. reportController→INC-3), `routes/*` (11), `middleware/*` (4: auth, cache, errorHandler, metrics), `utils/*` (3: audit, jwt, security), `server.ts`.
- **Key risks:** cross-tenant read/write (every `find` must scope `organizationId`); role gate present AND ordered (vehicles validate-before-authorize nit, gotcha 61); immutability/published-year guards on write paths; metrics cardinality (no raw ObjectIds in labels); cache keys are tenant-scoped; JWT secret strength refusal; cookie flags.
- **Exit:** for every mutating route, a verifier→403 and a cross-tenant→404 check; for every list route, a tenant-isolation check; error-path status codes asserted.

### INC-5 — Frontend (pages, components, services, hooks, types, assets)  — **76 files**
- **Goal:** screens render and function; API calls read the right response shapes (gotchas 8/14/25); no console errors; auth/persona gating correct; no client-trust security gaps (server is authoritative).
- **Scope:** `frontend/src/pages/*` (36), `components/*` (17), `services/*` (4), `hooks/*` (3), `constants/*` (2), `types/*` (2), `utils.test.ts` (1), `assets/*` (1), top-level singletons (10: App.tsx, main.tsx, index.*, setupTests, reportWebVitals, *-env.d.ts, App.test/App.css).
- **Key risks:** `.lean()` `_id` vs `id` (gotcha 8/42); paginated shape (gotcha 25); `data.categories` (gotcha 14); blob download bytes (gotcha §50 follow-up); multipart `postForm` (gotcha 43); persona is presentation-only (gotcha 48); XSS via any `dangerouslySetInnerHTML`; token never logged/persisted insecurely.
- **Exit:** every Compliance tab + dashboard + calculator + import/export + settings exercised in-browser (0 console errors); each FE service method's shape cross-checked to its BE controller.

### INC-6 — Deploy, infra, build & secrets  — **42 files**
- **Goal:** the dev + prod compose stacks, web server configs, DB/cache hardening, backup/restore, monitoring, Dockerfiles, build configs and committed example envs are correct and **leak no secrets**.
- **Scope:** `docker-compose.yml`, `docker-compose.prod.yml`, `nginx/nginx.conf`, `frontend/nginx.conf`, `mongo/mongod.conf`, `mongo/init/01-app-user.sh`, `redis/redis.conf`, `backup/backup.sh`, `monitoring/prometheus.yml`, `scripts/*.sh` (3), `backend/Dockerfile`+`.dockerignore`, `frontend/Dockerfile`+`.dockerignore`, `.env.example`/`.env.production.example`/`.env.monitoring.example`, `.gitignore`, `.gitattributes`, `.claude/launch.json`, frontend build configs (`vite.config.ts`, `tsconfig*.json`, `tailwind/postcss.config`, `index.html`, `package.json`), `frontend/public/*` (10), backend `package.json`, both `package-lock.json` (audit-only, not line-by-line).
- **Key risks:** **no real secret committed** (only `.example`); least-priv Mongo user + Redis auth; TLS/HSTS; healthcheck IPv4 (gotcha 61); `/metrics` not publicly routed; backup auth-aware + retention; `.dockerignore` excludes secrets/node_modules; image base pinning.
- **Exit:** isolated prod stack boots all services healthy (gotcha 57); secret-scan over committed env/config files is clean; prod `docker build` succeeds; tear down `down -v`.

### INC-7 — Security threat-model & adversarial pass (cross-cutting)
- **Goal:** an explicit, structured attack pass over the whole surface (not just per-file).
- **Checks (each fails closed, tested ≥2×):** (a) **AuthN** — no route reachable without a valid token; expired/forged/none. (b) **AuthZ/RBAC** — viewer/verifier cannot mutate; admin-only settings gated. (c) **Multi-tenant isolation** — org A cannot read/write/export/trace org B's calcs, factors, evidence, inventories, suppliers, vehicles, audit. (d) **Injection** — NoSQL operator injection in query params/bodies; spreadsheet-formula in CSV export; path traversal in any file path / factor-id / evidence id. (e) **File upload** — type/size limits → 400 not 500; malicious xlsx/csv. (f) **Secrets/leak** — no token/secret/PII in logs, error bodies, or exports; stack traces not leaked in prod. (g) **JWT/cookie** — secret-strength refusal; HttpOnly/Secure/SameSite; refresh rotation + revocation (Redis). (h) **DoS/limits** — rate limiter; large-body guard. Run the **`/security-review`** skill and fold its output in.
- **Exit:** every category has a passing adversarial test recorded in the Findings Log; any gap is S1/S2 fixed.

### INC-8 — Test adequacy & multi-scenario re-runs  — owns **8 test files**
- **Goal:** the test suite genuinely protects the new logic and is stable.
- **Scope:** `backend/tests/*` (8). Plus: identify untested critical paths and add adversarial/regression tests where a S1/S2 gap is found.
- **Checks:** read each test file (assertions meaningful?); map tests→services (coverage gaps); run `jest` **3×** (flaky/order check); run the §8 smoke under **≥3 scenarios** (2026 + a per-gas year + a consolidation year; enterprise + SME persona; demo + a second tenant).
- **Exit:** suite green 3× running; every S1/S2 logic path has a test; scenario matrix recorded.

### INC-9 — Coherence, contracts, dead-code & docs  — owns **2 docs files**
- **Goal:** end-to-end consistency and accurate documentation.
- **Scope (files owned):** `docs/HANDOFF.md`, `docs/ENTERPRISE_GAP_ANALYSIS.md`. **Cross-cutting checks:** FE↔BE type/contract parity; consistent error envelope (`success`/`error`); audit-log coverage on all mutations; no orphaned exports / unused code introduced; handoff & gap-analysis claims match the actual code (spot-verify ≥10 specific claims).
- **Exit:** contract mismatches = 0 (or logged); ≥10 doc claims verified true against code.

### INC-10 — Final regression & sign-off (cross-cutting)
- **Goal:** prove nothing regressed and close the review.
- **Checks:** full §8 smoke (dev) all-green; jest 128; both TS gates; prod-stack §52 recipe green; Coverage Matrix 100% ticked; Findings Log has no open S1/S2; partition check (§10) passes; ultrareview findings all addressed.
- **Exit:** Sign-off table all-green → **merge-ready**.

---

## 4. Coverage Matrix (every changed file → owning increment)

Tick a box when **every diff hunk** of that file has been reviewed and its checks recorded. `(new)` = file is 100% new (read whole file); otherwise review the delta.

### INC-1 · Data layer (27)
- Models (15): [x] AuditLog [x] Calculation [x] CalculationSnapshot [x] EmissionCategory [x] EmissionFactor [x] EmissionFactorVersion [x] Evidence [x] Facility [x] IndustryBenchmark [x] Inventory [x] InventorySnapshot [x] Organization [x] Supplier [x] User [x] Vehicle
- Types (1): [x] backend/src/types/index.ts
- Scripts (9): [x] backfillFactorVersions [x] createDemoUser [x] importEfdbGhgp [x] importEpaFuels [x] importEpaHub [x] importFactorLibrary [x] migrateInventories [x] seed [x] seedBasicData
- Config/data (2): [x] backend/src/config/config.ts [x] backend/src/data/gwpSets.ts

### INC-2 · Core domain & methodology services (14)
- [x] calculationEngine [x] calculationPersistence [x] completenessService [x] consolidationService [x] dataQuality [x] estimationService [x] evidenceStorage [x] factorVersioning [x] importMapping [x] importQuality [x] inventoryService [x] lineage [x] pedigree [x] tokenStore

### INC-3 · Reports, renderers & import/export I/O (9)
- [x] reportController [x] reportKit [x] reportRenderers [x] frameworkRenderers [x] assuranceRenderers [x] importExportKit [x] csvService [x] assets/brandIcon.ts [x] assets/brandIconWhite.ts

### INC-4 · API surface (29)
- Controllers (10): [x] authController [x] calculationController [x] csvController [x] emissionCategoryController [x] emissionFactorController [x] evidenceController [x] inventoryController [x] organizationController [x] supplierController [x] vehicleController
- Routes (11): [x] auth [x] calculations [x] csv [x] emissionCategories [x] emissionFactors [x] evidence [x] inventories [x] organizations [x] reports [x] suppliers [x] vehicles
- Middleware (4): [x] auth [x] cache [x] errorHandler [x] metrics
- Utils (3): [x] audit [x] jwt [x] security
- [x] server.ts

### INC-5 · Frontend (76)
- Pages — top (2): [x] GlossaryPage [x] ImportExportPage
- Pages — calculations (3): [x] CalculationPage [x] CalculationSummary [x] CategorySelector
- Pages — compliance (14): [x] AuditLogTab [x] CompletenessTab [x] CompliancePage [x] DataQualityTab [x] DenominatorsTab [x] EvidenceTab [x] ExclusionsTab [x] FacilitiesTab [x] FleetTab [x] InventoriesTab [x] LineageTab [x] ReportsTab [x] SnapshotsTab [x] SuppliersTab
- Pages — dashboard (13): [x] CategoryAnalysis [x] CompletenessCard [x] DashboardPage [x] EmissionOverview [x] EntityBreakdown [x] ParetoAnalysis [x] QualityIndicators [x] QuickCalculator [x] RecentCalculations [x] ScopeBreakdown [x] TargetsModal [x] TargetsProgress
- Pages — settings (5): [x] GeneralSettings [x] OrganizationSettingsTab [x] ProfileSettings [x] SettingsPage [x] UserManagement
- Components (17): [x] auth/LoginPage [x] dashboard/EmptyState [x] forms/EmissionCalculationForm [x] forms/FileUpload [x] layout/Navbar [x] onboarding/OnboardingGate [x] onboarding/OnboardingWizard [x] ui/Alert [x] ui/Badge [x] ui/Button [x] ui/Card [x] ui/ChartContainer [x] ui/Input [x] ui/LoadingSpinner [x] ui/Modal [x] ui/Select [x] ui/Textarea
- Services (4): [x] api [x] calculationService [x] complianceService [x] organizationService
- Hooks (3): [x] useAuth [x] usePersona [x] useTheme
- Constants (2): [x] constants/index [x] constants/sourcingGuidance
- Types (2): [x] types/index [x] types/calculations
- Singletons (10): [x] App.tsx [x] App.css [x] App.test.tsx [x] main.tsx [x] index.tsx [x] index.css [x] setupTests.ts [x] reportWebVitals.ts [x] vite-env.d.ts [x] react-app-env.d.ts
- Assets (1): [x] assets/brand/carbonytics-icon.png *(binary — visual check)*
- Test (1): [x] utils/utils.test.ts

### INC-6 · Deploy, infra, build & secrets (42)
- Compose (2): [ ] docker-compose.yml [ ] docker-compose.prod.yml
- Web servers (2): [ ] nginx/nginx.conf [ ] frontend/nginx.conf
- DB/cache (4): [ ] mongo/mongod.conf [ ] mongo/init/01-app-user.sh [ ] redis/redis.conf [ ] *(redis auth wiring)*
- Backup/monitoring (5): [ ] backup/backup.sh [ ] scripts/backup-production.sh [ ] scripts/restore-data.sh [ ] scripts/gen-self-signed-cert.sh [ ] monitoring/prometheus.yml
- Docker build (4): [ ] backend/Dockerfile [ ] backend/.dockerignore [ ] frontend/Dockerfile [ ] frontend/.dockerignore
- Env examples (3): [ ] .env.example [ ] .env.production.example [ ] .env.monitoring.example
- Repo config (3): [ ] .gitignore [ ] .gitattributes [ ] .claude/launch.json
- Frontend build (8): [ ] vite.config.ts [ ] tsconfig.json [ ] tsconfig.node.json [ ] tailwind.config.js [ ] postcss.config.js [ ] frontend/index.html [ ] frontend/package.json [ ] frontend/package-lock.json *(audit-only)*
- Backend build (2): [ ] backend/package.json [ ] backend/package-lock.json *(audit-only)*
- Public assets (10): [ ] android-chrome-192 [ ] android-chrome-512 [ ] apple-touch-icon [ ] favicon-16 [ ] favicon-32 [ ] favicon.ico [ ] icon.png [ ] public/index.html [ ] site.webmanifest [ ] theme-init.js

### INC-8 · Tests (8, owned here; reviewed for adequacy)
- [ ] dataQuality.test [ ] engineSession.test [ ] factorRecompute.test [ ] factorVersioning.test [ ] importMapping.test [ ] importQuality.test [ ] lineage.test [ ] pedigree.test

### INC-9 · Docs (2)
- [ ] docs/HANDOFF.md [ ] docs/ENTERPRISE_GAP_ANALYSIS.md

**Partition check (run at INC-10):** `INC-1(27)+INC-2(14)+INC-3(9)+INC-4(29)+INC-5(76)+INC-6(42)+INC-8(8)+INC-9(2) = 207` = total changed files. ✅ when every box above is ticked.

---

## 5. Security checklist (INC-7, cross-cutting — keep all ticked at sign-off)

- [x] No route reachable without authentication (expired/forged/missing token → 401). *(unauth→401, forged alg:none→401)*
- [x] RBAC: viewer/verifier cannot mutate; admin-only settings/users gated; tested per mutating route. *(verifier→403 on calc-create AND csv-import after F-009 fix)*
- [x] Multi-tenant isolation on **read, write, export, trace, download**: calculations, factors, evidence, inventories, suppliers, snapshots, lineage. *(org2 → 404/empty on all 10 demo-resource probes; data protected)*
- [x] NoSQL operator injection rejected. *(`{$ne:null}` login → 400)*
- [x] Spreadsheet-formula injection neutralized in CSV export. *(§51; `'`-prefix on `= + - @`)*
- [x] Path traversal impossible in evidence/file/factor-id handling. *(GridFS ObjectId; filename encoded)*
- [x] File upload: bad type/oversize → 400 (not 500). *(csv bad-type → 400, gotcha 45/§43)*
- [x] No secret/token/PII in logs, error responses, or exports. *(F-010 fixed: generic 5xx in prod; stack dev-only)*
- [x] JWT: weak-secret refusal; access/refresh split; refresh rotation + Redis revocation. *(F-006 fixed: fail-closed revocation; prod refuses weak secrets)*
- [x] Cookies: HttpOnly + Secure (prod) + SameSite; CORS single-origin. *(HttpOnly; SameSite=Strict; Path=/api/auth; Secure prod-only; CORS=CLIENT_URL)*
- [~] Rate limiting active; large-body guard; `/metrics` not publicly routed (prod). *(rate-limit + 10mb limit verified INC-4; `/metrics`-not-public → INC-6 prod stack)*
- [x] `/security-review` skill run; findings folded into the log. *(confirmed F-006/F-009/F-010; no new HIGH/MEDIUM)*

---

## 6. Multi-scenario re-test matrix (run each ≥2×)

| Scenario axis | Values to exercise |
|---|---|
| Reporting period | 2026 (9,193.02) · 2030 (per-gas 3,346.49) · 2031 (fugitive 135,720) · 2022 (equity 167.4) |
| Persona | enterprise (13 tabs) · SME (4 tabs) · consultant |
| Tenant | demo · qa.org2 (isolation) · qa.viewer (verifier RBAC) |
| GWP set | AR6 (default) · AR5 · AR4 (biogenic mass GWP-independent) |
| Format | json · pdf · docx · xlsx · csv (round-trip) |
| Input class | valid · empty · malformed · adversarial (cross-tenant / injection / oversize) |

---

## 7. Findings Log

| ID | Inc | Sev | File:line | Description | Status |
|---|---|---|---|---|---|
| F-001 | INC-0 | S4 | (env) | `npm audit` cannot run in this offline sandbox (ENOLOCK — requires registry access). Manual dep review: all new deps are current majors (multer **2.x** not vulnerable 1.x; exceljs 4.4, prom-client 15, docx 9.7, cookie-parser; FE Vite 5 / React 19 / recharts 3.8). | ACCEPTED — re-run `npm audit` with registry access at merge time (tracked in INC-10). |
| F-002 | INC-0/1 | info | backend/src/config/config.ts | Dev fallback derives the refresh secret as `${JWT_ACCESS_SECRET}-refresh` when `JWT_REFRESH_SECRET` is unset. **Verified in config.ts:** prod `resolveSecret` enforces length ≥32 + not-in-`WEAK_SECRETS` for BOTH secrets and throws if missing; the dev fallback derives a *distinct* refresh secret. | RESOLVED — safe by design (dev-only, prod fails closed). |
| F-003 | INC-1 | S4 | models/EmissionFactorVersion.ts:91 | Immutability hooks cover all query-level update/delete + `pre('save')` via `isNew`, but the **document-method** `doc.deleteOne()`/`doc.updateOne()` are not hooked (only query variants). No controller calls them, so not exploitable today; add `{document:true,query:true}` for defense-in-depth. | ACCEPTED (no call path; hardening nice-to-have) |
| F-004 | INC-1 | S4 | models/AuditLog.ts | AuditLog is append-only by convention (comment says "immutable entry") but has **no model-level update/delete guard** like Calculation/EFV. No API route updates/deletes audit rows, so not exploitable; add block-write hooks for consistency/defense-in-depth. | ACCEPTED (no call path) |
| F-005 | INC-1 | S4 | models/Inventory.ts | Published inventories' lock is procedural, not a model hook. **INC-4 verified:** every inventory write handler (status/publish/reopen/base-year) uses `Inventory.findOne({_id, organizationId})` and the base-year `updateMany` is org-scoped. Data protection holds; model hook is defense-in-depth only. | RESOLVED — controller scoping consistent (hook = optional hardening). |
| **F-006** | **INC-2** | **S2** | **services/tokenStore.ts:57-72** | **`isValid` FAILED OPEN**: returned `true` when Redis was unavailable or `.get` threw, so a *revoked* refresh token would be honored again during a Redis outage (revocation bypass / session resurrection). | **FIXED** (`tokenStore fail-closed`) — now returns `false` in both cases (re-auth forced); JSDoc updated. Verified: happy-path refresh 200, bogus token 401, tsc green. |
| F-007 | INC-2 | info | services/evidenceStorage.ts | **INC-4 verified:** `downloadEvidence` resolves `Evidence.findOne({_id, organizationId})` → 404 on cross-tenant BEFORE streaming the gridFsId, and `encodeURIComponent`s the filename (no header injection). | RESOLVED — tenant-scoped download. |
| **F-009** | **INC-4** | **S2** | **routes/csv.ts:30** | `/csv/import` had `authenticate` but **no `authorize`** role gate (verifier got 200 on import vs 403 on direct calc-create) — read-only roles could author calculations via CSV (separation-of-duties bypass). | **FIXED** (`gate csv import…`) — `/csv/import` now `authorize('admin','manager','user')`. Verified: verifier import **403**, verifier validate 200 (preview kept), admin import 200. jest 128. |
| F-010 | INC-4 | S3 | middleware/errorHandler.ts | `error.message` was returned to the client in all environments on a 500, leaking internal error text in prod. | **FIXED** (`generic 5xx message…`) — generic `Internal Server Error` for `>=500` in production (real message logged server-side); 4xx keep their message. Verified 4xx message preserved (400). |
| F-011 | INC-4 | S4 | utils/jwt.ts:44 | `jwt.verify` does not pin `algorithms: ['HS256']`. Low risk (symmetric string secret; jsonwebtoken v9 rejects `alg:none` — confirmed live a forged `alg:none` token → 401), but pinning the algorithm is best practice against any future RS/HS confusion. | ACCEPTED (defense-in-depth; verified not exploitable today) |
| F-012 | INC-7 | S4 | controllers/calculationController.ts:534 | `getCalculationSnapshots` returns **200 with `{snapshots:[],count:0}`** for a calc id not owned by the caller (it queries snapshots with the `organizationId` filter directly, without pre-fetching the calc), whereas sibling endpoints return 404. **Data is protected** (verified live: org2 sees count 0 for a demo calc that has 1 snapshot); purely a 200-empty-vs-404 consistency nit (no existence leak — identical to a real calc with zero snapshots). | ACCEPTED (no leak; optional: pre-fetch calc for a uniform 404) |
| F-008 | INC-3 | S4 | controllers/reportController.ts (all 6 handlers) | An **unsupported `format`** (e.g. `format=xlsx` for the narrative SBTi/IMP reports, which have no xlsx per gotcha 55) falls through the `exports[format]` guard to `ApiResponseUtil.success(res, data)` → returns the JSON summary with **HTTP 200 + `application/json`** (no attachment disposition). Honest JSON, not a corrupt file, and not UI-reachable (ReportsTab hides those buttons). Loose API contract — optional: reject unknown formats with 400/406. | ACCEPTED (graceful default; not exploitable) |

> Status: OPEN → FIXED (`<commit>`) / ACCEPTED (rationale) / WONTFIX (rationale).

---

## 8. Sign-off tracker

| Increment | Owner | Files | Status |
|---|---|---|---|
| INC-0 Baseline & gates | Claude | — | ✅ done — tsc×2 green, jest 128 (stable ×2), secret-scan clean, deps current, partition=207, dev images build; npm audit deferred (F-001), prod build → INC-6 |
| INC-1 Data layer | Claude | 27 | ✅ done — all 27 reviewed; immutability guards (Calc/EFV) correct, tenant scoping universal, User password select:false+bcrypt(12), importers policy-#2/#3 compliant & idempotent, seed destructive but manual-only. 3 S4 consistency notes (F-003/4/5), F-002 resolved. No S1/S2. |
| INC-2 Core services | Claude | 14 | ✅ done — engine per-gas×GWP/biogenic/fail-loud/MB-spoof verified live (6 checks + AR5/AR6 sensitivity, baseline 9193.02 intact); consolidation read-only, estimation no-chaining+rung order, persistence/versioning/evidence sound; lineage reconciles across 2026/2030/2031. **1 S2 (F-006 tokenStore fail-open)**, 1 cross-check (F-007). |
| INC-3 Reports & export | Claude | 9 | ✅ done — 6 reports × pdf/docx/xlsx all 200 + valid magic bytes; pdfSafe covers all dynamic PDF text (no raw drawText in renderers); CSV formula-injection guard present; export 2026 = 14 rows reconcile to 9193.02, zero fabricated sources, xlsx PK. 1 S4 (F-008 unsupported-format→JSON). |
| INC-4 API surface | Claude | 29 | ✅ done — auth middleware solid; tenant scoping verified across all controllers (factor edit/versions 403/404, evidence download org-scoped, inventory all org-scoped, **cache key org-namespaced**); server.ts helmet/CORS-single-origin/rate-limit/body-limit; adversarial unauth-401/NoSQL-400/forged-401. **F-005/F-007 resolved.** Findings: **F-009 S2 (csv import no role gate)**, F-010 S3 (500 message leak), F-011 S4 (jwt alg pin). |
| INC-5 Frontend | Claude | 76 | ✅ done — **no XSS sinks** (zero dangerouslySetInnerHTML/innerHTML/eval); access token **in-memory only** + refresh httpOnly cookie + single-flight refresh; all shape gotchas handled (14/8/42/25, getBlob/postForm); in-browser: 13 compliance tabs + dashboard(data) + import/export + glossary all render, **0 console errors**. No findings. |
| INC-6 Deploy/infra | Claude | 42 | ⬜ pending |
| INC-7 Security pass | Claude | — | ✅ done — cross-tenant battery (10 probes, all 404/empty, no leak); NoSQL 400, upload bad-type 400, cookie HttpOnly+SameSite=Strict, alg:none 401; /security-review run → only the already-fixed F-006/F-009/F-010, no new HIGH/MEDIUM. 1 S4 (F-012 snapshots 200-empty). `/metrics`-not-public deferred to INC-6 prod stack. |
| INC-8 Tests | Claude | 8 | ⬜ pending |
| INC-9 Coherence & docs | Claude | 2 | ⬜ pending |
| INC-10 Final regression & sign-off | Claude | — | ⬜ pending |
| Ultrareview findings addressed | User+Claude | — | ⬜ pending |

**Merge gate:** all rows ✅ + Findings Log has no open S1/S2 + Coverage Matrix 100% + partition check passes.

---

## 9. Order of execution

INC-0 → INC-1 → INC-2 → INC-3 → INC-4 → INC-7 (security, after the API surface is mapped) → INC-5 → INC-6 → INC-8 → INC-9 → INC-10. Cross-cutting passes (7/9) may surface findings that re-open a file-owning increment; that's expected — re-tick only after the fix is verified.

**Execution mode (chosen by user, 2026-06-27):** **Stop after each increment** for go-ahead before the next. **Review-and-log only — no code changes during an increment;** findings + recommended fixes are presented at each stop for the user to approve. **Ultrareview skipped** — rely on this manual plan + the `/security-review` skill (INC-7).
