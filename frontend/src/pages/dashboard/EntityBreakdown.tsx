import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { complianceService } from '../../services/complianceService';
import { ConsolidationResult } from '../../types';
import { formatEmissions } from '../../utils/calculations';
import { Building2, ChevronRight, X } from 'lucide-react';

/**
 * Emissions by entity/site (§8 drill-down dimension): the per-entity roll-up
 * from the consolidation service (§1.2) — gross 100% activity vs the org's
 * reported share under the chosen consolidation approach. Clicking a site drills
 * the whole dashboard into it (sets the facility filter), the entity/site
 * dimension the scope/category charts otherwise lack.
 */

type Approach = 'equity_share' | 'operational_control' | 'financial_control';
const APPROACHES: { value: Approach; label: string }[] = [
  { value: 'operational_control', label: 'Operational control' },
  { value: 'financial_control', label: 'Financial control' },
  { value: 'equity_share', label: 'Equity share' },
];

interface EntityBreakdownProps {
  period: { start: string; end: string } | null;
  selectedFacilityId: string;
  onSelectFacility: (id: string) => void;
}

export const EntityBreakdown: React.FC<EntityBreakdownProps> = ({
  period,
  selectedFacilityId,
  onSelectFacility,
}) => {
  const [approach, setApproach] = useState<Approach>('operational_control');
  const [data, setData] = useState<ConsolidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!period) return;
    setLoading(true);
    setError(null);
    complianceService
      .getConsolidation(period.start, period.end, approach)
      .then(setData)
      .catch((e: any) => setError(e?.response?.data?.message || e?.message || 'Failed to load entities'))
      .finally(() => setLoading(false));
  }, [period?.start, period?.end, approach]);

  const maxGross = data && data.byEntity.length > 0 ? Math.max(...data.byEntity.map((e) => e.gross), 1) : 1;
  const selectedName = data?.byEntity.find((e) => e.entityId === selectedFacilityId)?.name;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emphasis" />
          <h2 className="text-lg font-semibold text-fg">Emissions by Entity / Site</h2>
        </div>
        <select
          value={approach}
          onChange={(e) => setApproach(e.target.value as Approach)}
          className="px-3 py-1.5 rounded-xl border border-line-strong bg-surface text-sm [@media(pointer:coarse)]:text-base text-fg shadow-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          aria-label="Consolidation approach"
        >
          {APPROACHES.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted mb-4">
        Per-entity roll-up under the selected consolidation approach — gross (100% activity) vs the
        organization's reported share. Click a site to drill the dashboard into it.
      </p>

      {selectedFacilityId && (
        <div className="mb-3 flex items-center justify-between gap-2 py-2 px-3 -brand/10 border -brand/25 rounded-lg text-sm">
          <span className="text-fg/80 min-w-0 truncate">
            Dashboard filtered to: <span className="font-medium">{selectedName || 'selected site'}</span>
          </span>
          <button
            onClick={() => onSelectFacility('')}
            className="text-xs inline-flex items-center gap-1 text-emphasis hover:text-fg hover:underline shrink-0"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted py-4 text-center">Loading…</p>
      ) : !data || data.byEntity.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">No entity-tagged emissions in this period.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4 text-center">
            <div className="rounded-lg border border-line p-2">
              <p className="text-sm font-bold text-fg">{formatEmissions(data.grossTotal)}</p>
              <p className="text-xs text-muted">gross</p>
            </div>
            <div className="rounded-lg border border-line p-2">
              <p className="text-sm font-bold text-fg">{formatEmissions(data.consolidatedTotal)}</p>
              <p className="text-xs text-muted">consolidated</p>
            </div>
            <div className="rounded-lg border border-line p-2">
              <p className="text-sm font-bold text-emphasis">{data.overallSharePercent}%</p>
              <p className="text-xs text-muted">share</p>
            </div>
          </div>

          <div className="space-y-2">
            {data.byEntity.map((e) => {
              const clickable = !!e.entityId;
              const selected = !!e.entityId && e.entityId === selectedFacilityId;
              const pctOfTotal =
                data.grossTotal > 0 ? Math.round((e.gross / data.grossTotal) * 1000) / 10 : 0;
              return (
                <button
                  key={e.entityId || 'unassigned'}
                  disabled={!clickable}
                  onClick={() => clickable && onSelectFacility(selected ? '' : e.entityId as string)}
                  className={`w-full text-start rounded-lg border p-3 transition-colors ${
                    selected ? 'border-brand/50 -brand/10' : 'border-line'
                  } ${clickable ? 'hover:bg-fg/[0.04] cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-fg truncate">{e.name}</span>
                      {e.entityType && <span className="text-xs text-muted shrink-0">{e.entityType}</span>}
                      {e.sharePercent !== 100 && (
                        <span className="text-xs text-muted shrink-0">· {e.sharePercent}% share</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums text-fg">
                        {formatEmissions(e.consolidated)}
                      </span>
                      {clickable && <ChevronRight className="w-4 h-4 text-muted" />}
                    </span>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-fg/[0.06]">
                    <div
                      className="-brand/70 h-full"
                      style={{ width: `${(e.gross / maxGross) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted">
                    <span>gross {formatEmissions(e.gross)}</span>
                    <span>{pctOfTotal}% of total</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
};
