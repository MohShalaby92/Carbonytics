import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { complianceService } from '../../services/complianceService';
import {
  LineageReport,
  LineageScope,
  LineageCategory,
  LineageCalculation,
  LineageLine,
  LineageEvidence,
  RecomputeCheckResult,
  RecomputeEntry,
} from '../../types';
import {
  Network,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Paperclip,
  Pin,
  FlaskConical,
  Building2,
  Lock,
  Download,
  ShieldCheck,
} from 'lucide-react';

/**
 * Calculation-lineage drill-down (§7): from any reported scope/category number,
 * drill down to the exact contributing calculations and data lines — each with
 * its derived formula (value × factor = emissions), the factor + pinned version,
 * data-quality, supplier/Scope-2 provenance and evidence chain. Line-sums are
 * reconciled against the headline report figures at every level.
 */

const fmt = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const dqVariant = (s?: number): 'success' | 'info' | 'warning' | 'error' | 'default' =>
  s == null ? 'default' : s <= 2 ? 'success' : s <= 3 ? 'info' : s <= 4 ? 'warning' : 'error';

const ReconBadge: React.FC<{ reconciled: boolean; residual: number }> = ({ reconciled, residual }) =>
  reconciled ? (
    <Badge variant="success" size="sm">
      <CheckCircle2 className="w-3 h-3 mr-1" /> reconciled
    </Badge>
  ) : (
    <Badge variant="warning" size="sm">
      <AlertTriangle className="w-3 h-3 mr-1" /> residual {fmt(residual)}
    </Badge>
  );

