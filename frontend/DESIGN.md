---
name: Carbonytics
description: Audit-grade GHG accounting for Egypt, in two rooms of one building — Verdant for reading, Console for operating.
colors:
  verdant-paper: "#f6f4ee"
  verdant-sheet: "#fffdf8"
  verdant-ink: "#1c2620"
  verdant-lichen: "#5d655f"
  verdant-rule: "#e6e1d4"
  deep-forest: "#1f3d2b"
  forest-cream: "#f4f1e8"
  verdant-leaf: "#1f8a55"
  console-night: "#0a0f0d"
  console-panel: "#0e1714"
  console-glow-ink: "#eafff4"
  console-moss: "#7d968a"
  console-rule: "#1b2a23"
  console-mint: "#1bf09a"
  console-mint-ink: "#04130d"
  console-teal: "#0bd1d1"
  verdant-emphasis: "#1f7347"
  verdant-positive: "#047857"
  console-emphasis: "#7fbf96"
  console-positive: "#34d399"
  verdant-caution: "#b45309"
  verdant-critical: "#b91c1c"
  verdant-info: "#0369a1"
  console-caution: "#fbbf24"
  console-critical: "#f87171"
  console-info: "#38bdf8"
  verdant-green-500: "#2f8a55"
  verdant-green-600: "#1f7347"
  danger-red: "#dc2626"
  scope-1: "#123a27"
  scope-2: "#1f7347"
  scope-3: "#3f9a66"
  console-scope-1: "#1bf09a"
  console-scope-2: "#16b877"
  console-scope-3: "#1a8a5c"
typography:
  display:
    fontFamily: "Archivo, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Archivo, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Archivo, Archivo Fallback, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'ss01', 'cv01'"
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.025em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  lg: "0.5rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.deep-forest}"
    textColor: "{colors.forest-cream}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "40px"
  button-primary-dark:
    backgroundColor: "{colors.console-mint}"
    textColor: "{colors.console-mint-ink}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.verdant-sheet}"
    textColor: "{colors.verdant-ink}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    textColor: "{colors.verdant-ink}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.verdant-sheet}"
    textColor: "{colors.verdant-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.verdant-sheet}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  badge:
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: Carbonytics

## Overview

**Creative North Star: "Greenhouse & Control Room"**

Carbonytics is one building with two rooms. **Verdant**, the light theme, is the greenhouse: warm paper, deep forest ink and a wide, engineered heading voice, made for reading inventories, reviewing reports and preparing disclosures. **Console**, the dark theme, is the control room: near-black panels, electric mint signal and teal accents, made for operating the calculator and scanning dashboards. Both rooms share one floor plan. Every component, size and radius is identical; only the light changes, through a single set of semantic tokens (`bg`, `surface`, `fg`, `muted`, `line`, `brand`, `brand-fg`, `accent`, `ring`, `emphasis`, `positive`, plus the status trio `caution`, `critical`, `info`).

The system is **quietly premium**. Brand appears in precise details (the dotted-C mark, the SemiExpanded Archivo headings, one forest or mint accent per surface), never in loud colour or ornament. Density follows the task. Reading surfaces breathe; operating surfaces such as the calculator, lineage drill-down and data tables stay compact (12px and 16px internal steps) so specialists can check numbers without scrolling.

The confirmed visual rejections are generic SaaS gradients (no purple or blue gradient heroes, glassy blobs or startup-template looks), cartoon eco clichés (no leaves, globes, earth-in-hands or smokestacks) and loud traffic-light colour used where it isn't real status.

**Key Characteristics:**
- Two themes, one geometry: Verdant (light, editorial) and Console (dark, technical), swapped with a `.dark` class on the same tokens.
- A semi-expanded grotesk display face (Archivo at 112.5% width) over a humanist grotesk (Hanken Grotesk), with JetBrains Mono for formulas and figures that must be read exactly.
- Soft, generous rounding (14px controls, 18px cards) and two restrained shadows.
- Hairline borders in the theme's rule colour carry most of the structure.
- One brand accent per surface; status colour only for real status.

## Colors

