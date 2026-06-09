import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { CheckCircle, AlertTriangle, XCircle, Info, HelpCircle } from 'lucide-react';

interface QualityIndicatorsProps {
  calculations: any[];
}

/**
 * Data-quality summary derived from the quality rating the calculation engine
 * stored on each entry when it was saved (factor quality, regional specificity,
 * data recency). Entries saved before quality tracking existed count as Unrated.
 */
export const QualityIndicators: React.FC<QualityIndicatorsProps> = ({ calculations }) => {
  const [showHelp, setShowHelp] = useState(false);

  const entries = (calculations || []).flatMap((calc) =>
    Array.isArray(calc.data) ? calc.data : []
  );

  const counts = { high: 0, medium: 0, low: 0, unrated: 0 };
  entries.forEach((entry: any) => {
    if (entry.quality === 'high') counts.high++;
    else if (entry.quality === 'medium') counts.medium++;
    else if (entry.quality === 'low') counts.low++;
    else counts.unrated++;
  });

  const total = entries.length;
  const rated = counts.high + counts.medium + counts.low;
  const averageQuality =
    rated > 0 ? ((counts.high * 3 + counts.medium * 2 + counts.low * 1) / rated / 3) * 100 : 0;

  const helpPanel = showHelp && (
    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/25 rounded-lg text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
      <p className="font-medium">How quality is assessed</p>
      <p>
        Every saved entry gets a rating from the calculation engine based on the emission
        factor it used:
      </p>
      <ul className="list-disc ml-4 space-y-1">
        <li><strong>High</strong> — region-specific (e.g. Egyptian) factor from an authoritative source, recent year.</li>
        <li><strong>Medium</strong> — global factor or minor uncertainty (e.g. unit conversion involved).</li>
        <li><strong>Low</strong> — estimated/baseline factor with high uncertainty (validate before reporting).</li>
        <li><strong>Unrated</strong> — saved before quality tracking was enabled.</li>
      </ul>
      <p>Improve your score by choosing Egyptian-specific factors and recent factor years.</p>
    </div>
  );

  if (total === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-fg">Data Quality</h3>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="text-muted hover:text-fg transition-colors"
            aria-label="What does data quality mean?"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
        {helpPanel}
        <div className="text-center py-4">
          <Info className="w-8 h-8 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">No calculations to assess</p>
        </div>
      </Card>
    );
  }

  const indicators = [
    {
      label: 'High Quality',
      count: counts.high,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-500/10',
      description: 'Region-specific factors, recent data',
    },
    {
      label: 'Medium Quality',
      count: counts.medium,
      icon: AlertTriangle,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      description: 'Global factors, some uncertainty',
    },
    {
      label: 'Low Quality',
      count: counts.low,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-500/10',
      description: 'Estimated factors, high uncertainty',
    },
    ...(counts.unrated > 0
      ? [{
          label: 'Unrated',
          count: counts.unrated,
          icon: Info,
          color: 'text-muted',
          bgColor: 'bg-fg/[0.04]',
          description: 'Saved before quality tracking',
        }]
      : []),
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-fg">Data Quality</h3>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="text-muted hover:text-fg transition-colors"
          aria-label="What does data quality mean?"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {helpPanel}

      {/* Overall Quality Score (rated entries only) */}
      <div className="mb-6 p-4 bg-fg/[0.04] rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg/80">Overall Quality Score</span>
          <span className="text-2xl font-bold text-primary-600">
            {rated > 0 ? `${averageQuality.toFixed(0)}%` : '—'}
          </span>
        </div>
        <div className="mt-2 w-full bg-fg/[0.08] rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${averageQuality}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Across {total} saved {total === 1 ? 'entry' : 'entries'}
          {counts.unrated > 0 ? ` (${counts.unrated} unrated excluded from the score)` : ''}
        </p>
      </div>

      {/* Quality Breakdown */}
      <div className="space-y-3">
        {indicators.map((indicator, index) => {
          const Icon = indicator.icon;
          const percentage = total > 0 ? ((indicator.count / total) * 100).toFixed(0) : '0';
          return (
            <div key={index} className={`p-3 ${indicator.bgColor} rounded-lg`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Icon className={`w-5 h-5 ${indicator.color}`} />
                  <div>
                    <p className={`font-medium ${indicator.color}`}>{indicator.label}</p>
                    <p className="text-xs text-muted">{indicator.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${indicator.color}`}>{indicator.count}</p>
                  <p className="text-xs text-muted">{percentage}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <div className="mt-4 pt-4 border-t border-line">
        <p className="text-xs text-muted">
          💡 <strong>Tip:</strong> Use Egyptian-specific emission factors when available for higher accuracy
        </p>
      </div>
    </Card>
  );
};