/** A single contributing data line: the formula + full provenance + evidence. */
const LineDetail: React.FC<{ line: LineageLine; recompute?: RecomputeEntry }> = ({ line, recompute }) => {
  const downloadEvidence = (ev: LineageEvidence) =>
    complianceService.downloadEvidence({ id: ev.id, filename: ev.filename } as any);

  return (
    <div className="rounded-lg border border-line bg-fg/[0.02] p-3 space-y-2">
      {/* Headline: activity → emissions */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-sm text-fg/90">
          <span className="font-medium">{fmt(line.value)} {line.unit}</span>
          <span className="text-muted"> activity</span>
        </span>
        <span className="text-sm font-semibold tabular-nums text-fg">{fmt(line.emissions)} kg CO₂e</span>
      </div>

      {/* The exact derived formula — the centerpiece of the drill-down. */}
      <div className="rounded-md bg-fg/[0.04] border border-line px-3 py-2">
        <p className="font-mono text-xs leading-relaxed text-fg/90 break-words">{line.formula}</p>
      </div>

      {/* Factor + pinned version provenance */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted">factor:</span>
        <span className="text-fg/90 font-medium">{line.factorName || '— (unnamed legacy factor)'}</span>
        {(line.factorSource || line.factorYear) && (
          <span className="text-muted">
            ({[line.factorSource, line.factorYear].filter(Boolean).join(' ')})
          </span>
        )}
        {line.versionPinned ? (
          <Badge variant="info" size="sm" className="ml-1">
            <Pin className="w-3 h-3 mr-1" /> v{line.factorVersion} pinned
          </Badge>
        ) : (
          <span
            className="ml-1 text-muted italic"
            title="Saved before factor-version pinning (§3). Reproducible against the current factor, but not pinned to an immutable version."
          >
            unpinned
          </span>
        )}
      </div>

      {/* Deterministic recompute verdict (§3, overlaid on demand) */}
      {recompute && (
        <div className="text-xs">
          {!recompute.recomputeSupported ? (
            <span className="text-muted inline-flex items-center gap-1" title={recompute.note}>
              not recomputable
            </span>
          ) : recompute.matches ? (
            <span className="text-green-700 dark:text-green-400 inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> reproduced ({fmt(recompute.recomputedEmissions)} kg)
              {recompute.factorChangedSincePin && (
                <span
                  className="ml-1 text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5"
                  title={`Live factor (v${recompute.currentFactorVersion}) would now give ${fmt(
                    recompute.liveEmissions
                  )} kg — the pinned version preserves the original`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> factor drifted
                </span>
              )}
            </span>
          ) : (
            <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> mismatch (recomputed{' '}
              {fmt(recompute.recomputedEmissions)} vs stored {fmt(recompute.storedEmissions)} kg)
            </span>
          )}
        </div>
      )}

      {/* Method / GWP / DQ / estimate badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        {line.method && (
          <Badge variant="default" size="sm">{line.method}</Badge>
        )}
        {line.gwpApplied && (
          <Badge variant="default" size="sm">
            GWP {line.gwpApplied === 'per-gas' ? `per-gas · ${line.gwpSet || ''}` : 'embedded'}
          </Badge>
        )}
        {line.dqScore != null && (
          <span title="PCAF data-quality score (1 best … 5)">
            <Badge variant={dqVariant(line.dqScore)} size="sm">DQ {line.dqScore}</Badge>
          </span>
        )}
        {line.isEstimate && (
          <span title={line.estimationMethod}>
            <Badge variant="warning" size="sm">
              <FlaskConical className="w-3 h-3 mr-1" /> estimate
            </Badge>
          </span>
        )}
        {line.supplierName && (
          <Badge variant="info" size="sm">
            <Building2 className="w-3 h-3 mr-1" /> {line.supplierName}
          </Badge>
        )}
      </div>

      {/* Scope 2 dual reporting */}
      {line.scope2Market != null && (
        <p className="text-xs text-muted">
          Scope 2 dual — location {fmt(line.scope2Location)} · market {fmt(line.scope2Market)} kg CO₂e
          {line.scope2MarketMethod ? ` · ${line.scope2MarketMethod}` : ''}
        </p>
      )}

      {/* Biogenic CO2 memo */}
      {line.biogenicCO2 != null && line.biogenicCO2 > 0 && (
        <p className="text-xs text-muted">
          Biogenic CO₂ memo: {fmt(line.biogenicCO2)} kg (reported outside the scope total)
        </p>
      )}

      {/* Evidence chain */}
      {line.evidenceCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted inline-flex items-center gap-1">
            <Paperclip className="w-3.5 h-3.5" /> evidence ({line.evidenceCount}):
          </span>
          {line.evidence.map((ev) => (
            <button
              key={ev.id}
              onClick={() => downloadEvidence(ev)}
              className="text-xs inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 hover:underline"
              title={`${ev.contentType} · ${ev.size} bytes`}
            >
              <Download className="w-3 h-3" /> {ev.filename}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const LineageTab: React.FC<{ initialPeriod?: { start: string; end: string } | null }> = ({
  initialPeriod,
}) => {
  const yr = new Date().getFullYear();
  const [start, setStart] = useState(initialPeriod?.start || `${yr}-01-01`);
  const [end, setEnd] = useState(initialPeriod?.end || `${yr}-12-31`);
  const [lineage, setLineage] = useState<LineageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expansion state — scopes default open for immediate context.
  const [openScopes, setOpenScopes] = useState<Set<number>>(new Set([1, 2, 3]));
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openCalcs, setOpenCalcs] = useState<Set<string>>(new Set());

  // Deterministic recompute-check results, overlaid per calculation on demand (§3).
  const [recompute, setRecompute] = useState<Record<string, RecomputeCheckResult>>({});
  const [checking, setChecking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setRecompute({});
    try {
      setLineage(await complianceService.getLineage(start, end));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load lineage');
      setLineage(null);
    } finally {
      setLoading(false);
    }
  };

  const runCheck = async (calcId: string) => {
    setChecking(calcId);
    try {
      const res = await complianceService.getRecomputeCheck(calcId);
      setRecompute((prev) => ({ ...prev, [calcId]: res }));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Recompute check failed');
    } finally {
      setChecking(null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = <T,>(set: Set<T>, key: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <Network className="w-5 h-5 text-primary-600" />
        <h2 className="text-xl font-semibold text-fg">Calculation Lineage</h2>
      </div>
      <p className="text-sm text-muted mb-4">
        From any reported number, drill down to the exact input rows, factors and formulas that produced
        it. Each data line shows <span className="font-mono text-xs">value × factor = emissions</span>,
        the factor used and its pinned immutable version, the data-quality score, supplier / Scope-2
        provenance, and the evidence chain. Line-sums are reconciled against the headline figures.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="space-y-1">
          <label className="block text-xs text-muted">Period start</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted">Period end</label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button variant="outline" onClick={load}>
          Load lineage
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted py-6 text-center">Loading…</p>
      ) : !lineage ? (
        <p className="text-sm text-muted py-6 text-center">No lineage for this period.</p>
      ) : (
        <>
          {/* Total reconciliation banner */}
          <div
            className={`mb-5 p-4 rounded-lg border flex items-center justify-between gap-3 flex-wrap ${
              lineage.totals.reconciled
                ? 'bg-green-500/10 border-green-500/25'
                : 'bg-amber-500/10 border-amber-500/25'
            }`}
          >
            <div>
              <p className="text-sm font-semibold text-fg">
                Reported total {fmt(lineage.reportTotals.total)} kg CO₂e
                <span className="text-muted font-normal">
                  {' '}· {lineage.totals.lineCount} data line{lineage.totals.lineCount === 1 ? '' : 's'} ·{' '}
                  {lineage.reportingYear}
                  {lineage.gwpSet ? ` · ${lineage.gwpSet}${lineage.gwpSetPinned ? ' (pinned)' : ''}` : ''}
                </span>
              </p>
              <p className="text-xs text-muted mt-0.5">
                Sum of contributing lines {fmt(lineage.totals.lineSum)} kg
                {lineage.totals.reconciled
                  ? ' — fully reconciled to the report.'
                  : ` — residual ${fmt(lineage.totals.residual)} kg.`}
              </p>
            </div>
            <ReconBadge reconciled={lineage.totals.reconciled} residual={lineage.totals.residual} />
          </div>

          {/* Scope → category → calculation → line drill-down */}
          <div className="space-y-2">
            {lineage.scopes.map((s: LineageScope) => {
              const sOpen = openScopes.has(s.scope);
              return (
                <div key={s.scope} className="rounded-lg border border-line overflow-hidden">
                  <button
                    onClick={() => toggle(openScopes, s.scope, setOpenScopes)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-fg/[0.03] hover:bg-fg/[0.05] transition-colors text-left"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {sOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      <span className="font-semibold text-fg">{s.label}</span>
                      <span className="text-xs text-muted">
                        {s.categories.length} categor{s.categories.length === 1 ? 'y' : 'ies'} · {s.lineCount} lines
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums text-fg">{fmt(s.reportedEmissions)} kg</span>
                      <ReconBadge reconciled={s.reconciled} residual={s.residual} />
                    </span>
                  </button>

                  {sOpen && (
                    <div className="px-3 py-2 space-y-2">
                      {s.categories.map((c: LineageCategory) => {
                        const cKey = `s${s.scope}:${c.category}`;
                        const cOpen = openCats.has(cKey);
                        const primary = c.dataSources?.primarySharePercent;
                        return (
                          <div key={cKey} className="rounded-md border border-line">
                            <button
                              onClick={() => toggle(openCats, cKey, setOpenCats)}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-fg/[0.03] transition-colors text-left"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                {cOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                                <span className="font-medium text-fg/90 truncate">{c.category}</span>
                                <span className="text-xs text-muted shrink-0">
                                  {c.calculations.length} calc{c.calculations.length === 1 ? '' : 's'} · {c.lineCount} lines
                                  {primary != null ? ` · ${primary}% primary` : ''}
                                </span>
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                <span className="text-sm tabular-nums text-fg/90">{fmt(c.reportedEmissions)} kg</span>
                                <ReconBadge reconciled={c.reconciled} residual={c.residual} />
                              </span>
                            </button>

                            {cOpen && (
                              <div className="px-3 pb-3 pt-1 space-y-2">
                                {c.calculations.map((calc: LineageCalculation) => {
                                  const calcKey = `${cKey}:${calc.calculationId}`;
                                  const calcOpen = openCalcs.has(calcKey);
                                  const rc = recompute[calc.calculationId];
                                  return (
                                    <div key={calcKey} className="rounded-md border border-line/70 bg-fg/[0.02]">
                                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                                        <button
                                          onClick={() => toggle(openCalcs, calcKey, setOpenCalcs)}
                                          className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity text-left"
                                        >
                                          {calcOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                                          <span className="text-sm text-fg/90 truncate">{calc.title || '(untitled)'}</span>
                                          {calc.status === 'locked' && (
                                            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                          )}
                                          {calc.facilityName && (
                                            <span className="text-xs text-muted shrink-0">· {calc.facilityName}</span>
                                          )}
                                          <span className="text-xs text-muted shrink-0">· {calc.lineCount} line{calc.lineCount === 1 ? '' : 's'}</span>
                                        </button>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="text-sm tabular-nums text-fg/80">{fmt(calc.lineSum)} kg</span>
                                          {rc ? (
                                            <Badge
                                              variant={rc.summary.mismatches > 0 ? 'error' : rc.deterministic ? 'success' : 'warning'}
                                              size="sm"
                                            >
                                              {rc.summary.mismatches > 0
                                                ? 'mismatch'
                                                : rc.deterministic
                                                ? 'deterministic'
                                                : 'reproducible'}
                                            </Badge>
                                          ) : (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => runCheck(calc.calculationId)}
                                              loading={checking === calc.calculationId}
                                            >
                                              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Check
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      {calcOpen && (
                                        <div className="px-3 pb-3 pt-1 space-y-2">
                                          {calc.lines.map((line) => (
                                            <LineDetail
                                              key={`${line.calculationId}:${line.entryIndex}`}
                                              line={line}
                                              recompute={rc?.entries.find((e) => e.index === line.entryIndex)}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted mt-4">{lineage.note}</p>
        </>
      )}
    </Card>
  );
};
