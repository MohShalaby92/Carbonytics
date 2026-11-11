import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { organizationService } from '../../services/organizationService';
import { complianceService } from '../../services/complianceService';
import { calculationService } from '../../services/calculationService';
import { EmissionCategory } from '../../types';
import { Leaf, Building2, Scale, ClipboardCheck, Divide, CheckCircle2, AlertTriangle, Circle, ArrowRight, ArrowLeft } from 'lucide-react';

/**
 * Guided onboarding wizard (§10): takes a freshly-registered organization from
 * "name + industry only" to an audit-ready starting configuration — boundary +
 * consolidation approach, methodology (GWP set) + a first reporting year,
 * relevance screening, and (optionally) intensity denominators. Each step
 * persists through the existing audited endpoints; progress is tracked in the
 * organization's onboarding state so it can be resumed or skipped.
 */

const INDUSTRIES = [
  'Technology/Software', 'Manufacturing', 'Financial Services', 'Healthcare', 'Education',
  'Retail/E-commerce', 'Construction', 'Transportation', 'Energy/Utilities',
  'Tourism/Hospitality', 'Agriculture', 'Other',
];

const CONSOLIDATION = [
  { value: 'operational_control', label: 'Operational control', hint: 'Account for 100% of emissions from operations you control. The most common choice.' },
  { value: 'financial_control', label: 'Financial control', hint: 'Account for operations over which you have financial control.' },
  { value: 'equity_share', label: 'Equity share', hint: 'Account for emissions in proportion to your ownership share.' },
];

const GWP_SETS = [
  { value: 'AR6', label: 'AR6 (IPCC 2021)', hint: 'Latest IPCC assessment — recommended default.' },
  { value: 'AR5', label: 'AR5 (IPCC 2013)', hint: 'Still required by some disclosure regimes.' },
  { value: 'AR4', label: 'AR4 (IPCC 2007)', hint: 'Legacy — use only if mandated.' },
];

const SCOPE_LABELS: Record<number, string> = { 1: 'Scope 1 — Direct', 2: 'Scope 2 — Energy', 3: 'Scope 3 — Value chain' };

interface Props {
  onClose: (reason: 'completed' | 'skipped') => void;
}

