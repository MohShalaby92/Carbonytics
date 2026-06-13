import React from 'react';
import { Card } from '../../components/ui/Card';
import { CompletenessResult } from '../../types';
import { ClipboardCheck, ArrowRight } from 'lucide-react';

interface CompletenessCardProps {
  completeness?: CompletenessResult | null;
}

/**
 * Dashboard completeness summary (GHG Protocol completeness): relevant
 * categories covered vs documented-excluded vs undocumented gaps, for the
 * trailing 12 months. Links to the Compliance → Completeness screen for the
 * full relevance-screening editor.
 */
export const CompletenessCard: React.FC<CompletenessCardProps> = ({ completeness }) => {
  if (!completeness) return null;

  const { completenessPercent: pct, relevantCount, coveredCount, excludedCount, gapCount, screened } =
    completeness;
  const pctColor = pct >= 90 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';
  const barColor = pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-fg">Completeness</h3>
        </div>
        <a
          href="/compliance"
          className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          Screen <ArrowRight className="w-3 h-3" />
        </a>
      </div>

      {!screened ? (
        <p className="text-sm text-muted mb-4">
          No categories screened for relevance yet. Screen relevant categories to surface coverage
          gaps before assurance.
        </p>
      ) : (
        <div className="mb-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-fg/80">Coverage (last 12 months)</span>
            <span className={`text-2xl font-bold ${pctColor}`}>{pct}%</span>
          </div>
          <div className="mt-2 w-full bg-fg/[0.08] rounded-full h-2">
            <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Relevant', value: relevantCount, color: 'text-fg' },
          { label: 'Covered', value: coveredCount, color: 'text-green-600' },
          { label: 'Excluded', value: excludedCount, color: 'text-blue-600' },
          { label: 'Gaps', value: gapCount, color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="p-2 bg-fg/[0.04] rounded-lg">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {gapCount > 0 && (
        <p className="mt-3 text-xs text-red-700 dark:text-red-300">
          {gapCount} relevant {gapCount === 1 ? 'category has' : 'categories have'} no data and no
          documented exclusion.
        </p>
      )}
    </Card>
  );
};
