# Enterprise Requirements — Gap Analysis vs Current Codebase

**Date:** 2026-06-10 · **Against:** ENTERPRISE_REQUIREMENTS_REPORT.md (2026-06-10) · **Codebase:** branch `remediation` @ `556d103`

**Legend:** ✅ Present · 🟡 Partial · ❌ Missing · 🔧 = implemented in this session's P0 increment (see §14)

---

## 1. Methodology Foundations

| Req | Status | Evidence / Notes |
|---|---|---|
| 1.1 Five GHGP principles as product behaviors [P0] | ❌ | No completeness checks, no exclusion documentation, partial provenance only. 🔧 provenance + exclusions register added this session. |
| 1.1 Conservativeness principle (ISO) [P0] | ❌ | No estimation engine exists at all (no gap-filling), so no conservative defaults. |
| 1.2 Three consolidation approaches [P0] | ❌ | No concept of organizational boundary anywhere. `Organization` is a flat single entity. |
| 1.2 Entity hierarchy (parent→site→meter) [P0] | ❌ | Single-level `Organization`; calculations have no site/facility dimension. Largest structural gap in the data model. |
| 1.2 Equity roll-up, lease/JV classification [P1] | ❌ | Depends on entity hierarchy. |
| 1.2 M&A effective dates / pro-rating [P1] | ❌ | — |
| 1.3 Scopes 1/2/3 operational boundaries [P0] | 🟡 | 22 categories across scopes 1–3 seeded (`seedBasicData.ts`); Scope 3 has 14 of 15 categories (Cat 5 Waste exists as "End-of-Life Treatment" only — Cat 5 *own-operations waste* is missing as a distinct category). |
| 1.3 Documented exclusions register [P0] | ❌ → 🔧 | **Implemented this session:** org-level exclusions with justification + materiality estimate, audited. |
| 1.3 Biogenic CO₂ tracked separately [P1] | ❌ | Factors are single CO₂e values; no biogenic split anywhere. |
| 1.3 Removals reported separately [P2] | ❌ | — |
| 1.4 Seven Kyoto gases, per-gas calc [P0] | 🟡 → 🔧 | `EmissionFactor` has dead `co2/ch4/n2o/otherGhg` fields; engine multiplies a single CO₂e `factor.factor` (`calculationEngine.ts:405`). **This session:** engine computes per-gas × GWP when per-gas values exist; HFC/PFC blend library still missing. |
| 1.4 Versioned GWP sets (AR4/AR5/AR6) [P0] | ❌ → 🔧 | **Implemented:** AR4/AR5/AR6 GWP-100 reference data; per-org selection (`settings.gwpSet`); change audited; no double-application for CO₂e-denominated factors (explicit `gwpApplied: none/embedded` provenance). Per-inventory-year locking of the set: not yet (no inventory object). |
| 1.4 Per-gas breakdown in outputs [P1] | ❌ → 🔧 | Engine result now includes `gasBreakdown` when computed per-gas. Reporting outputs (per-gas tables) still missing. |
| 1.5 Arbitrary fiscal years / multi-year [P0] | 🟡 | `Calculation.period {start,end}` is arbitrary, so fiscal years work *de facto*; but there is no "reporting year/inventory" object grouping calculations, so no year-level operations. |
| 1.5 Inventory lifecycle Draft→Review→Locked [P0] | 🟡 → 🔧 | `status: draft/completed/verified` existed but nothing enforced immutability. **This session:** added `locked` status, lock/unlock endpoints (admin/manager), model-level immutability guard, audit events. Full review workflow + snapshot versioning still missing. |

## 2. Calculation Engine