export const OnboardingWizard: React.FC<Props> = ({ onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, true);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — organization profile + boundary
  const [industry, setIndustry] = useState('Technology/Software');
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [country, setCountry] = useState('Egypt');
  const [consolidation, setConsolidation] = useState('operational_control');

  // Step 2 — methodology + reporting year
  const [gwpSet, setGwpSet] = useState<'AR4' | 'AR5' | 'AR6'>('AR6');
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear());

  // Step 3 — relevance screening
  const [categories, setCategories] = useState<EmissionCategory[]>([]);
  const [relevant, setRelevant] = useState<Set<string>>(new Set());

  // Step 4 — intensity denominators
  const [revenue, setRevenue] = useState('');
  const [employees, setEmployees] = useState('');

  // Load the org's current values + categories once.
  useEffect(() => {
    (async () => {
      try {
        const [org, cats] = await Promise.all([
          organizationService.getOrganization(),
          calculationService.getEmissionCategories(),
        ]);
        if (org.industry) setIndustry(org.industry);
        if ((org as any).size && ['small', 'medium', 'large'].includes((org as any).size)) setSize((org as any).size);
        if (org.country) setCountry(org.country);
        if ((org as any).consolidationApproach) setConsolidation((org as any).consolidationApproach);
        if (org.settings?.gwpSet) setGwpSet(org.settings.gwpSet);
        setCategories(cats.categories || []);
        setRelevant(new Set((org.relevantCategories || []) as string[]));
      } catch {
        /* fall back to defaults */
      }
    })();
  }, []);

  const byScope = useMemo(() => {
    const groups: Record<number, EmissionCategory[]> = { 1: [], 2: [], 3: [] };
    categories.forEach((c) => groups[c.scope]?.push(c));
    return groups;
  }, [categories]);

  const toggle = (id: string) =>
    setRelevant((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const setOnboardingStep = (s: number) =>
    organizationService.updateOnboarding({ currentStep: s }).catch(() => {});

  /** Persist the current step, then advance. Errors block advancement. */
  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      if (step === 1) {
        await organizationService.updateOrganization({
          industry, size, country, consolidationApproach: consolidation,
        } as any);
      } else if (step === 2) {
        await organizationService.updateSettings({ gwpSet });
        try {
          await complianceService.createInventory(Number(reportingYear));
        } catch (e: any) {
          // A reporting year that already exists is fine — keep going.
          if (!/already has an inventory/i.test(e?.response?.data?.message || '')) throw e;
        }
      } else if (step === 3) {
        await complianceService.updateRelevantCategories([...relevant]);
      } else if (step === 4) {
        const denominators: any[] = [];
        if (Number(revenue) > 0)
          denominators.push({ year: Number(reportingYear), metric: 'revenue', value: Number(revenue), unit: 'EGP' });
        if (Number(employees) > 0)
          denominators.push({ year: Number(reportingYear), metric: 'employees', value: Number(employees), unit: 'FTE' });
        if (denominators.length > 0) await complianceService.updateDenominators(denominators);
      }
      const nextStep = step + 1;
      setStep(nextStep);
      setOnboardingStep(nextStep);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not save this step');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const skip = async () => {
    setBusy(true);
    try {
      await organizationService.updateOnboarding({ skipped: true });
    } catch {
      /* close anyway */
    } finally {
      setBusy(false);
      onClose('skipped');
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await organizationService.updateOnboarding({ completed: true });
    } catch {
      /* close anyway */
    } finally {
      setBusy(false);
      onClose('completed');
    }
  };

  const STEPS = ['Welcome', 'Organization', 'Methodology', 'Relevant sources', 'Intensity', 'Done'];
  const TOTAL = STEPS.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* Non-dismissible on purpose: leaving is "Skip for now", which is saved, so Escape must not trigger it. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-bg border border-line shadow-lift focus:outline-none"
      >
        {/* Header / progress */}
        <div className="sticky top-0 bg-bg border-b border-line px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-emphasis" />
              <h2 id="onboarding-title" className="font-semibold text-fg text-base">Set up your GHG inventory</h2>
            </div>
            {step > 0 && step < TOTAL - 1 && (
              <span className="text-xs text-muted">Step {step} of {TOTAL - 2}</span>
            )}
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-fg/10 overflow-hidden" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={TOTAL - 1} aria-valuenow={step}>
            <div className="h-full bg-brand transition-all" style={{ width: `${(step / (TOTAL - 1)) * 100}%` }} />
          </div>
        </div>

        <div className="px-6 py-6">
          {error && (
            <div role="alert" className="mb-4 p-3 rounded-lg border border-red-500/25 bg-red-500/10 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Step 0 — Welcome */}
          {step === 0 && (
            <div className="text-center py-4">
              <div className="mx-auto w-14 h-14 rounded-2xl -brand/15 flex items-center justify-center mb-4">
                <Leaf className="w-7 h-7 text-emphasis" />
              </div>
              <h2 className="text-2xl font-bold text-fg mb-2">Welcome to Carbonytics</h2>
              <p className="text-muted max-w-md mx-auto">
                Let's get your organization ready to produce a credible, audit-ready GHG inventory.
                This takes about a minute — we'll set your boundary, methodology, the emission sources
                relevant to you, and an optional intensity denominator. You can change anything later.
              </p>
              <ul className="text-sm text-fg/80 mt-5 space-y-2 max-w-sm mx-auto text-start">
                <li className="flex items-center gap-2"><Building2 className="w-4 h-4 text-emphasis" /> Organizational boundary & consolidation</li>
                <li className="flex items-center gap-2"><Scale className="w-4 h-4 text-emphasis" /> Methodology (GWP set) & first reporting year</li>
                <li className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-emphasis" /> Relevance screening of emission sources</li>
                <li className="flex items-center gap-2"><Divide className="w-4 h-4 text-emphasis" /> Intensity denominator (optional)</li>
              </ul>
            </div>
          )}

          {/* Step 1 — Organization */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-fg flex items-center gap-2"><Building2 className="w-5 h-5 text-emphasis" /> Your organization</h2>
                <p className="text-sm text-muted mt-1">Defines the reporting entity and the GHG Protocol organizational boundary.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Select label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Select label="Organization size" value={size} onChange={(e) => setSize(e.target.value as any)}>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-fg/80">Consolidation approach (organizational boundary)</label>
                <div className="space-y-2">
                  {CONSOLIDATION.map((c) => (
                    <label key={c.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${consolidation === c.value ? '-brand/50 bg-brand/10' : 'border-line hover:bg-fg/[0.03]'}`}>
                      <input type="radio" name="consolidation" className="mt-0.5" checked={consolidation === c.value} onChange={() => setConsolidation(c.value)} />
                      <span><span className="text-sm font-medium text-fg">{c.label}</span><span className="block text-xs text-muted">{c.hint}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Methodology + reporting year */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-fg flex items-center gap-2"><Scale className="w-5 h-5 text-emphasis" /> Methodology & reporting year</h2>
                <p className="text-sm text-muted mt-1">The GWP set converts each gas to CO₂e. We'll create your first reporting-year inventory.</p>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-fg/80">Global Warming Potential set</label>
                {GWP_SETS.map((g) => (
                  <label key={g.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${gwpSet === g.value ? '-brand/50 bg-brand/10' : 'border-line hover:bg-fg/[0.03]'}`}>
                    <input type="radio" name="gwp" className="mt-0.5" checked={gwpSet === g.value} onChange={() => setGwpSet(g.value as any)} />
                    <span><span className="text-sm font-medium text-fg">{g.label}</span><span className="block text-xs text-muted">{g.hint}</span></span>
                  </label>
                ))}
              </div>
              <div className="space-y-1 max-w-[12rem]">
                <Input label="First reporting year" type="number" min="2000" max="2100" value={reportingYear} onChange={(e) => setReportingYear(parseInt(e.target.value, 10) || new Date().getFullYear())} />
              </div>
            </div>
          )}

          {/* Step 3 — Relevance screening */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-fg flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-emphasis" /> Which sources are relevant?</h2>
                <p className="text-sm text-muted mt-1">Select the emission categories relevant to your operations. Completeness is measured against this set — a relevant source with no data and no documented exclusion is flagged as a gap.</p>
              </div>
              <div className="space-y-4">
                {[1, 2, 3].map((scope) => (
                  <div key={scope}>
                    <p className="text-sm font-medium text-fg/80 mb-2">{SCOPE_LABELS[scope]}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {byScope[scope].map((c) => (
                        <label key={c.id} className={`flex items-center gap-2.5 p-2 rounded-lg border text-sm cursor-pointer transition-colors ${relevant.has(c.id) ? '-brand/40 bg-brand/10' : 'border-line hover:bg-fg/[0.03]'}`}>
                          <input type="checkbox" className="rounded border-line" checked={relevant.has(c.id)} onChange={() => toggle(c.id)} />
                          <span className="flex-1 text-fg/90">{c.category}</span>
                          {relevant.has(c.id) ? <CheckCircle2 className="w-4 h-4 text-positive" /> : <Circle className="w-4 h-4 text-muted/40" />}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 — Denominators */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-fg flex items-center gap-2"><Divide className="w-5 h-5 text-emphasis" /> Intensity denominator <span className="text-xs font-normal text-muted">(optional)</span></h2>
                <p className="text-sm text-muted mt-1">Add a {reportingYear} figure to report intensity (kg CO₂e per unit). You can skip this and add denominators later under Compliance → Intensity & Denominators.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Input label="Annual revenue (EGP)" type="number" min="0" step="any" value={revenue} placeholder="e.g. 50000000" onChange={(e) => setRevenue(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Input label="Employees (FTE)" type="number" min="0" step="any" value={employees} placeholder="e.g. 120" onChange={(e) => setEmployees(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 5 — Done */}
          {step === 5 && (
            <div className="text-center py-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-green-500/15 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-positive" />
              </div>
              <h2 className="text-2xl font-bold text-fg mb-2">You're set up</h2>
              <p className="text-muted max-w-md mx-auto">
                Your boundary, methodology and relevant sources are configured, and your {reportingYear} reporting
                year is ready. Next: add activity data in the Calculator, or manage facilities, suppliers and
                exclusions under Compliance.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" /> Tip: publish the reporting year (Compliance → Reporting Years) once data entry is complete to lock it.
              </div>
            </div>
          )}
        </div>

        {/* Footer / nav */}
        <div className="sticky bottom-0 bg-bg border-t border-line px-6 py-4 flex items-center justify-between">
          <div>
            {step > 0 && step < TOTAL - 1 && (
              <Button variant="ghost" size="sm" onClick={back} disabled={busy}>
                <ArrowLeft className="w-4 h-4 me-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < TOTAL - 1 && (
              <Button variant="ghost" size="sm" onClick={skip} disabled={busy}>Skip for now</Button>
            )}
            {step === 0 && (
              <Button onClick={() => { setStep(1); setOnboardingStep(1); }}>Get started <ArrowRight className="w-4 h-4 ms-1" /></Button>
            )}
            {step > 0 && step < TOTAL - 1 && (
              <Button onClick={next} loading={busy}>
                {step === TOTAL - 2 ? 'Finish setup' : 'Continue'} <ArrowRight className="w-4 h-4 ms-1" />
              </Button>
            )}
            {step === TOTAL - 1 && (
              <Button onClick={finish} loading={busy}>Go to dashboard</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
