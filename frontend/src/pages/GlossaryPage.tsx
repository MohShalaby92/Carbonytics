import React from 'react';
import { Card } from '../components/ui/Card';
import { BookOpen } from 'lucide-react';

/**
 * Glossary & methodology reference (§10 P2): plain-language definitions of the
 * GHG-accounting concepts the product uses — scopes, GWP, Scope 2 dual reporting,
 * data quality, base year/consolidation and the Egyptian context. A standing
 * reference linked from the user menu.
 */

interface Term {
  term: string;
  def: string;
}
interface Section {
  title: string;
  intro?: string;
  terms: Term[];
}

const SECTIONS: Section[] = [
  {
    title: 'Emission scopes',
    intro: 'The GHG Protocol splits emissions into three scopes by who controls the source.',
    terms: [
      {
        term: 'Scope 1 — Direct',
        def: 'Emissions from sources the organization owns or controls — on-site fuel combustion, company vehicles, and fugitive (refrigerant) releases.',
      },
      {
        term: 'Scope 2 — Indirect (energy)',
        def: 'Indirect emissions from purchased electricity, steam, heat and cooling that the organization consumes.',
      },
      {
        term: 'Scope 3 — Value chain',
        def: 'All other indirect emissions across the value chain (15 categories) — purchased goods & services, business travel, commuting, waste, transport, use of sold products, and more.',
      },
    ],
  },
  {
    title: 'Core concepts',
    terms: [
      {
        term: 'Activity data',
        def: 'The measured quantity of an emitting activity for the period (e.g. kWh of electricity, litres of fuel, tonne-kilometres of freight).',
      },
      {
        term: 'Emission factor',
        def: 'A published or measured coefficient that converts activity data into emissions, e.g. kg CO₂e per kWh. Stored as versioned reference data, never hard-coded.',
      },
      {
        term: 'CO₂e (carbon dioxide equivalent)',
        def: 'A common unit expressing the warming effect of all greenhouse gases relative to CO₂, using GWP, so a single number can be summed across gases.',
      },
      {
        term: 'GWP (Global Warming Potential)',
        def: 'The warming effect of a gas over 100 years relative to CO₂ (CO₂ = 1). Methane and nitrous oxide are many times stronger than CO₂ per kilogram.',
      },
      {
        term: 'GWP set (AR4 / AR5 / AR6)',
        def: 'Successive IPCC assessment reports publish updated GWP values. The set is fixed per published reporting year, so historical figures don’t shift when the organization later switches sets.',
      },
      {
        term: 'Method hierarchy',
        def: 'Prefer supplier-specific (primary) data, then activity data × an average factor, then spend-based screening — climb the hierarchy for the most material sources.',
      },
    ],
  },
  {
    title: 'Scope 2 dual reporting',
    terms: [
      {
        term: 'Location-based',
        def: 'Scope 2 calculated with the average emissions intensity of the local grid — in Egypt, the EEHC / IEA grid factor.',
      },
      {
        term: 'Market-based',
        def: 'Scope 2 reflecting contractual instruments (green tariffs, PPAs, RECs). Where no such market exists, it falls back to the grid average.',
      },
      {
        term: 'Dual reporting',
        def: 'The GHG Protocol Scope 2 Guidance requires reporting both the location- and market-based figures.',
      },
    ],
  },
  {
    title: 'Data quality & completeness',
    terms: [
      {
        term: 'PCAF data-quality score (1–5)',
        def: 'A 1 (best — measured / primary) to 5 (worst — estimated) score per data line; the inventory reports an emissions-weighted average.',
      },
      {
        term: 'Primary vs secondary data',
        def: 'Primary = supplier-specific or measured; secondary = database / average factors. CDP and SBTi expect the primary share to rise over time.',
      },
      {
        term: 'Completeness',
        def: 'The share of relevant, material sources actually quantified, versus documented exclusions or undocumented gaps.',
      },
      {
        term: 'Materiality (Pareto)',
        def: 'The “vital few” sources that drive most of the footprint — where reduction effort pays off most (the 80/20 rule).',
      },
      {
        term: 'Estimate / gap-filling',
        def: 'A value derived from history or proxies when measured data is missing — always flagged and forced to the lowest quality so it stays distinguishable from measured data.',
      },
    ],
  },
  {
    title: 'Inventory management',
    terms: [
      {
        term: 'Base year',
        def: 'A fixed reference year against which targets and progress are measured; its figures are frozen at publication.',
      },
      {
        term: 'Recalculation policy',
        def: 'When structural changes (acquisitions, methodology changes) or errors move the base year beyond a set threshold (commonly 5%), the base year is restated.',
      },
      {
        term: 'Consolidation approach',
        def: 'How the organization counts emissions from entities it part-owns — equity share, financial control, or operational control. Applied at report time; stored figures stay 100% gross.',
      },
      {
        term: 'Biogenic CO₂',
        def: 'CO₂ from biomass combustion, reported as a separate memo OUTSIDE the scope totals per the GHG Protocol; biomass CH₄ / N₂O remain in Scope 1.',
      },
      {
        term: 'Audit trail & calculation lineage',
        def: 'An immutable record of who calculated what — each reported number traces to its input rows, the factor (and the pinned version) and the evidence that produced it.',
      },
    ],
  },
  {
    title: 'Egyptian context',
    terms: [
      {
        term: 'Egyptian-default factors',
        def: 'Carbonytics defaults to Egyptian emission factors (EEHC / IEA grid, local fuels) where available, above other regional sets. Users can override per calculation.',
      },
      {
        term: 'No contractual-instrument market',
        def: 'Egypt has no established green-instrument market, so the market-based Scope 2 method falls back to the grid average until such instruments exist.',
      },
      {
        term: 'Currency',
        def: 'Spend-based inputs default to Egyptian Pounds (EGP); deflate spend to a factor’s base year before applying a spend-based factor.',
      },
    ],
  },
];

export const GlossaryPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-start gap-3">
        <span className="grid place-items-center w-11 h-11 rounded-xl bg-primary-500/10 text-primary-600 shrink-0">
          <BookOpen className="w-6 h-6" />
        </span>
        <div>
          <h1 className="text-3xl font-bold text-fg">Glossary &amp; Methodology</h1>
          <p className="mt-2 text-muted">
            Plain-language definitions of the GHG-accounting concepts Carbonytics uses — scopes, GWP,
            Scope 2 dual reporting, data quality, and the Egyptian context.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <Card key={section.title} className="p-6">
            <h2 className="text-lg font-semibold text-fg mb-1">{section.title}</h2>
            {section.intro && <p className="text-sm text-muted mb-4">{section.intro}</p>}
            <dl className="divide-y divide-line">
              {section.terms.map((t) => (
                <div key={t.term} className="py-3 grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4">
                  <dt className="text-sm font-semibold text-fg md:col-span-1">{t.term}</dt>
                  <dd className="text-sm text-muted md:col-span-2 leading-relaxed">{t.def}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted mt-6">
        Preparation reference only — for formal reporting follow the GHG Protocol Corporate Standard,
        the Scope 2 Guidance and your disclosure framework’s own requirements.
      </p>
    </div>
  );
};
