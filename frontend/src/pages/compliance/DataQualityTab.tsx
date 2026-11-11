import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { complianceService } from '../../services/complianceService';
import { DataQualityTrend } from '../../types';
import { Gauge, TrendingDown, TrendingUp, Minus } from 'lucide-react';

/**
 * Data quality (§5): the primary-vs-secondary data-source split per category
 * (CDP asks for it) and the year-over-year DQ trend (SBTi expects 5s to move
 * toward 1s and primary share to rise).
 */
const dqColor = (s: number | null) =>
  s == null ? 'text-muted' : s <= 2 ? 'text-positive' : s <= 3.5 ? 'text-caution' : 'text-critical';

/** Heatmap cell styling for a pedigree score (1 best … 5 worst — lower is better). */
const pedCell = (s: number | null | undefined) =>
  s == null
    ? 'text-muted'
    : s <= 2
    ? 'bg-green-500/15 text-green-800 dark:text-green-300'
    : s <= 3.5
    ? 'bg-amber-400/20 text-amber-800 dark:text-amber-300'
    : 'bg-red-500/15 text-red-800 dark:text-red-300';

const PED_DIMS: [string, string][] = [
  ['Technological', 'technological'],
  ['Temporal', 'temporal'],
  ['Geographical', 'geographical'],
  ['Completeness', 'completeness'],
  ['Reliability', 'reliability'],
  ['Overall', 'overall'],
];

