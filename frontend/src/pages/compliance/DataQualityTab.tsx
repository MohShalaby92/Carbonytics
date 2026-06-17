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
  s == null ? 'text-muted' : s <= 2 ? 'text-green-600' : s <= 3.5 ? 'text-yellow-600' : 'text-red-600';

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
          <Gauge className="w-5 h-5 text-primary-600" />
          <h2 className="text-xl font-semibold text-fg">Data Quality</h2>
        </div>
        <p className="text-sm text-muted mb-4">
          Primary data (supplier-specific / measured) is the top of the GHG Protocol method hierarchy;
          secondary data uses database/average factors. CDP asks for the primary share per category and
          SBTi expects it to rise over time.
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
                <p className="text-2xl font-bold text-green-600">{ds ? `${ds.primarySharePercent}%` : '—'}</p>
                <p className="text-xs text-muted mt-1">primary data</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-semibold text-fg/80">{ds ? `${ds.secondarySharePercent}%` : '—'}</p>
                <p className="text-xs text-muted mt-1">secondary data</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-2xl font-semibold text-yellow-600">
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
                <tr className="text-left text-xs text-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Year</th>
                  <th className="py-2 pr-4 font-medium text-right">Emissions (kg)</th>
                  <th className="py-2 pr-4 font-medium text-right">Weighted DQ</th>
                  <th className="py-2 pr-4 font-medium text-right">Primary %</th>
                  <th className="py-2 font-medium">YoY</th>
                </tr>
              </thead>
              <tbody>
                {trend.years.map((y) => (
                  <tr key={y.year} className="border-b border-line/50">
                    <td className="py-2 pr-4 font-medium text-fg/90">{y.year}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg/80">{y.totalEmissions.toLocaleString()}</td>
                    <td className={`py-2 pr-4 text-right tabular-nums font-medium ${dqColor(y.weightedDqScore)}`}>
                      {y.weightedDqScore ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg/80">{y.primarySharePercent}%</td>
                    <td className="py-2">
                      {y.improving === undefined ? (
                        <span className="text-xs text-muted">—</span>
                      ) : y.improving ? (
                        <span className="text-xs text-green-700 dark:text-green-400 inline-flex items-center gap-1">
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
