# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three personas carry **equal weight**; when their needs conflict, the persona mode (`Organization.settings.persona`: enterprise / consultant / sme) tailors the UI for each rather than one winning globally.

- **Enterprise sustainability / ESG teams** at Egyptian organizations building audit-ready GHG inventories and preparing CDP, SBTi and ESRS/CSRD disclosures. They need depth, traceability and assurance evidence.
- **Carbon consultants** running inventories for client organizations. They need defensible methodology, fast data entry and client-ready reports. Multi-org workspace switching is not built yet.
- **SMEs**, often export suppliers doing a first footprint with little in-house expertise. They need guidance and a reduced surface (SME mode trims Compliance to 4 tabs).

Secondary audiences: **verifiers** (read-only role that verifies calculations) and **emission specialists** reviewing the calculator's logic and accuracy on an invite-only review instance.

## Product Purpose

Carbonytics is a multi-tenant carbon-accounting platform that measures GHG Protocol Scope 1, 2 and 3 emissions, with Egyptian emission factors as the primary default. It exists because organizations in Egypt and the MENA region lack accessible, localized, credible carbon-accounting tools. Success means an organization can produce an inventory a third-party assurer can trace and reproduce, and file framework disclosures from it.

## Positioning

- **Egypt-first factors with global fallback:** auto-selection prefers Egyptian shared factors, then org custom, then global, then other regions. Users can override, but Egyptian factors are never removed.
- **Audit-grade traceability:** every reported number drills down to calculation lines with their formula, pinned factor version, data-quality score and evidence. Locked calculations are immutable; a published reporting year freezes. Locked inventories can be deterministically recomputed.
- **No fabricated data:** factor values come only from official sources with exact unit conversions. CH₄/N₂O are never invented. Estimates stay labelled and are never chained.

## Operating Context

- Workflow: set up organization (onboarding wizard), entity/facility hierarchy and fleet → enter activity data through the calculator or CSV/XLSX import → review dashboards (Pareto, entity drill-down) → manage reporting years (Draft → Review → Published, base year, recalculation check) → attach evidence per data line → verify and lock → export branded PDF/DOCX/XLSX reports.
- Reports: GHG inventory, assurance package, Inventory Management Plan, CDP, SBTi, ESRS E1 mappings.
- Factor library of about 1,350 factors: Egyptian, DEFRA 2024, EPA 2025, IPCC EFDB, GHG Protocol cross-sector, plus supplier-specific factors.
- Roles: admin, manager, user, verifier, viewer. Persona mode is an admin-only, org-level setting.
- Deployment: Docker stack (MongoDB, Redis, Node/Express API, React/Vite SPA behind nginx) on a single HTTPS origin.

## Capabilities and Constraints

Methodology policies that must not regress:

1. Egyptian emission factors are the primary default.
2. Never fabricate factor values; CO₂-only sources are flagged CO₂-only.
3. No GWP double-application: per-gas factors use the org GWP set (AR4/AR5/AR6); CO₂e factors are used as-is.
4. Estimates stay distinguishable (flagged, quality low, DQ 5); gaps are never silently filled; estimates are never chained.
5. Locked calculations are immutable; restatements only through audited unlock → re-lock. A published reporting year cannot be saved into.
6. Consolidation (equity / operational / financial control, M&A pro-rating) is a reporting-layer view; stored emissions stay 100% gross. Biogenic CO₂ is a memo item outside scope totals.

Other confirmed facts:

- Terminology follows the GHG Protocol: Scope 2 location-based and market-based dual reporting, the 15 Scope 3 categories, PCAF data-quality score 1–5, and the GHG-Protocol pedigree matrix (best 1 to worst 5).
- Methodology covers biogenic CO₂ separation, per-gas breakdown, fugitive material balance, mobile distance-based calculation with a fleet registry, and 3-rung conservative estimation.
- **Open / data-blocked:** spend-based EEIO sector factors and an Egypt grid T&D loss rate await official datasheets.
- **Not built:** SSO/SCIM, consultant multi-org workspace switching, Monte-Carlo uncertainty, removals reporting.

## Brand Commitments

- Name: **Carbonytics**.
- Logo: the dotted-C mark (`frontend/public/icon.png`, `frontend/src/assets/brand/carbonytics-icon.png`, plus the favicon set). Always transparent: **never place the logo on a white box or chip.** On coloured bands, use the white version directly.
- The wordmark is themed text, not an image.
- Report exports are branded per framework (Carbonytics, CDP, SBTi, ESRS accents) through the shared report toolkit.

## Evidence on Hand

- No customers, pilots, testimonials, case studies or press exist yet. **Do not fabricate any.**
- Real assets available: the demo organization's data, the methodology and factor sources, and the exported report formats.
- An invite-only emission-specialist review is being set up; no results yet.

## Product Principles

1. **Traceable or it doesn't ship.** Every number can be explained down to its source line, factor version and evidence.
2. **Honest about uncertainty.** Estimates, gaps, data quality and CO₂-only sources stay visible; nothing is silently filled.
3. **Local first, global fluent.** Egyptian context is the default, and international frameworks are first-class.
4. **One engine, three depths.** Enterprise, consultant and SME see different amounts of the same rigorous methodology, never a weaker one.

## Accessibility & Inclusion

- **Arabic is a committed language.** Arabic UI and right-to-left layout are planned but not built (an `en`/`ar` org setting exists, with no translations yet). New UI must stay RTL-ready: logical CSS properties, no hard-coded left/right, and strings that can be translated.
- No formal accessibility standard has been adopted yet.