Two complete palettes that share roles: warm paper and forest ink by day, near-black and mint by night.

### Primary
- **Deep Forest** (light `brand`): the Verdant brand voice. Fills primary buttons and the brand panel on the login page. It is calm and almost black-green, so primary actions read as confident without shouting.
- **Console Mint** (dark `brand`): the same role in Console. Fills primary buttons, focus rings and selection. Electric enough to read as a signal on near-black, so keep it scarce.
- **Forest Cream** / **Mint Ink** (`brand-fg`): text on the brand fill in each theme.

### Secondary
- **Verdant Leaf** (light `accent` and `ring`): input focus border, focus rings and text selection tint (18% alpha). At 4.28:1 on the sheet it is not a text colour; green text uses `emphasis` or `positive`.
- **Console Teal** (dark `accent`): the same role in Console; a cool counterpoint to the mint.
- **Emphasis** (`emphasis`, Tailwind `text-emphasis`): green emphasis text and section icons — card-header icons, highlighted figures, inline links. Verdant Emphasis #1f7347 (5.74:1 on sheet, 5.30:1 on paper); Console Emphasis #7fbf96, a quiet sage rather than the signal mint (8.51:1 on panel, 9.01:1 on night). It is the brand voice in text, not a status.
- **Verdant Green scale** (`primary-50…900`, mid steps 500 and 600 shown above): a legacy scale. Components no longer use it; tints, selected borders, bars and spinners use `brand` at an alpha, and green text uses `emphasis`. Keep it only for one-off chart needs.
- **Charts:** series colours come from tokens via `rgb(var(--x))`. The Pareto cumulative line is `accent`, not amber, because amber means caution.

### Neutral
- **Verdant Paper** / **Console Night** (`bg`): the page.
- **Verdant Sheet** / **Console Panel** (`surface`): cards, inputs, menus, the sticky navbar (at 80% with backdrop blur).
- **Verdant Ink** / **Console Glow Ink** (`fg`): text. Secondary text uses `fg` at 70–80% opacity rather than a separate grey.
- **Lichen** / **Moss** (`muted`): placeholders, captions, uppercase labels, icon buttons at rest. Both hold body-text contrast on the page, the card **and** the 6–8% ink washes used for chips, inactive tabs and hover rows: Lichen #5d655f (5.92:1 sheet, 5.47:1 paper, ≥4.72:1 on an 8% wash), Moss #7d968a (5.73:1 panel, ≥4.65:1 on an 8% wash).
- **Verdant Rule** / **Console Rule** (`line`): every border and divider. This is the default border colour for all elements.