| Req | Status | Notes |
|---|---|---|
| 2.1 activity × factor × GWP per gas [P0] | 🟡 → 🔧 | Was single CO₂e multiply. Now per-gas × GWP path exists; dedicated tested unit library (HHV/LHV, imperial) still missing — conversions are a hand-rolled table (`convertUnits`) that throws on unknown pairs (fail-loud ✅) but has no energy-basis handling. |
| 2.1 Full provenance per result [P0] | 🟡 → 🔧 | Entries stored only numeric factor + quality. **Now store:** factorId, factor name/source/year, gwpSet, method, calculation timestamp, user. Formula string + factor *version* pinning still partial (factors have `version` field but no immutable version history). |
| 2.1 Deterministic recompute of locked inventories [P0] | 🟡 | Locked calcs are now immutable 🔧, but recompute reproducibility isn't guaranteed because factors can be edited in place (no factor version snapshots). |
| 2.1 Tiered methods recorded [P1] | 🟡 → 🔧 | `method` now recorded per entry (from category.calculationMethod). No measured/fuel-analysis tiers. |
| 2.1 Rounding policy [P1] | 🟡 | 2dp rounding at entry + totals (`calculationController`); intermediates unrounded ✅; policy not documented. |
| 2.2 Stationary combustion fuels [P0] | 🟡 | Generic category + 2 factors (NG, generic process). No fuel library (coal, fuel oils, biomass), no volume/mass/energy triple input, no biogenic share. |
| 2.2 Mobile: fuel- and distance-based [P0] | 🟡 | Fuel-based via petrol/diesel factors; distance-based only for Business Travel. No vehicle-type distance factors, no fleet registry. |
| 2.2 Fugitive: material balance + screening, blend library [P0] | 🟡 | One baseline factor (R-410A GWP as kg-factor). No material-balance calculator, no blends library. |
| 2.2 Process emissions via custom factors [P1] | ✅ | Org-scoped custom factors with admin approval boundary (`POST /api/emission-factors`). |
| 2.3 **Scope 2 dual reporting** [P0] | ❌ | Single grid-average factor only. No market-based method, no residual mix, no instrument registry, no Quality Criteria. **Highest-impact missing P0** after entity model. |
| 2.3 Location-based factor-year matching [P0] | 🟡 → 🔧 | Single Egyptian grid factor (2024). **This session:** engine warns when factor vintage is stale vs activity year (quality note + confidence hit). Multi-region grid library missing. |
| 2.3 Steam/heat/cooling first-class [P1] | ✅ | Categories + baseline factors exist. |
| 2.3 Hourly-ready energy records [P2] | ❌ | — |
| 2.4 All 15 Scope 3 categories + relevance screen [P0] | 🟡 | 14 modeled (see 1.3); no relevance screening workflow. Exclusions register 🔧 gives the justification half. |
| 2.4 Method hierarchy per data line [P0] | 🟡 → 🔧 | Method now recorded per entry; no supplier-specific/hybrid methods, no method-mix display. |
| 2.4 Spend-based EEIO engine [P0] | 🟡 | Spend-based categories exist with rough EGP estimates (`qualityRating: low`). No EEIO sector mapping, no inflation/currency adjustment. |
| 2.4 Category 3 FERA + T&D losses [P0] | 🟡 | FERA category exists with a baseline WTT factor (0.05/kWh, flagged low quality). No T&D-loss-specific factor, not validated. |
| 2.4 Category calculators (travel bands, waste matrix, PCAF…) [P1] | 🟡 | Business travel has distance/class/round-trip logic (`calculateBusinessTravelEmissions`). Others are generic value×factor. |
| 2.4 Supplier engagement module [P1] | ❌ | — |
| 2.4 Screening mode [P2] | ❌ | — |

## 3. Emission Factor Management