export const DataQualityTab: React.FC = () => {
  const year = new Date().getFullYear();
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(`${year}-12-31`);
  const [report, setReport] = useState<any>(null);
  const [trend, setTrend] = useState<DataQualityTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    try {
      setError(null);
      setReport(await complianceService.getGhgInventoryReport(start, end));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load report');
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      complianceService.getGhgInventoryReport(start, end).then(setReport).catch(() => setReport(null)),
      complianceService.getDataQualityTrend().then(setTrend).catch(() => setTrend(null)),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ds = report?.dataQuality?.dataSources;
  const byCategory: any[] = report?.emissions?.byCategory || [];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <Gauge className="w-5 h-5 text-emphasis" />
          <h2 className="text-xl font-semibold text-fg">Data Quality</h2>
        </div>
        <p className="text-sm text-muted mb-4">
          Primary data (supplier-specific / measured) is the top of the GHG Protocol method hierarchy;
          secondary data uses database/average factors. CDP asks for the primary share per category and
          SBTi expects it to rise over time.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div className="space-y-1">
            <Input label="Period start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Input label="Period end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button variant="outline" onClick={loadReport}>
            Recompute
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted py-6 text-center">Loading…</p>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="rounded-lg border border-line p-3">
                <p className={`text-2xl font-bold ${dqColor(report?.dataQuality?.weightedDqScore ?? null)}`}>
                  {report?.dataQuality?.weightedDqScore ?? '—'}
                </p>
                <p className="text-xs text-muted mt-1">weighted DQ (1 best … 5)</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-bold text-positive">{ds ? `${ds.primarySharePercent}%` : '—'}</p>
                <p className="text-xs text-muted mt-1">primary data</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-semibold text-fg/80">{ds ? `${ds.secondarySharePercent}%` : '—'}</p>
                <p className="text-xs text-muted mt-1">secondary data</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-semibold text-caution">
                  {report?.dataQuality?.estimates?.emissionsShare ?? 0}%
                </p>
                <p className="text-xs text-muted mt-1">estimated (gap-filled)</p>
              </div>
            </div>

            {/* Per-category primary/secondary bars */}
            <h3 className="text-sm font-semibold text-fg/80 mb-2">Primary vs secondary by category</h3>
            <div className="space-y-2.5">
              {byCategory.map((c) => {
                const cds = c.dataSources || { primarySharePercent: 0, secondarySharePercent: 0 };
                return (
                  <div key={c.category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-fg/90">
                        {c.category} <span className="text-muted">· S{c.scope} · {c.emissions?.toLocaleString()} kg</span>
                      </span>
                      <span className="text-fg/70">{cds.primarySharePercent}% primary</span>
                    </div>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-fg/[0.06]">
                      <div
                        className="bg-green-500/80 h-full"
                        style={{ width: `${cds.primarySharePercent}%` }}
                        title={`Primary ${cds.primarySharePercent}%`}
                      />
                      <div
                        className="bg-amber-400/70 h-full"
                        style={{ width: `${cds.secondarySharePercent}%` }}
                        title={`Secondary ${cds.secondarySharePercent}%`}
                      />
                    </div>
                  </div>
                );
              })}
              {byCategory.length === 0 && (
                <p className="text-sm text-muted py-2">No category data for this period.</p>
              )}
            </div>
            <p className="text-xs text-muted mt-2">
              <span className="inline-block w-3 h-2 rounded-sm bg-green-500/80 mb-0.5" /> primary (supplier-specific /
              measured) · <span className="inline-block w-3 h-2 rounded-sm bg-amber-400/70 mb-0.5" /> secondary
              (database/average factor, incl. estimates)
            </p>

            {/* GHG-Protocol pedigree matrix (§48) */}
            {report?.dataQuality?.pedigree?.overall != null && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-fg/80 mb-1">
                  GHG-Protocol pedigree matrix (data-quality indicators)
                </h3>
                <p className="text-xs text-muted mb-3">
                  Every data line is scored 1 (best) … 5 (worst) across the five GHG Protocol Scope 3
                  data-quality dimensions, then emissions-weighted. Lower is better.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-xs text-muted">
                        <th className="text-start font-medium py-2 pe-3" />
                        {PED_DIMS.map(([label]) => (
                          <th key={label} className="font-medium px-2 py-2 text-center whitespace-nowrap">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-line">
                        <td className="py-1.5 pe-3 font-medium text-fg/90 whitespace-nowrap">
                          Organization <span className="text-muted">(weighted)</span>
                        </td>
                        {PED_DIMS.map(([, key]) => {
                          const v = report.dataQuality.pedigree[key];
                          return (
                            <td key={key} className="px-1 py-1 text-center">
                              <span className={`inline-block min-w-[2.25rem] rounded px-2 py-0.5 font-medium tabular-nums ${pedCell(v)}`}>
                                {v ?? '—'}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                      {byCategory
                        .filter((c) => c.pedigree && c.pedigree.overall != null)
                        .map((c) => (
                          <tr key={c.category} className="border-t border-line/50">
                            <td className="py-1.5 pe-3 text-fg/80 whitespace-nowrap">
                              {c.category} <span className="text-muted">· S{c.scope}</span>
                            </td>
                            {PED_DIMS.map(([, key]) => {
                              const v = c.pedigree[key];
                              return (
                                <td key={key} className="px-1 py-1 text-center">
                                  <span className={`inline-block min-w-[2.25rem] rounded px-2 py-0.5 tabular-nums ${pedCell(v)}`}>
                                    {v ?? '—'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted mt-2">
                  <span className="inline-block w-3 h-2 rounded-sm bg-green-500/40 mb-0.5" /> 1–2 strong ·{' '}
                  <span className="inline-block w-3 h-2 rounded-sm bg-amber-400/50 mb-0.5" /> 3–3.5 moderate ·{' '}
                  <span className="inline-block w-3 h-2 rounded-sm bg-red-500/40 mb-0.5" /> 4–5 weak. Derived from
                  factor vintage, region, source tier, method and gas coverage — no fabricated values.
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Year-over-year trend */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-fg mb-1">Year-over-year improvement</h3>
        <p className="text-sm text-muted mb-4">
          The strategic point of data-quality scoring: move the weighted PCAF score toward 1 and raise the
          primary-data share each year.
        </p>
        {trend && trend.years.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-muted border-b border-line">
                  <th className="py-2 pe-4 font-medium">Year</th>
                  <th className="py-2 pe-4 font-medium text-end">Emissions (kg)</th>
                  <th className="py-2 pe-4 font-medium text-end">Weighted DQ</th>
                  <th className="py-2 pe-4 font-medium text-end">Primary %</th>
                  <th className="py-2 font-medium">YoY</th>
                </tr>
              </thead>
              <tbody>
                {trend.years.map((y) => (
                  <tr key={y.year} className="border-b border-line/50">
                    <td className="py-2 pe-4 font-medium text-fg/90">{y.year}</td>
                    <td className="py-2 pe-4 text-end tabular-nums text-fg/80">{y.totalEmissions.toLocaleString()}</td>
                    <td className={`py-2 pe-4 text-end tabular-nums font-medium ${dqColor(y.weightedDqScore)}`}>
                      {y.weightedDqScore ?? '—'}
                    </td>
                    <td className="py-2 pe-4 text-end tabular-nums text-fg/80">{y.primarySharePercent}%</td>
                    <td className="py-2">
                      {y.improving === undefined ? (
                        <span className="text-xs text-muted">—</span>
                      ) : y.improving ? (
                        <span className="text-xs text-green-800 dark:text-green-400 inline-flex items-center gap-1">
                          <TrendingDown className="w-3.5 h-3.5" /> improving
                          {y.dqScoreDelta != null && ` (DQ ${y.dqScoreDelta > 0 ? '+' : ''}${y.dqScoreDelta})`}
                        </span>
                      ) : y.dqScoreDelta != null && y.dqScoreDelta > 0 ? (
                        <span className="text-xs text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" /> DQ worsened (+{y.dqScoreDelta})
                        </span>
                      ) : (
                        <span className="text-xs text-muted inline-flex items-center gap-1">
                          <Minus className="w-3.5 h-3.5" /> flat
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted py-2">No multi-year history yet.</p>
        )}
      </Card>
    </div>
  );
};