### Status and data
- **Danger Red** (#dc2626, Tailwind red-600): destructive buttons only.
- **Positive** (`positive`, Tailwind `text-positive`): an earned good state in text and icons — coverage complete, good data quality, covered or imported counts, a done check. Verdant Positive #047857 (5.39:1 on sheet, 4.99:1 on paper) and Console Positive #34d399 (9.49:1 / 10.05:1) sit in the emerald family the success badges use. Never use raw `green-500/600` for text: they fail on the Verdant sheet.
- **Caution / Critical / Info** (`caution`, `critical`, `info`): text and icon colour for warnings (amber), errors and gaps (red) and neutral-informative states such as "excluded" (sky). Verdant #b45309 / #b91c1c / #0369a1 (4.94 / 6.36 / 5.84:1 on sheet, ≥4.57:1 on paper); Console #fbbf24 / #f87171 / #38bdf8 (≥6.59:1). Destructive icon buttons rest in `muted` and turn `critical` on hover.
- **Status chips** (Badge and inline pills): a 15% tint of the status hue with `-800` text in Verdant and `-300` in Console; `-700` on its own tint lands at 4.35–4.46:1 and fails. **Alerts** keep body text in `fg`; the tinted fill and border carry the state.
- Red and green collapse under deuteranopia (≈1.1:1 apart), so every status colour ships with a second cue: an icon shape (check vs. triangle, up vs. down arrow), a label, or a number on a stated scale.
- Badges use Tailwind emerald, amber, red and sky at 15% fill and 20% border (see Status chips below).
- **Scope Ramp** (`--scope-1/2/3`, Tailwind `scope-1…3`, `scopeColor()` in `constants`): the three GHG scopes are ordered categories, so they share the brand hue and step in lightness by distance from the organisation's own operations. In Verdant, Scope 1 is the darkest forest, lightening outward. In Console, Scope 1 is the brightest mint, dimming outward. All six values hold ≥3:1 against their card surface and stay separable under deuteranopia and protanopia simulation. Charts use the solid colour; chips use a 15% tint with ink text and a 40% border.

### Named Rules
**The Scope Ramp Rule.** Scope colour encodes distance from the organisation, never good or bad. Always pair it with the scope name and value; colour is never the only code.

**The One Accent Rule.** Each surface has one brand moment (Deep Forest in Verdant, Console Mint in Console). Everything else is ink, rule and paper.

**The Status Is Earned Rule.** Red, amber and green mean an actual state: error, warning, verified or locked. They never decorate categories, scopes or charts.

**The Same Room Plan Rule.** Never hard-code a hex colour in a component. Use the semantic tokens so the greenhouse and the control room stay one building.

## Typography

**Display Font:** Archivo SemiExpanded (with ui-sans-serif, system-ui), loaded only at width 112.5 and weights 600–700; every display use sets `font-stretch: 112.5%`. While it loads, `Archivo Fallback` (local Arial Bold at `size-adjust: 108.4%`) holds the same line breaks
**Body Font:** Hanken Grotesk (with ui-sans-serif, system-ui), weights 400–700, stylistic sets `ss01` and `cv01` on
**Label/Mono Font:** JetBrains Mono (with ui-monospace), weights 400–600

**Character:** A slightly wide, engineered grotesk gives titles the stance of an instrument panel: premium through proportion, not ornament. The clean humanist body grotesk keeps operating surfaces quick to scan. Mono marks anything that must be read character-exact.

### Hierarchy
- **Display** (Archivo SemiExpanded 700, 1.875rem, -0.015em): page titles such as the dashboard header. One per page.
- **Headline** (Archivo SemiExpanded 600, 1.25rem): section headings inside a page and card headers that lead a major panel.
- **Title** (Archivo SemiExpanded 600, 1.125rem): card titles and modal headings. This is the most frequent heading step.
- **Body** (Hanken Grotesk 400, 0.875rem): the default UI text size across forms, tables and menus. Larger body (1rem) appears only on reading surfaces and large buttons.
- **Label** (Hanken Grotesk 600, 11px, +0.025em tracking, uppercase, `muted`): menu group labels, stat captions, "Demo credentials" style eyebrows.
- **Mono** (JetBrains Mono 400, 0.75rem): calculation formulas in the lineage drill-down, credentials and factor codes.

### Named Rules
**The Wide Face Is for Titles Rule.** All `h1`–`h4` and the `font-display` wordmarks render in Archivo SemiExpanded with -0.01em tracking (-0.015em on `h1`). Body, labels, numbers in tables and controls never use the display face.

**The Exact Figure Rule.** A formula, factor code or reproducible number that someone may copy goes in mono. Ordinary statistics stay in the grotesk.

## Layout

Pages sit in a centred container with a 1280px maximum width (`max-w-7xl`) and responsive side gutters of 16px, 24px from 640px and 32px from 1024px. Narrow single-task surfaces use smaller containers (448px for auth and onboarding, 896–1152px for reading pages such as the glossary).

Spacing follows a 4px base. Real usage clusters on a few steps: 8px and 12px between related controls, 16px between groups, 24px inside cards and between cards, 32px between page sections. Card padding is 24px by default, 12–16px in dense operating panels. The navbar is sticky, full-width, translucent surface with blur and a bottom rule. Layouts collapse to a single column on phones; card grids step 1 → 2 columns from 640px and reach 3–4 only from 1280px, so figures like "12,345.67 t CO₂e" never break across lines. The navbar uses its menu button below the `nav` screen, `68em` (about 1088px at default text size), because the five links and the user block need about 1065px. The breakpoint is in `em` on purpose: it scales with the user's text-size setting, so at 200% text the full nav appears only from about 2176px and never overflows (WCAG 1.4.4 / 1.4.10).

**Section navigation** (Compliance, Settings) is a vertical rail from 1024px. Below that it becomes a single horizontally scrolling strip above the panel, so the content opens above the fold. The strip snaps tabs to its start, fades its trailing edge (mirrored in RTL) to show that it continues, and scrolls the chosen tab into view.

**Touch.** On coarse pointers every button, select, field and tab lifts to a 44px minimum (icon-only buttons to 44×44), and form fields use 16px text so iOS does not zoom on focus. Mouse density is unchanged; this is a `@media (pointer: coarse)` rule in `index.css` plus the Button sizes, not a separate mobile layout. Icon-only actions on phones keep an `aria-label`.

## Elevation & Depth

The system is mostly flat and tonal. Structure comes from the paper–sheet contrast (`bg` versus `surface`) and hairline rules. Shadows are soft and atmospheric, used to lift cards and the primary button slightly off the paper, never to stack layers dramatically.

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 1px 2px rgba(16,24,20,0.04), 0 8px 24px -12px rgba(16,24,20,0.12)`): the resting shadow of every card and the primary and danger buttons.
- **Lift** (`box-shadow: 0 12px 40px -16px rgba(16,24,20,0.28)`): menus, popovers and dialogs that float above the page (the navbar user menu and `Modal`).

### Named Rules
**The Paper First Rule.** Separate with tone and a rule before reaching for a shadow. Only the two named shadows exist; no others.

## Shapes

Generous, friendly rounding with one radius per scale of object: 8px (`lg`) for small icon buttons, 14px (`xl`) for buttons, inputs and selects, 18px (`2xl`) for cards and panels, and fully round for badges, pills and avatars. Borders are always one pixel in the theme's rule colour. The brand mark is the dotted-C: transparent, set directly on paper, or in white directly on a coloured band. Use the `BrandMark` component. It ships the mark trimmed to its own edges (`/icon.png`) and swaps in a lightness-lifted variant (`/icon-dark.png`) under Console so the deep dots stay visible on near-black. Size it 28px beside the 18px wordmark.

## Components

### Buttons
Confident but quiet: solid forest or mint for the one primary action, outlined or ghost for everything else.
- **Shape:** gently rounded (14px), 600 weight, heights 36 / 40 / 48px for sm / md / lg.
- **Primary:** brand fill with brand-fg text and the Soft shadow.
- **Secondary:** surface fill, rule border, ink text. **Outline:** the same on a transparent ground. **Ghost:** no fill, 80% ink text.
- **Danger:** red-600 fill, white text, darkens on hover.
- **Hover / Focus / Active:** primary dims to 90% opacity; secondary, outline and ghost gain a 4–6% ink wash. Focus shows a 2px ring in the theme's ring colour at full strength (≥3:1 on the page) with a 2px offset on the page colour. Pressing scales to 98% over 150ms. Loading swaps in a 16px spinner; disabled is 50% opacity.

### Badges
- **Style:** fully rounded pill, 600 weight, 1px border. Default is a 6% ink wash with 70% ink text. Status variants (success, warning, error, info) use a 15% tinted fill, a 20% tinted border and `-800` (Verdant) or `-300` (Console) text.
- **Sizes:** sm (2px × 8px, 12px text) and md (4px × 10px, 14px text).

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** surface (Verdant Sheet / Console Panel) on the page colour.
- **Shadow Strategy:** Soft at rest (see Elevation & Depth).
- **Border:** 1px rule.
- **Internal Padding:** 24px default; 12–16px for dense data panels.

### Inputs / Fields
- **Style:** surface fill, 1px `line-strong` border (#858c86 Verdant / #56695f Console, ≥3:1 on page and cards so the field edge is identifiable), 14px radius, 10px × 14px padding, 14px text (16px on touch screens so iOS never zooms), muted placeholder, a tiny shadow.
- **Focus:** a solid 2px edge in the theme `ring` colour (1px border + 1px ring), the same colour as every other focus indicator.
- **Error:** keyed on `aria-invalid`: full `critical` border and a `critical` focus ring, and a 14px `critical` helper line below (or a linked `Alert`, as on sign-in). **Disabled:** 50% opacity, not-allowed cursor.
- **One spec, three components:** `Input`, `Select` and `Textarea` share the exact same field classes. Use them rather than styling a raw `<select>`/`<input>`; the only native exceptions are compact filters in tight toolbars, which copy the same field classes.
- **Checkboxes and radios** stay native and take `accent-color: brand` globally.

### Focus, dialogs and motion
- **Focus:** every focusable element shows a 2px `ring` outline at full strength (≥3:1 on the page) with a 2px offset (global `:focus-visible`); components with their own ring (Button, fields, `.focus-ring`) keep theirs. A "Skip to content" link is the first Tab stop.
- **Dialogs:** every overlay uses `useDialogFocus` (focus moves in, Tab is trapped, focus returns to the opener, and focus lost to a re-render is pulled back). `Modal` closes on Escape; flows that must be finished or explicitly skipped (onboarding) are non-dismissible and ignore Escape.
- **Menus** are disclosures: `aria-expanded` + `aria-controls`, Escape closes and returns focus to the trigger.
- **Reduced motion:** state changes stay; movement goes. Skeleton pulses become a static 70% fill, the press scale is dropped, and scrolling jumps instead of gliding. Spinners keep turning because they report progress.

### Segmented controls
- A bordered group of buttons (period, export format). The selected segment is a quiet `fg` 8% wash with ink text and `aria-pressed`, never a second brand fill: the surface's one brand moment stays its primary action.

### Not-yet-available settings
- A setting with no backend yet is shown disabled, under a default "Coming soon" badge and a one-line note, never as a live control that silently doesn't save.

### Navigation
- **Style:** a sticky top bar on 80% surface with backdrop blur and a bottom rule. The brand mark is 28px with the Archivo SemiExpanded wordmark at 1.125rem. The sign-in page has no top bar: its brand panel carries a 72px mark with a 2rem wordmark, and the theme toggle sits in the top-end corner. Links are 14px grotesk.
- **States:** links sit at 80% ink and gain a 5% ink wash on hover. Icon buttons rest in muted and turn ink on hover.
- **Menus:** dropdowns group items under uppercase 11px labels separated by rules.
- **Mobile and tablet:** below the `nav` screen (68em) the links collapse behind a menu button (`aria-expanded`). The menu carries everything the desktop user menu does (Profile, Glossary, Sign out), so no destination is desktop-only.

### Signature: Theme toggle
The theme toggle in the navbar moves between the greenhouse and the control room. It is the one control that changes the room rather than the content.

## Do's and Don'ts

### Do:
- **Do** use the semantic tokens (`bg`, `surface`, `fg`, `muted`, `line`, `brand`, `brand-fg`, `accent`, `ring`, `emphasis`, `positive`, `caution`, `critical`, `info`) so every screen works in both Verdant and Console.
- **Do** keep one brand accent moment per surface: Deep Forest in Verdant, Console Mint in Console.
- **Do** set every `h1`–`h4` and the wordmark in Archivo SemiExpanded and everything else in Hanken Grotesk; use JetBrains Mono for formulas, factor codes and credentials.
- **Do** use 14px radius on controls and 18px on cards, with 1px rule borders.
- **Do** separate with tone and rules first; use only the Soft and Lift shadows.
- **Do** place the dotted-C mark transparent on the page, or white directly on a coloured band.
- **Do** keep layouts RTL-ready with logical properties (start/end, not left/right); Arabic is a committed language.

### Don't:
- **Don't** place the logo on a white box, chip or tile.
- **Don't** use generic SaaS gradients: no purple or blue gradient heroes, glassy blobs or startup-template looks.
- **Don't** use cartoon eco clichés: no leaves, globes, earth-in-hands or smokestack illustrations.
- **Don't** use red, amber and green as decoration or category colour; reserve them for real status.
- **Don't** hard-code hex colours in components, or add a third shadow, radius or accent.