| Req | Status | Notes |
|---|---|---|
| Factor library as versioned reference data [P0] | 🟡 | DB-stored (not hard-coded ✅ — failure mode #1 avoided), with source/year/region/unit metadata. **No version history** (edits overwrite), no valid-from/to enforcement, no license field. |
| Core public factor sets (EPA/DEFRA/IPCC/IEA/EEIO) [P0] | ❌ | 23 factors total: 4 Egyptian + 19 baseline estimates. The DEFRA spreadsheet import pipeline exists (`importExcel.ts`/`dataImportService`) but is unvalidated and not run. |
| Factor-year matching + staleness warnings [P0] | 🟡 → 🔧 | Vintage-mismatch warning implemented this session; automatic vintage *selection* (multiple years per factor code) missing. |
| Custom factors w/ source docs + approval + visual distinction [P0] | 🟡 | Org-scoped, admin/manager-only, visually marked "(custom)" in UI ✅; mandatory source documentation weak (defaults to "Custom"), no approval workflow. |
| Annual update workflow (no silent restatement) [P1] | 🟡 → 🔧 | Locked calculations can no longer be silently changed; but factor imports could still alter open-period results without an explicit log. |
| One-click factor provenance in UI [P1] | 🟡 | Calculator shows factor value/unit/source/year/region/quality before calculating; no link to source document page/table. |
| Premium connectors (ecoinvent, Climatiq) [P2] | ❌ | — |

## 4. Data Collection & Preparation

| Req | Status | Notes |
|---|---|---|
| 4.2 Per-category data sourcing guidance in UI [P0-behavior] | 🟡 | Categories carry descriptions, clarifications, Egyptian context shown in the form; not the §4.2 "where it lives / preferred form" depth. |
| 4.3 Unit discipline (no unitless rows) [P0] | ✅ | Import + calculate reject missing/ambiguous units; engine throws on unknown conversions. |
| 4.3 Period alignment / overlap detection [P0] | ❌ | No meter/month model, so no overlap detection. |
| 4.3 Gap-filling with documented estimation [P0] | ❌ | No estimation engine. |
| 4.3 Outlier/duplicate detection on import [P1] | ❌ | — |
| 4.3 Spend-prep dedup guidance [P1] | ❌ | (Failure mode #10 — spend double-counting — is currently possible.) |
| 4.3 Evidence attachment per data line [P1] | ❌ | No file storage per entry. |
| 4.4 CSV/XLSX import + template + validation report [P0] | 🟡 | CSV + XLSX import with validation + row-level errors + template download ✅ (built earlier); per-category templates, column mapping UI, idempotent re-import missing. |
| 4.4 Integrations / ingestion API [P1] | 🟡 | REST API exists with JWT (no API keys/OAuth, no docs). |

## 5. Data Quality & Uncertainty

| Req | Status | Notes |
|---|---|---|
| DQ scoring per data line [P0] | 🟡 | 3-level (high/medium/low) heuristic from factor region/quality/recency, stored per entry, rolled up on dashboard. Not PCAF 1–5, no DQI dimensions, no weighted roll-up per category. |
| Primary vs secondary share per Cat [P0] | ❌ | — |
| Qualitative uncertainty [P1] / Monte Carlo [P2] | ❌ | Factor model has an `uncertainty` field (unused). |
| Completeness dashboard + publish gates [P1] | ❌ | — |
| YoY DQ improvement tracking [P1] | ❌ | — |

## 6. Base Year, Targets & Time Series

| Req | Status | Notes |
|---|---|---|
| Base-year designation, frozen results [P0] | 🟡 | Targets feature (built earlier) stores baselineYear + baselineEmissions per target — a light proxy, not a frozen inventory. |
| Recalculation policy engine (5% threshold) [P0] | ❌ | — |
| Intensity metrics [P1] | ❌ | No denominators data series. |
| Target tracking + trajectory [P1] | 🟡 | Targets with progress vs baseline + pace status exist; no SBTi trajectory line. |
| Forecasting/scenarios [P2] | ❌ | — |

## 7. Enterprise Platform

| Req | Status | Notes |
|---|---|---|
| Multi-entity + RBAC [P0] | 🟡 | Multi-tenant by `organizationId` with roles admin/manager/user enforced via `authorize()` ✅; no per-site contributor, no viewer/verifier roles, no consultant workspace switching. |
| SSO/SCIM, verifier role [P1] | ❌ | JWT + refresh-cookie auth only. |
| **Immutable audit trail** [P0] | ❌ → 🔧 | **Implemented this session:** append-only `AuditLog` (who/when/action/resource/before→after), wired to calculation create/lock/unlock, factor create, targets/settings/exclusions changes, CSV/XLSX imports; admin read endpoint. Not yet on: auth events, user management. |
| Calculation lineage drill-down [P0] | 🟡 → 🔧 | Entry-level provenance now stored (factor id/source/year, gwpSet, method); no UI drill-down view yet. |
| Snapshots + restatement diffs [P0] | ❌ | Locking 🔧 prevents mutation but there's no snapshot/diff mechanism. |
| IMP auto-generation [P1] | ❌ | — |
| Encryption/isolation/backups [P0] | 🟡 | TLS terminates outside the stack (local nginx is HTTP); Mongo unauthenticated inside the compose network; tenant isolation enforced in queries ✅; no backup automation. |
| SOC2/ISO27001 roadmap, residency [P1] | ❌ | — |
| 100k-row imports, async calc, pagination [P1] | 🟡 | Pagination on list endpoints ✅; imports are synchronous row-loops (fine at hundreds, not 100k). |

## 8. Reporting & Disclosure

| Req | Status | Notes |
|---|---|---|
| GHG inventory report (PDF/DOCX/XLSX) [P0] | ❌ | Only CSV export of raw entries. `reportController` returns JSON aggregates. No boundaries/methods/exclusions narrative, no dual Scope 2, no per-gas table. |
| CDP/SBTi/ESRS mapping exports [P1] | ❌ | — |
| Dashboards w/ drill-down [P1] | 🟡 | Scope/category/trend/quality dashboards exist (rebuilt earlier); no entity/site dimension, no Pareto, no drill-to-line. |
| Per-gas table, recalc history [P2] | ❌ | — |

## 9. Verification Readiness

| Req | Status | Notes |
|---|---|---|
| Assurance package export [P0] | ❌ | Components now partially exist (audit log 🔧, exclusions 🔧, provenance 🔧) but no bundled export. |
| Sampling + evidence chain, flag/resolve [P1] | ❌ | — |
| Materiality view [P1] | 🟡 | Category Pareto-ish "top contributors" exists on dashboard. |
| Verification status fields [P2] | 🟡 | `status: verified` enum value exists, unused by any workflow. |

## 10. UX & Guidance

| Req | Status | Notes |
|---|---|---|
| Guided onboarding wizard [P0] | ❌ | Registration collects org name/industry only. |
| Inline methodology help on every input [P0] | 🟡 | Category descriptions/clarifications/Egyptian context + priority legend + quality explainer exist; §4.2-depth sourcing help missing. |
| Persona modes [P1] | ❌ | — |
| Progress/health indicators [P1] | 🟡 | Data-quality panel exists; no completeness %. |
| Glossary/method page [P2] | ❌ | — |

## 11. Failure-Mode Checklist (report §11)

| # | Failure mode | Verdict |
|---|---|---|
| 1 | Hard-coded factors | **Avoided** — DB factors with metadata (though library is thin and unversioned). |
| 2 | Single Scope 2 method | **Present defect** — location-based only. |
| 3 | Missing FERA/T&D | **Partially avoided** — FERA category + baseline factor exist; T&D losses absent. |
| 4 | GWP double-application | **Avoided** 🔧 — engine now explicitly records whether GWP was applied (`per-gas`) or embedded in a CO₂e factor (`embedded`); never both. |
| 5 | Unit-conversion errors | **Partially avoided** — unknown conversions throw (no silent wrong-magnitude); HHV/LHV and imperial units unsupported rather than wrong. |
| 6 | Factor vintage ignored | **Mitigated** 🔧 — stale-vintage warning + quality penalty; auto vintage-selection still missing. |
| 7 | No biogenic split | **Present defect.** |
| 8 | Results mutable after reporting | **Fixed** 🔧 — `locked` status + model-level immutability + audit. |
| 9 | Estimates indistinguishable | **Partially avoided** — DQ rating per entry + "(baseline)" factor naming + low-quality flags. |
| 10 | Spend double-counting | **Present risk** — no dedup guard between Scope 1/2 activity data and Cat 1 spend. |
| 11 | No exclusions register | **Fixed** 🔧. |
| 12 | FP totals with per-row rounding | **Acceptable** — entries rounded 2dp, totals re-rounded once; documented policy missing. |

## 12. Priority verdict

- **Phase 1 (P0) items done before this session:** factor library (partial), CSV/XLSX import, DQ flags (partial), fail-loud units.
- **Phase 1 items done in this session (🔧):** GWP set management + per-gas engine, calculation provenance, audit trail, inventory locking, exclusions register, factor-vintage warnings.
- **Phase 1 items still open (largest first):** entity/boundary model · Scope 2 dual reporting + instrument registry · real factor libraries (DEFRA/EPA/IPCC vintages) · 15th Scope 3 category + relevance screening · gap-filling/estimation engine · inventory object with snapshots · GHG inventory report export · PCAF-style 1–5 DQ.
- **Phases 2–3:** not started (as expected).

## 14. Increment 2 addendum (2026-06-10, P0-2) - commit 158148b

- **1.2 boundaries (done):** consolidationApproach on Organization (equity_share / financial_control / operational_control, audited); Facility model (country defaults to Egypt, ownership %, operational-control flag) with audited CRUD + soft-delete; Calculation.facilityId tagging + per-facility filtering. Still open: multi-level hierarchy (subsidiaries), equity roll-up math, M&A effective dates.
- **2.3 Scope 2 dual reporting (partial, done for Egypt):** every purchased-electricity entry now stores scope2Location (grid average, Egyptian grid factor first), scope2Market, and scope2MarketMethod. Rungs implemented: supplier-specific rate (org custom factor) -> grid-average fallback, the correct market-based figure for Egypt (no contractual-instrument market / residual mix). Still open: certificate/PPA registry + Scope 2 Quality Criteria for instrument-bearing markets.
- **3 factor selection (done):** auto-selection follows the GHGP method hierarchy - org custom (supplier-specific) -> EGYPTIAN shared factors (PERMANENT, market mandate: never removed, always above other regions) -> global -> other regions; within a tier the vintage closest to (and not after) the activity year wins. Explicit factor selection always available. Also fixed cross-tenant factor leaks (auto-selection org-scoped; foreign factorIds rejected).

## 15. Increment 3 addendum (2026-06-10, P0-3) - commit follows

- **Factor policy refinement (user directive):** Egyptian factors are the PRIMARY DEFAULT - auto-selection tier order is now Egyptian shared -> org custom -> global -> other regions, and the per-category factor list returns Egyptian/library factors first so the calculator preselects them. Users override by explicitly selecting any listed factor or manually entering a custom one (both paths fully supported and audited).
- **1.3/2.4 all 15 Scope 3 categories (done):** added Category 5 (Waste Generated in Operations) with material/disposal-method inputs and a baseline DEFRA-style factor (flagged low quality pending validation); inserted non-destructively into the live DB and added to the seed for fresh installs.
- **8 GHG inventory report (done, P0):** GET /api/reports/ghg-inventory (JSON; ?format=markdown downloads a document) compiling: organizational boundary + consolidation approach + facilities, reporting period, methodology (GWP set, factor policy, Scope 2 note), emissions by scope, Scope 2 dual figures with methods, per-category breakdown with method mix, data-quality summary, emission-factor register, exclusions register, targets/base year, inventory controls (locked count, audit-trail entries), uncertainty statement. PDF/DOCX rendering and per-gas table remain open.
